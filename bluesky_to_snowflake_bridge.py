"""Ingestion bridge from Bluesky to Snowflake.

This script searches Bluesky for hazard-related keywords, extracts a best-effort
image URL when the post contains an image embed, and stores the result in
Snowflake's THREE_ONE_ONE.RAW.INCOMING_SIGNALS table.

The Snowflake target column RAW_JSON is VARIANT. The safest pattern is to build
the payload in Python as a dictionary, serialize it to JSON, and then use
PARSE_JSON(...) in the INSERT statement so Snowflake stores it as semi-structured
data instead of plain text.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
import json
import os
from typing import Any, Iterable, Optional

import snowflake.connector
from atproto import Client
from atproto_client.exceptions import UnauthorizedError


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
    """Allow environment variables to override the inline placeholders."""

    value = os.getenv(name)
    if value:
        return value
    return placeholder


load_dotenv_file()


# ---------------------------------------------------------------------------
# Credentials and runtime settings.
# Replace these placeholders with your real values or map them from environment
# variables before running the script.
# ---------------------------------------------------------------------------
SNOWFLAKE_ACCOUNT = get_env_or_placeholder("SNOWFLAKE_ACCOUNT", "<YOUR_SNOWFLAKE_ACCOUNT>")
SNOWFLAKE_USER = get_env_or_placeholder("SNOWFLAKE_USER", "<YOUR_SNOWFLAKE_USER>")
SNOWFLAKE_PASSWORD = get_env_or_placeholder("SNOWFLAKE_PASSWORD", "<YOUR_SNOWFLAKE_PASSWORD>")
SNOWFLAKE_WAREHOUSE = get_env_or_placeholder("SNOWFLAKE_WAREHOUSE", "<YOUR_SNOWFLAKE_WAREHOUSE>")

BLUESKY_HANDLE = get_env_or_placeholder("BLUESKY_HANDLE", "<YOUR_BLUESKY_HANDLE>")
BLUESKY_APP_PASSWORD = get_env_or_placeholder("BLUESKY_APP_PASSWORD", "<YOUR_BLUESKY_APP_PASSWORD>")

TARGET_TABLE = "THREE_ONE_ONE.RAW.INCOMING_SIGNALS"
SEARCH_KEYWORDS = ["pothole", "fallen tree", "power line"]
RESULT_LIMIT_PER_KEYWORD = 25
MAX_POST_AGE = timedelta(days=3)


def connect_to_bluesky() -> Client:
    """Create an authenticated Bluesky client."""

    client = Client()
    try:
        client.login(BLUESKY_HANDLE, BLUESKY_APP_PASSWORD)
    except UnauthorizedError as exc:
        raise ValueError(
            "Bluesky login failed. Check BLUESKY_HANDLE and BLUESKY_APP_PASSWORD in .env. "
            "Use your full handle (for example, name.bsky.social) and an app password, not your account password."
        ) from exc
    return client


def connect_to_snowflake() -> snowflake.connector.SnowflakeConnection:
    """Create a Snowflake connection using the configured warehouse."""

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
            f"Snowflake connection failed. Check credentials in .env. "
            f"Account must be in format 'xxxxxx-xxxxxx' or 'xxxxxx-xxxxxx.region' "
            f"(use the hostname part of your Snowflake web console URL). Error: {exc}"
        ) from exc


def validate_configuration() -> None:
    """Fail fast if any required secret is still a placeholder."""

    required_values = {
        "SNOWFLAKE_ACCOUNT": SNOWFLAKE_ACCOUNT,
        "SNOWFLAKE_USER": SNOWFLAKE_USER,
        "SNOWFLAKE_PASSWORD": SNOWFLAKE_PASSWORD,
        "SNOWFLAKE_WAREHOUSE": SNOWFLAKE_WAREHOUSE,
        "BLUESKY_HANDLE": BLUESKY_HANDLE,
        "BLUESKY_APP_PASSWORD": BLUESKY_APP_PASSWORD,
    }

    missing = [name for name, value in required_values.items() if value.startswith("<YOUR_")]
    if missing:
        raise ValueError(
            "Set the following environment variables or replace the placeholders before running: "
            + ", ".join(missing)
        )

    wrapped = [
        name
        for name, value in required_values.items()
        if value.startswith("<") and value.endswith(">")
    ]
    if wrapped:
        raise ValueError(
            "Remove angle brackets from these .env values: "
            + ", ".join(wrapped)
            + ". Example: BLUESKY_HANDLE=name.bsky.social (not <name.bsky.social>)."
        )


def extract_image_url(post: Any) -> Optional[str]:
    """Return the best image URL available on a Bluesky post, if any.

    Bluesky image posts usually expose an embed with an images list. The SDK
    structures can vary slightly by version, so this helper checks multiple
    common attribute names and falls back gracefully when no image exists.
    """

    embed = getattr(post, "embed", None)
    if not embed:
        return None

    images = getattr(embed, "images", None)
    if not images:
        return None

    first_image = images[0]
    for attribute_name in ("fullsize", "thumb", "image_url", "url"):
        image_url = getattr(first_image, attribute_name, None)
        if image_url:
            return str(image_url)

    # Some SDK versions store the blob object under `image`; that blob is not a
    # public URL, so we skip it unless a direct URL field is present.
    return None


def parse_post_time(post: Any) -> Optional[datetime]:
    """Return the post creation time as a timezone-aware UTC datetime."""

    record = getattr(post, "record", None)
    if not record:
        return None

    raw_value = (
        getattr(record, "created_at", None)
        or getattr(record, "createdAt", None)
        or getattr(post, "indexed_at", None)
        or getattr(post, "indexedAt", None)
    )
    if not raw_value:
        return None

    value = str(raw_value).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def is_recent_post(post_time: Optional[datetime], now: Optional[datetime] = None) -> bool:
    """Return True when the post is within the last three days."""

    if not post_time:
        return False

    current_time = now or datetime.now(timezone.utc)
    return current_time - post_time <= MAX_POST_AGE


def iter_search_posts(client: Client, keyword: str, limit: int) -> Iterable[Any]:
    """Yield posts returned from a Bluesky search query.

    The atproto SDK commonly returns a response object with a `posts` attribute.
    We support a few access patterns so the script remains resilient across
    closely related SDK versions.
    """

    response = client.app.bsky.feed.search_posts({"q": keyword, "limit": limit})

    if hasattr(response, "posts"):
        return response.posts
    if isinstance(response, dict) and "posts" in response:
        return response["posts"]
    return []


def build_payload(post: Any, keyword: str) -> dict[str, Any]:
    """Create the semi-structured payload that will be stored in VARIANT."""

    record = getattr(post, "record", None)
    text = getattr(record, "text", None) if record else None
    image_url = extract_image_url(post)
    post_time = parse_post_time(post)

    author = getattr(post, "author", None)
    author_did = getattr(author, "did", None) if author else None

    return {
        "source": "bluesky",
        "signal_stage": "incoming",
        "keyword": keyword,
        "text": text,
        "image_url": image_url,
        "post_time": post_time.isoformat() if post_time else None,
        "uri": getattr(post, "uri", None),
        "cid": getattr(post, "cid", None),
        "author_did": author_did,
    }


def ensure_table_exists(cursor: snowflake.connector.cursor.SnowflakeCursor) -> None:
    """Create the target table if it does not exist."""

    try:
        print(f"Setting up table {TARGET_TABLE}...")
        cursor.execute(f"USE DATABASE THREE_ONE_ONE")
        print("Using database THREE_ONE_ONE")
        cursor.execute(f"USE SCHEMA RAW")
        print("Using schema RAW")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS INCOMING_SIGNALS (
                ID INT AUTOINCREMENT,
                POST_URI STRING,
                POST_TIME TIMESTAMP_NTZ,
                RAW_JSON VARIANT,
                CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
                PRIMARY KEY (ID)
            )
            """
        )
        try:
            cursor.execute("ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS POST_URI STRING")
        except Exception:
            pass
        try:
            cursor.execute("ALTER TABLE INCOMING_SIGNALS ADD COLUMN IF NOT EXISTS POST_TIME TIMESTAMP_NTZ")
        except Exception:
            pass
        print("Table setup complete.")
    except Exception as exc:
        print(f"Table setup failed: {exc}")
        raise


