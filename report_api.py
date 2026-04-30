"""Local API for submitting nearby problem reports to Snowflake.

The Vite dev server proxies /api requests to this service on port 8000. The
endpoint accepts multipart form submissions from the report screen, converts
the uploaded photo to base64, and stores the complete payload in
THREE_ONE_ONE.RAW.INCOMING_SIGNALS.
"""

from __future__ import annotations

import base64
import json
import os
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from email.parser import BytesParser
from email.policy import default as email_default_policy
from typing import Any

import snowflake.connector


def load_dotenv_file(path: str = ".env") -> None:
    """Load simple KEY=VALUE pairs from a local .env file if it exists."""

    if not os.path.exists(path):
        return

    with open(path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def get_env_or_placeholder(name: str, placeholder: str) -> str:
    value = os.getenv(name)
    if value:
        return value
    return placeholder


load_dotenv_file()

SNOWFLAKE_ACCOUNT = get_env_or_placeholder("SNOWFLAKE_ACCOUNT", "<YOUR_SNOWFLAKE_ACCOUNT>")
SNOWFLAKE_USER = get_env_or_placeholder("SNOWFLAKE_USER", "<YOUR_SNOWFLAKE_USER>")
SNOWFLAKE_PASSWORD = get_env_or_placeholder("SNOWFLAKE_PASSWORD", "<YOUR_SNOWFLAKE_PASSWORD>")
SNOWFLAKE_WAREHOUSE = get_env_or_placeholder("SNOWFLAKE_WAREHOUSE", "<YOUR_SNOWFLAKE_WAREHOUSE>")

TARGET_TABLE = "THREE_ONE_ONE.RAW.INCOMING_SIGNALS"
HOST = os.getenv("REPORT_API_HOST", "127.0.0.1")
# Keep report API off FastAPI's default port to avoid local routing conflicts.
PORT = int(os.getenv("REPORT_API_PORT", "8001"))


def validate_configuration() -> None:
    required_values = {
        "SNOWFLAKE_ACCOUNT": SNOWFLAKE_ACCOUNT,
        "SNOWFLAKE_USER": SNOWFLAKE_USER,
        "SNOWFLAKE_PASSWORD": SNOWFLAKE_PASSWORD,
        "SNOWFLAKE_WAREHOUSE": SNOWFLAKE_WAREHOUSE,
    }

    missing = [name for name, value in required_values.items() if value.startswith("<YOUR_")]
    if missing:
        raise ValueError(
            "Set the following environment variables or replace the placeholders before running: "
            + ", ".join(missing)
        )


def connect_to_snowflake() -> snowflake.connector.SnowflakeConnection:
    try:
        return snowflake.connector.connect(
            account=SNOWFLAKE_ACCOUNT,
            user=SNOWFLAKE_USER,
            password=SNOWFLAKE_PASSWORD,
            warehouse=SNOWFLAKE_WAREHOUSE,
            autocommit=True,
        )
    except Exception as exc:
        raise ValueError(
            "Snowflake connection failed. Check credentials in .env. "
            f"Account must be in format 'xxxxxx-xxxxxx' or 'xxxxxx-xxxxxx.region'. Error: {exc}"
        ) from exc


def ensure_table_exists(cursor: snowflake.connector.cursor.SnowflakeCursor) -> None:
    cursor.execute("USE DATABASE THREE_ONE_ONE")
    cursor.execute("USE SCHEMA RAW")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS INCOMING_SIGNALS (
            ID INT AUTOINCREMENT,
            SOURCE STRING,
            ENTRY_LINK STRING,
            POST_URI STRING,
            POST_TIME TIMESTAMP_NTZ,
            SIGNAL_STAGE STRING,
            REPORT_TEXT STRING,
            LATITUDE FLOAT,
            LONGITUDE FLOAT,
            IMAGE_NAME STRING,
            IMAGE_MIME_TYPE STRING,
            IMAGE_BASE64 STRING,
            RAW_JSON VARIANT,
            CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            PRIMARY KEY (ID)
        )
        """
    )

    for statement in (
        "ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS SOURCE STRING",
        "ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS ENTRY_LINK STRING",
        "ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS POST_URI STRING",
        "ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS POST_TIME TIMESTAMP_NTZ",
        "ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS SIGNAL_STAGE STRING",
        "ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS REPORT_TEXT STRING",
        "ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS LATITUDE FLOAT",
        "ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS LONGITUDE FLOAT",
        "ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS IMAGE_NAME STRING",
        "ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS IMAGE_MIME_TYPE STRING",
        "ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS IMAGE_BASE64 STRING",
    ):
        cursor.execute(statement)


def insert_payload(cursor: snowflake.connector.cursor.SnowflakeCursor, payload: dict[str, Any]) -> bool:
    cursor.execute(
        f"""
        MERGE INTO {TARGET_TABLE} AS target
        USING (
            SELECT
                %s AS SOURCE,
                %s AS ENTRY_LINK,
                %s AS POST_URI,
                TRY_TO_TIMESTAMP_NTZ(%s) AS POST_TIME,
                %s AS SIGNAL_STAGE,
                %s AS REPORT_TEXT,
                %s AS LATITUDE,
                %s AS LONGITUDE,
                %s AS IMAGE_NAME,
                %s AS IMAGE_MIME_TYPE,
                %s AS IMAGE_BASE64,
                PARSE_JSON(%s) AS RAW_JSON
        ) AS source
        ON target.ENTRY_LINK = source.ENTRY_LINK
        WHEN MATCHED THEN UPDATE SET
            SOURCE = source.SOURCE,
            POST_URI = source.POST_URI,
            POST_TIME = source.POST_TIME,
            SIGNAL_STAGE = source.SIGNAL_STAGE,
            REPORT_TEXT = source.REPORT_TEXT,
            LATITUDE = source.LATITUDE,
            LONGITUDE = source.LONGITUDE,
            IMAGE_NAME = source.IMAGE_NAME,
            IMAGE_MIME_TYPE = source.IMAGE_MIME_TYPE,
            IMAGE_BASE64 = source.IMAGE_BASE64,
            RAW_JSON = source.RAW_JSON
        WHEN NOT MATCHED THEN
            INSERT (
                SOURCE,
                ENTRY_LINK,
                POST_URI,
                POST_TIME,
                SIGNAL_STAGE,
                REPORT_TEXT,
                LATITUDE,
                LONGITUDE,
                IMAGE_NAME,
                IMAGE_MIME_TYPE,
                IMAGE_BASE64,
                RAW_JSON
            )
            VALUES (
                source.SOURCE,
                source.ENTRY_LINK,
                source.POST_URI,
                source.POST_TIME,
                source.SIGNAL_STAGE,
                source.REPORT_TEXT,
                source.LATITUDE,
                source.LONGITUDE,
                source.IMAGE_NAME,
                source.IMAGE_MIME_TYPE,
                source.IMAGE_BASE64,
                source.RAW_JSON
            )
        """,
        (
            payload.get("source"),
            payload.get("entry_link"),
            payload.get("post_uri"),
            payload.get("post_time"),
            payload.get("signal_stage"),
            payload.get("text"),
            payload.get("lat"),
            payload.get("lon"),
            payload.get("image_name"),
            payload.get("image_mime_type"),
            payload.get("image_base64"),
            json.dumps(payload),
        ),
    )
    return cursor.rowcount > 0


def build_report_payload(description: str, lat: float, lon: float, image_name: str, image_mime_type: str, image_bytes: bytes) -> dict[str, Any]:
    report_id = f"user-report:{uuid.uuid4().hex}"
    image_base64 = base64.b64encode(image_bytes).decode("ascii") if image_bytes else None
    created_at = datetime.now(timezone.utc).isoformat()

    return {
        "source": "user_report",
        "signal_stage": "incoming",
        "entry_link": report_id,
        "post_uri": report_id,
        "post_time": created_at,
        "text": description,
        "description": description,
        "lat": lat,
        "lon": lon,
        "image_name": image_name,
        "image_mime_type": image_mime_type,
        "image_base64": image_base64,
        "kind": "report",
        "status": "pending",
        "reported_at": created_at,
    }


def parse_request_body(handler: BaseHTTPRequestHandler) -> tuple[str, float, float, str, str, bytes]:
    content_type = handler.headers.get("Content-Type", "")
    content_length = int(handler.headers.get("Content-Length", "0") or "0")
    raw_body = handler.rfile.read(content_length)

    if content_type.startswith("multipart/form-data"):
        message = BytesParser(policy=email_default_policy).parsebytes(
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + raw_body
        )

        if not message.is_multipart():
            raise ValueError("Expected multipart form data.")

        fields: dict[str, str] = {}
        image_bytes = b""
        image_name = ""
        image_mime_type = "application/octet-stream"

        for part in message.iter_parts():
            name = part.get_param("name", header="content-disposition")
            if not name:
                continue

            if name == "image":
                image_bytes = part.get_payload(decode=True) or b""
                image_name = part.get_filename() or "report-photo"
                image_mime_type = part.get_content_type() or "application/octet-stream"
                continue

            value = part.get_content()
            fields[name] = value.strip() if isinstance(value, str) else str(value).strip()

        description = str(fields.get("description", "")).strip()
        lat_value = float(str(fields.get("lat", "")))
        lon_value = float(str(fields.get("lon", "")))

        if not image_name or not image_bytes:
            raise ValueError("Photo is required.")

        return description, lat_value, lon_value, image_name, image_mime_type, image_bytes

    if "application/json" in content_type:
        data = json.loads(raw_body.decode("utf-8"))
        description = str(data.get("description", "")).strip()
        lat_value = float(data["lat"])
        lon_value = float(data["lon"])
        image_name = str(data.get("image_name", "report-photo"))
        image_mime_type = str(data.get("image_mime_type", "image/jpeg"))
        image_base64 = str(data.get("image_base64", ""))
        image_bytes = base64.b64decode(image_base64) if image_base64 else b""
        return description, lat_value, lon_value, image_name, image_mime_type, image_bytes

    raise ValueError(f"Unsupported content type: {content_type or 'unknown'}")


def send_json(handler: BaseHTTPRequestHandler, status: HTTPStatus, payload: dict[str, Any]) -> None:
    encoded = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(encoded)))
    handler.end_headers()
    handler.wfile.write(encoded)


def normalize_confidence(score_value: Any) -> tuple[str, int]:
    """Convert a 0-1 score into the frontend's tier and 0-100 display value."""

    try:
        score_float = float(score_value)
    except (TypeError, ValueError):
        score_float = 0.0

    score = max(0, min(100, round(score_float * 100)))
    if score >= 75:
        tier = "high"
    elif score >= 35:
        tier = "medium"
    else:
        tier = "low"
    return tier, score


def normalize_hazard_type(raw_hazard_type: Any, description: Any) -> str:
    """Map verified hazard labels into the categories used by the map UI."""

    hazard_text = f"{raw_hazard_type or ''} {description or ''}".lower()
    if "power_line" in hazard_text or "power line" in hazard_text:
        return "Downed Power Line"
    if "fallen_tree" in hazard_text or "fallen tree" in hazard_text or "tree" in hazard_text:
        return "Fallen Tree"
    if "flood" in hazard_text:
        return "Flooding"
    if "pothole" in hazard_text:
        return "Pothole"
    if "fire" in hazard_text:
        return "Fire"
    if "road" in hazard_text or "damage" in hazard_text:
        return "Road Damage"
    return "Other"


def resolve_verified_hazards_table(cursor: snowflake.connector.cursor.SnowflakeCursor) -> str:
    """Return the verified hazards table location used by this workspace.

    Snowflake metadata confirmed the verified rows live in THREE_ONE_ONE.RAW.
    Keeping the location explicit is safer than trying to infer it from a schema
    that is not present in this account.
    """

    return "THREE_ONE_ONE.RAW.VERIFIED_HAZARDS"


def fetch_verified_hazards(cursor: snowflake.connector.cursor.SnowflakeCursor) -> list[dict[str, Any]]:
    """Fetch verified rows and turn them into map incidents.

    The verified table can contain repeated SIGNAL_ID values. The map should
    only show one marker per signal, so we keep the highest-confidence row for
    each SIGNAL_ID and generate a synthetic row ID for the frontend.
    """

    table_name = resolve_verified_hazards_table(cursor)
    cursor.execute(
        """
        SELECT
            ROW_NUMBER() OVER (
                ORDER BY SIGNAL_ID ASC
            ) AS MAP_ID,
            SIGNAL_ID,
            SOURCE,
            INGESTED_AT,
            LAT,
            LON,
            HAZARD_TYPE,
            DESCRIPTION,
            IS_HAZARD,
            CONFIDENCE_SCORE
        FROM {table_name}
        WHERE IS_HAZARD = TRUE
        QUALIFY ROW_NUMBER() OVER (
            PARTITION BY SIGNAL_ID
            ORDER BY CONFIDENCE_SCORE DESC, INGESTED_AT DESC, LAT DESC, LON DESC
        ) = 1
        ORDER BY SIGNAL_ID ASC, INGESTED_AT DESC, LAT DESC, LON DESC
        """.format(table_name=table_name)
    )

    incidents_by_signal: dict[int, tuple[float, Any, dict[str, Any]]] = {}
    for row in cursor.fetchall():
        signal_id = int(row[1])
        source = str(row[2]) if row[2] is not None else ""
        ingested_at = row[3]
        lat = float(row[4])
        lon = float(row[5])
        display_type = normalize_hazard_type(row[6], row[7])
        description = str(row[7]) if row[7] is not None else ""
        confidence_tier, confidence_score = normalize_confidence(row[9])
        incident = {
            "signalId": signal_id,
            "type": display_type,
            "lat": lat,
            "lng": lon,
            "conf": confidence_tier,
            "score": confidence_score,
            "reports": 1,
            "hasImage": False,
            "sources": parse_sources(source),
            "time": format_relative_time(ingested_at),
            "desc": description,
            "icon": get_hazard_icon(display_type),
        }

        current_best = incidents_by_signal.get(signal_id)
        candidate_key = (confidence_score, ingested_at)
        if current_best is None or candidate_key > current_best[0:2]:
            incidents_by_signal[signal_id] = (confidence_score, ingested_at, incident)

    deduped_incidents: list[dict[str, Any]] = []
    for map_id, signal_id in enumerate(sorted(incidents_by_signal.keys()), start=1):
        incident = incidents_by_signal[signal_id][2]
        deduped_incidents.append({**incident, "id": map_id})

    return deduped_incidents


def format_relative_time(timestamp: Any) -> str:
    """Convert a database timestamp to a relative time string like '4 min ago'."""
    if not timestamp:
        return "unknown"
    
    try:
        # Handle both datetime objects and strings
        if isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        
        now = datetime.now(timezone.utc)
        delta = now - timestamp
        
        # Calculate relative time
        seconds = int(delta.total_seconds())
        if seconds < 60:
            return f"{seconds} sec ago"
        elif seconds < 3600:
            minutes = seconds // 60
            return f"{minutes} min ago"
        elif seconds < 86400:
            hours = seconds // 3600
            return f"{hours} hour{'s' if hours > 1 else ''} ago"
        else:
            days = seconds // 86400
            return f"{days} day{'s' if days > 1 else ''} ago"
    except Exception:
        return "recently"


def get_hazard_icon(hazard_type: str) -> str:
    """Return an emoji icon based on the hazard type."""
    hazard_map = {
        "Flooding": "🌊",
        "Fallen Tree": "🌳",
        "Downed Power Line": "⚡",
        "Traffic Hazard": "🚦",
        "Road Damage": "🕳️",
        "Structural Damage": "🏚️",
        "Fire": "🔥",
        "Pothole": "🕳️",
    }
    return hazard_map.get(hazard_type, "⚠️")


def parse_sources(source_data: Any) -> list[str]:
    """Parse source information from database column.
    
    The SOURCE column might contain JSON, CSV, or a single value.
    We normalize it to a list of source strings: ['X', 'Bluesky', 'User', etc.]
    """
    if not source_data:
        return []
    
    source_str = str(source_data).strip()
    
    # Try to parse as JSON array
    try:
        parsed = json.loads(source_str)
        if isinstance(parsed, list):
            return parsed
    except (json.JSONDecodeError, ValueError):
        pass
    
    # Try to parse as CSV
    if "," in source_str:
        return [s.strip() for s in source_str.split(",") if s.strip()]
    
    # Return as single-item list
    return [source_str] if source_str else []


def build_hazard_lookup_summary(cursor: snowflake.connector.cursor.SnowflakeCursor) -> dict[str, Any]:
    """Return a short summary of what the verified table contains."""

    table_name = resolve_verified_hazards_table(cursor)
    cursor.execute(f"SELECT COUNT(*) FROM {table_name} WHERE IS_HAZARD = TRUE")
    total_rows = int(cursor.fetchone()[0])
    cursor.execute(f"SELECT COUNT(DISTINCT SIGNAL_ID) FROM {table_name} WHERE IS_HAZARD = TRUE")
    unique_signal_ids = int(cursor.fetchone()[0])
    return {
        "totalRows": total_rows,
        "uniqueSignalIds": unique_signal_ids,
        "table": table_name,
    }


class ReportRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")

    def do_OPTIONS(self) -> None:
        if self.path not in ("/api/reports", "/api/verified-hazards"):
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "http://localhost:5173")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        """Handle GET requests.
        
        Currently supports:
        - GET /api/verified-hazards: Fetch all verified hazards from the database
        """
        if self.path != "/api/verified-hazards":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        try:
            with connect_to_snowflake() as snowflake_connection:
                cursor = snowflake_connection.cursor()
                try:
                    if SNOWFLAKE_WAREHOUSE:
                        cursor.execute(f"USE WAREHOUSE {SNOWFLAKE_WAREHOUSE}")
                    summary = build_hazard_lookup_summary(cursor)
                    incidents = fetch_verified_hazards(cursor)

                    response = {
                        "status": "success",
                        "count": len(incidents),
                        "summary": summary,
                        "incidents": incidents,
                    }
                    send_json(self, HTTPStatus.OK, response)
                finally:
                    cursor.close()
        except ValueError as exc:
            send_json(self, HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:
            send_json(self, HTTPStatus.BAD_GATEWAY, {"error": f"Failed to fetch verified hazards: {exc}"})

    def do_POST(self) -> None:
        """Handle POST requests.
        
        Currently supports:
        - POST /api/reports: Submit a new incident report to the database
        """
        if self.path != "/api/reports":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        try:
            description, lat_value, lon_value, image_name, image_mime_type, image_bytes = parse_request_body(self)
            if not description:
                raise ValueError("Description is required.")
            if not image_bytes:
                raise ValueError("Photo is required.")

            payload = build_report_payload(description, lat_value, lon_value, image_name, image_mime_type, image_bytes)

            with connect_to_snowflake() as snowflake_connection:
                cursor = snowflake_connection.cursor()
                try:
                    if SNOWFLAKE_WAREHOUSE:
                        cursor.execute(f"USE WAREHOUSE {SNOWFLAKE_WAREHOUSE}")
                    ensure_table_exists(cursor)
                    insert_payload(cursor, payload)
                finally:
                    cursor.close()

            response = {
                "status": "joined_incident",
                "incident": {
                    "id": payload["post_uri"],
                    "hazard_type": "User Report",
                    "confidence_score": 0.86,
                    "confidence_tier": "HIGH",
                    "report_count": 1,
                    "bounding_boxes": [],
                    "description": description,
                    "location": {
                        "lat": lat_value,
                        "lon": lon_value,
                    },
                    "image_name": image_name,
                },
            }
            send_json(self, HTTPStatus.OK, response)
        except ValueError as exc:
            send_json(self, HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:
            send_json(self, HTTPStatus.BAD_GATEWAY, {"error": f"Failed to save report: {exc}"})


def main() -> None:
    try:
        validate_configuration()
    except ValueError as exc:
        print(f"Configuration error: {exc}")
        return

    server = ThreadingHTTPServer((HOST, PORT), ReportRequestHandler)
    print(f"Report API listening on http://{HOST}:{PORT}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down report API...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()