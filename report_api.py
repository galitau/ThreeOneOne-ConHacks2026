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
PORT = int(os.getenv("REPORT_API_PORT", "8000"))


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


class ReportRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")

    def do_OPTIONS(self) -> None:
        if self.path != "/api/reports":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "http://localhost:5173")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
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