def insert_payload(cursor: snowflake.connector.cursor.SnowflakeCursor, payload: dict[str, Any]) -> bool:
    """Insert one record into the VARIANT column.

    Snowflake VARIANT stores JSON-like data. We serialize the Python dictionary
    into JSON text, then call PARSE_JSON in the SQL statement so the database
    persists it as semi-structured data.
    """

    cursor.execute(
        f"""
        MERGE INTO {TARGET_TABLE} AS target
        USING (
            SELECT
                %s AS POST_URI,
                TRY_TO_TIMESTAMP_NTZ(%s) AS POST_TIME,
                PARSE_JSON(%s) AS RAW_JSON
        ) AS source
        ON target.POST_URI = source.POST_URI
        WHEN NOT MATCHED THEN
            INSERT (POST_URI, POST_TIME, RAW_JSON)
            VALUES (source.POST_URI, source.POST_TIME, source.RAW_JSON)
        """,
        (
            payload.get("uri"),
            payload.get("post_time"),
            json.dumps(payload),
        ),
    )
    return cursor.rowcount > 0


def main() -> None:
    try:
        validate_configuration()
        bluesky_client = connect_to_bluesky()
    except ValueError as exc:
        print(f"Configuration error: {exc}")
        return

    with connect_to_snowflake() as snowflake_connection:
        cursor = snowflake_connection.cursor()
        try:
            if SNOWFLAKE_WAREHOUSE:
                cursor.execute(f"USE WAREHOUSE {SNOWFLAKE_WAREHOUSE}")
        except Exception as warehouse_err:
            print(f"Error: Warehouse '{SNOWFLAKE_WAREHOUSE}' not found or not accessible.")
            print("Please update SNOWFLAKE_WAREHOUSE in .env with a valid warehouse from your Snowflake account.")
            print("You can find available warehouses in the Snowflake web console under Warehouses, or by running:")
            print("  SHOW WAREHOUSES")
            return

        ensure_table_exists(cursor)
        for keyword in SEARCH_KEYWORDS:
            for post in iter_search_posts(bluesky_client, keyword, RESULT_LIMIT_PER_KEYWORD):
                post_time = parse_post_time(post)
                if not is_recent_post(post_time):
                    continue

                payload = build_payload(post, keyword)
                if not payload.get("uri"):
                    continue

                text_value = payload.get("text")
                image_url = payload.get("image_url")
                if not isinstance(text_value, str) or not text_value.strip() or not image_url:
                    continue

                inserted = insert_payload(cursor, payload)
                if inserted:
                    print(f"Inserted post for keyword '{keyword}': {payload.get('uri')} at {payload.get('post_time')}")
                else:
                    print(f"Skipped duplicate post for keyword '{keyword}': {payload.get('uri')}")


if __name__ == "__main__":
    main()