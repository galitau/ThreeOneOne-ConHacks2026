"""Automated Geospatial Sentinel — FastAPI entry point.
- Fixes 'PARSE_JSON in VALUES' Snowflake error by using SELECT.
- Handles UUIDs as strings to support social media IDs.
- Uses Gemini 2.5 Flash for Grounded Search and Spatial Understanding.
"""
from __future__ import annotations
import asyncio, base64, json, os, time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import snowflake.connector
from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types as genai_types

# ── Config ──────────────────────────────────────────────────────────────────

def _load_dotenv(path=".env"):
    if not os.path.exists(path): return
    for raw in open(path):
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ: os.environ[k] = v

_load_dotenv()

SNOWFLAKE_ACCOUNT   = os.getenv("SNOWFLAKE_ACCOUNT")
SNOWFLAKE_USER      = os.getenv("SNOWFLAKE_USER")
SNOWFLAKE_PASSWORD  = os.getenv("SNOWFLAKE_PASSWORD")
GEMINI_API_KEY      = os.getenv("GEMINI_API_KEY")

MODEL_DEEP = "gemini-2.5-flash"
GEMINI_SEMAPHORE = asyncio.Semaphore(1)

# ── Snowflake ────────────────────────────────────────────────────────────────

def _sf_connect():
    return snowflake.connector.connect(
        account=SNOWFLAKE_ACCOUNT, user=SNOWFLAKE_USER,
        password=SNOWFLAKE_PASSWORD, warehouse=os.getenv("SNOWFLAKE_WAREHOUSE", "HACKATHON_WH"),
        autocommit=True,
    )

def _ensure_verified_table(cursor):
    cursor.execute("USE DATABASE THREE_ONE_ONE")
    cursor.execute("USE SCHEMA RAW")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS VERIFIED_HAZARDS (
            ID                INT AUTOINCREMENT PRIMARY KEY,
            SIGNAL_ID         STRING,  
            SOURCE            STRING,
            INGESTED_AT       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            LAT               FLOAT,
            LON               FLOAT,
            HAZARD_TYPE       STRING,
            DESCRIPTION       STRING,
            IS_HAZARD         BOOLEAN,
            CONFIDENCE_SCORE  FLOAT,
            VERIFICATION_NOTE STRING,
            RAW_JSON          VARIANT
        )
    """)
    for col in ["VERIFICATION_NOTE STRING", "RAW_JSON VARIANT"]:
        try: cursor.execute(f"ALTER TABLE VERIFIED_HAZARDS ADD COLUMN IF NOT EXISTS {col}")
        except: pass

def _fetch_recent_signals(cursor, batch_size):
    cursor.execute("USE DATABASE THREE_ONE_ONE")
    cursor.execute("USE SCHEMA RAW")
    cursor.execute("""
        SELECT ID::STRING as ID, SOURCE, REPORT_TEXT, LATITUDE, LONGITUDE, 
               IMAGE_MIME_TYPE, IMAGE_BASE64
        FROM INCOMING_SIGNALS
        WHERE IMAGE_BASE64 IS NOT NULL AND IMAGE_BASE64 != ''
        ORDER BY CREATED_AT DESC
        LIMIT %s
    """, (batch_size,))
    cols = [d[0].lower() for d in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]

# ── Gemini ───────────────────────────────────────────────────────────────────

async def _deep_analyse_with_retry(client, image_base64, mime_type, text, lat, lon, retries=3):
    async with GEMINI_SEMAPHORE:
        for attempt in range(retries):
            try:
                prompt = (
                    "You are a Geospatial Sentinel. Analyse image/text for hazards. "
                    "Use Google Search for context. Respond ONLY JSON:\n"
                    '{"is_hazard":true,"hazard_type":"...","confidence":0.9,"lat":0.0,"lon":0.0,"description":"..."}'
                )
                img = genai_types.Part.from_bytes(data=base64.b64decode(image_base64), mime_type=mime_type or "image/jpeg")
                config = genai_types.GenerateContentConfig(tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())])
                
                resp = await asyncio.to_thread(client.models.generate_content, model=MODEL_DEEP, contents=[img, prompt], config=config)
                raw = (resp.text or "").strip()
                if "```" in raw: raw = raw.split("```")[1].lstrip("json").strip()
                return json.loads(raw)
            except Exception as e:
                if "429" in str(e) and attempt < retries - 1:
                    await asyncio.sleep((attempt + 1) * 35)
                else: raise e

# ── Pipeline ─────────────────────────────────────────────────────────────────

async def _process_signal(signal, client):
    sid = str(signal["id"])
    try:
        result = await _deep_analyse_with_retry(client, signal['image_base64'], signal['image_mime_type'], 
                                              signal.get('report_text', ""), signal.get('latitude'), signal.get('longitude'))
        
        record = {
            "signal_id": sid, "source": str(signal.get("source", "unknown")),
            "lat": result.get("lat") or signal.get("latitude") or 0.0,
            "lon": result.get("lon") or signal.get("longitude") or 0.0,
            "hazard_type": result.get("hazard_type", "Other"),
            "description": result.get("description", "AI Verified Hazard"),
            "is_hazard": bool(result.get("is_hazard", False)),
            "confidence_score": float(result.get("confidence", 0.5)),
            "verification_note": "Verified via Gemini 2.5 Flash Grounded Search",
        }

        with _sf_connect() as conn:
            cur = conn.cursor()
            _ensure_verified_table(cur)
            # FIX: Using INSERT INTO ... SELECT to support PARSE_JSON()
            cur.execute("""
                INSERT INTO VERIFIED_HAZARDS (SIGNAL_ID, SOURCE, LAT, LON, HAZARD_TYPE, 
                DESCRIPTION, IS_HAZARD, CONFIDENCE_SCORE, VERIFICATION_NOTE, RAW_JSON)
                SELECT %s, %s, %s, %s, %s, %s, %s, %s, %s, PARSE_JSON(%s)
            """, (sid, record["source"], record["lat"], record["lon"], record["hazard_type"],
                  record["description"], record["is_hazard"], record["confidence_score"], 
                  record["verification_note"], json.dumps(record)))
            print(f"[Sentinel] ✓ Signal {sid} verified.")
    except Exception as e:
        print(f"[Sentinel] ✗ Failed {sid}: {e}")

async def run_pipeline():
    print(f"\n[Sentinel] ═══ Pipeline started {datetime.now(timezone.utc).isoformat()} ═══")
    try:
        with _sf_connect() as conn:
            signals = _fetch_recent_signals(conn.cursor(), 4)
    except Exception as e:
        print(f"[Sentinel] Snowflake Error: {e}"); return

    if not signals:
        print("[Sentinel] No fresh signals found."); return

    client = genai.Client(api_key=GEMINI_API_KEY)
    for s in signals:
        await _process_signal(s, client)
    print(f"[Sentinel] ═══ Pipeline complete ═══\n")

# ── FastAPI ──────────────────────────────────────────────────────────────────

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/process-incoming")
async def process_incoming(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_pipeline)
    return {"status": "accepted"}