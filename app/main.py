from fastapi import FastAPI, BackgroundTasks
import os
import json
import requests
import snowflake.connector
from dotenv import load_dotenv
from app.services.pipeline import process_report

load_dotenv()

app = FastAPI()
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

INCOMING_TABLE = "THREE_ONE_ONE.RAW.INCOMING_SIGNALS"
VERIFIED_TABLE = "THREE_ONE_ONE.RAW.VERIFIED_HAZARDS"


def get_conn():
    return snowflake.connector.connect(
        user=os.getenv('SNOWFLAKE_USER'),
        password=os.getenv('SNOWFLAKE_PASSWORD'),
        account=os.getenv('SNOWFLAKE_ACCOUNT'),
        warehouse='HACKATHON_WH',
        database='THREE_ONE_ONE',
        schema='RAW',
    )


def push_ml_results(signal_id, lat, lng, hazard_type, description, is_hazard, confidence):
    conn = get_conn()
    cursor = conn.cursor()
    try:
        sql = f"""
        INSERT INTO {VERIFIED_TABLE} (
            SIGNAL_ID, SOURCE, INGESTED_AT, LAT, LON,
            GEOG_POINT, HAZARD_TYPE, DESCRIPTION,
            IS_HAZARD, CONFIDENCE_SCORE
        )
        SELECT %s, 'AI_Enrichment', CURRENT_TIMESTAMP(), %s, %s,
               ST_MAKEPOINT(%s, %s), %s, %s, %s, %s
        """
        cursor.execute(sql, (
            str(signal_id), lat, lng,
            lng, lat,
            hazard_type, description,
            is_hazard, confidence
        ))
        conn.commit()
    finally:
        cursor.close()
        conn.close()


@app.get("/process-incoming")
async def process_incoming_signals(background_tasks: BackgroundTasks, limit: int = 5):
    """
    Fetches signals pre-filtered for location signals and processes up to `limit` of them.
    Query param: ?limit=10 to process more in one call (default 5).
    """
    conn = get_conn()
    cursor = conn.cursor()
    try:
        # FIX 1: Pre-filter in SQL — only pull rows whose text contains street/location
        #   keywords OR already have coordinates embedded in RAW_JSON.
        #   Cast a wide net (LIMIT 50) so we have enough candidates to fill `limit` slots
        #   after Gemini rejects posts with no locatable image content.
        query = f"""
            SELECT ID, RAW_JSON
            FROM {INCOMING_TABLE}
            WHERE RAW_JSON:image_url::STRING IS NOT NULL
              AND RAW_JSON:text::STRING       IS NOT NULL
              AND (
                -- Already has GPS coordinates from the scraper
                (RAW_JSON:lat::FLOAT  IS NOT NULL AND RAW_JSON:lat::FLOAT  != 0)
                OR (RAW_JSON:coordinates[0]::FLOAT IS NOT NULL AND RAW_JSON:coordinates[0]::FLOAT != 0)
                -- Text mentions a street, intersection, or named place
                OR RAW_JSON:text::STRING ILIKE ANY (
                    '% street%','% st.%',' st %',
                    '% avenue%','% ave.%',' ave %',
                    '% boulevard%','% blvd%',
                    '% road%',' rd %','% drive%',
                    '% highway%','% hwy%','% freeway%',
                    '% intersection%','%corner of%',
                    '% near %','% at %','% block%',
                    '% downtown%','% uptown%','% district%',
                    '% bridge%','% tunnel%','% overpass%',
                    '% station%','% airport%','% park%'
                )
              )
            ORDER BY CREATED_AT DESC
            LIMIT 50
        """
        cursor.execute(query)
        rows = cursor.fetchall()

        processed_count = 0
        for row_id, raw_json_val in rows:
            if processed_count >= limit:
                break

            data = raw_json_val if isinstance(raw_json_val, dict) else json.loads(raw_json_val)
            text      = data.get("text", "")
            image_url = data.get("image_url")

            if not text or not image_url:
                continue

            # FIX 2: If the scraper already embedded coordinates, use them directly
            #   and skip Gemini location inference entirely.
            existing_lat = data.get("lat") or (
                data.get("coordinates", [None, None])[1]  # GeoJSON is [lon, lat]
                if isinstance(data.get("coordinates"), list) and len(data.get("coordinates", [])) >= 2
                else None
            )
            existing_lon = data.get("lon") or data.get("lng") or (
                data.get("coordinates", [None, None])[0]
                if isinstance(data.get("coordinates"), list) and len(data.get("coordinates", [])) >= 2
                else None
            )

            # FIX 3: Pass the post text as location_hint so Gemini has real context
            #   instead of the useless hardcoded "Unknown".
            location_hint = text[:300]  # first 300 chars is plenty for street/city context

            # Download image
            image_path = os.path.join(UPLOAD_DIR, f"{row_id}.jpg")
            try:
                resp = requests.get(image_url, timeout=10)
                if resp.status_code == 200:
                    with open(image_path, 'wb') as f:
                        f.write(resp.content)
                else:
                    print(f"Skipping ID={row_id}: Image download failed ({resp.status_code}).")
                    continue
            except Exception as e:
                print(f"Skipping ID={row_id}: Image download error — {e}")
                continue

            report = {
                "text": text,
                "lat": existing_lat,
                "lng": existing_lon,
                "image_path": image_path,
                "location_hint": location_hint,   # passed through to pipeline
            }
            result   = process_report(report)
            analysis = result.get("image_analysis") or {}

            # Use Gemini-determined location, falling back to scraper coords if available
            loc = analysis.get("determined_location")
            final_lat = (loc or {}).get("lat") or existing_lat
            final_lon = (loc or {}).get("lng") or existing_lon

            if not final_lat or not final_lon:
                print(f"Skipping ID={row_id}: No coordinates from AI or scraper.")
                continue

            print(f"Verified ID={row_id}: {analysis.get('type','?')} @ ({final_lat},{final_lon})")
            background_tasks.add_task(
                push_ml_results,
                row_id,
                final_lat,
                final_lon,
                analysis.get("type", "Other"),
                analysis.get("reason", "Verified via AI"),
                bool(result["hazard"]),
                float(analysis.get("image_confidence", 0.0))
            )
            processed_count += 1

        return {"status": "success", "signals_processed": processed_count}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        cursor.close()
        conn.close()