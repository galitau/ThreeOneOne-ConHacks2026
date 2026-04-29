import os
import feedparser
import snowflake.connector
import json
import time
import re
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

# --- CONFIGURATION ---
# RSS sources.
RSS_FEEDS = [
    "https://weather.gc.ca/rss/battleboard/on61_e.xml",
    "https://www.toronto.ca/home/media-room/news-releases-media-advisories/?feed=rss",
]

# HTML news pages we scrape directly when they do not expose RSS.
PAGE_SOURCES = [
    "https://www.waterloo.ca/news/service-alerts/",
    "https://www.waterloo.ca/news/city-news/",
    "https://www.toronto.ca/news/",
]

RELEVANT_KEYWORDS = [
    "flood",
    "road closure",
    "closure",
    "closed",
    "fallen tree",
    "tree down",
    "tree",
    "power line",
    "outage",
    "downed wire",
    "water main break",
    "gas leak",
    "collision",
    "fire",
    "evacuation",
    "hazard",
    "advisory",
    "warning",
    "alert",
    "severe weather",
    "storm",
    "pothole",
    "road conditions",
    "road condition",
    "roadwork",
    "maintenance",
    "construction",
    "detour",
    "snow event",
    "parking ban",
]

POLL_INTERVAL_SECONDS = int(os.getenv("RSS_POLL_INTERVAL_SECONDS", "300"))
RUN_ONCE = os.getenv("RSS_RUN_ONCE", "false").lower() in {"1", "true", "yes"}

# Your Snowflake Credentials
def load_dotenv_file(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


load_dotenv_file()

# Read Snowflake config from environment if present, otherwise use placeholders
SNOWFLAKE_CONF = {
    "user": os.getenv("SNOWFLAKE_USER", "YOUR_USER"),
    "password": os.getenv("SNOWFLAKE_PASSWORD", "YOUR_PASSWORD"),
    "account": os.getenv("SNOWFLAKE_ACCOUNT", "YOUR_ACCOUNT_ID"),
    "warehouse": os.getenv("SNOWFLAKE_WAREHOUSE", "HACKATHON_WH"),
    "database": os.getenv("SNOWFLAKE_DATABASE", "THREE_ONE_ONE"),
    "schema": os.getenv("SNOWFLAKE_SCHEMA", "RAW"),
}

def connect_snowflake():
    return snowflake.connector.connect(**SNOWFLAKE_CONF)


def fetch_html(url):
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="ignore")


def ensure_target_table(cursor):
    target_table = f"{SNOWFLAKE_CONF['database']}.{SNOWFLAKE_CONF['schema']}.INCOMING_SIGNALS"
    cursor.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {target_table} (
            ID INT AUTOINCREMENT,
            SOURCE STRING,
            ENTRY_LINK STRING,
            RAW_JSON VARIANT,
            CREATED_AT TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            PRIMARY KEY (ID)
        )
        """
    )
    cursor.execute(f"ALTER TABLE {target_table} ADD COLUMN IF NOT EXISTS ENTRY_LINK STRING")
    return target_table


def ingest_feed_entry(cursor, target_table, entry, feed_name):
    payload = {
        "title": entry.title,
        "summary": entry.get("summary", ""),
        "link": entry.link,
        "published": entry.get("published", ""),
        "source": "RSS_OFFICIAL",
        "feed_name": feed_name,
    }

    cursor.execute(
        f"""
        MERGE INTO {target_table} AS target
        USING (
            SELECT %s AS ENTRY_LINK, %s AS SOURCE, PARSE_JSON(%s) AS RAW_JSON
        ) AS source
        ON target.ENTRY_LINK = source.ENTRY_LINK
        WHEN NOT MATCHED THEN
            INSERT (ENTRY_LINK, SOURCE, RAW_JSON)
            VALUES (source.ENTRY_LINK, source.SOURCE, source.RAW_JSON)
        """,
        (entry.link, "RSS_FEED", json.dumps(payload)),
    )
    return cursor.rowcount > 0


def ingest_page_entry(cursor, target_table, entry, source_name):
    payload = {
        "title": entry["title"],
        "summary": entry.get("summary", ""),
        "link": entry["link"],
        "published": entry.get("published", ""),
        "source": source_name,
        "feed_name": source_name,
    }

    cursor.execute(
        f"""
        MERGE INTO {target_table} AS target
        USING (
            SELECT %s AS ENTRY_LINK, %s AS SOURCE, PARSE_JSON(%s) AS RAW_JSON
        ) AS source
        ON target.ENTRY_LINK = source.ENTRY_LINK
        WHEN NOT MATCHED THEN
            INSERT (ENTRY_LINK, SOURCE, RAW_JSON)
            VALUES (source.ENTRY_LINK, source.SOURCE, source.RAW_JSON)
        """,
        (entry["link"], source_name, json.dumps(payload)),
    )
    return cursor.rowcount > 0


def is_relevant_entry(entry) -> bool:
    text = f"{entry.get('title', '')} {entry.get('summary', '')}".lower()
    return any(keyword in text for keyword in RELEVANT_KEYWORDS)


def extract_page_entries(page_url):
    html = fetch_html(page_url)
    soup = BeautifulSoup(html, "html.parser")
    entries = []
    seen_links = set()

    for link in soup.find_all("a", href=True):
        href = link["href"]
        if "/news/posts/" not in href:
            continue

        title = " ".join(link.get_text(" ", strip=True).split())
        if not title or title in {"Subscribe", "Search"}:
            continue

        absolute_link = urljoin(page_url, href)
        if absolute_link in seen_links:
            continue

        container = link.find_parent(["li", "article", "div"])
        container_text = " ".join(container.get_text(" ", strip=True).split()) if container else title
        summary = container_text
        if summary.startswith(title):
            summary = summary[len(title):].strip(" -:–—")

        published_match = re.search(
            r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}",
            container_text,
        )
        published = published_match.group(0) if published_match else ""

        entries.append(
            {
                "title": title,
                "summary": summary,
                "link": absolute_link,
                "published": published,
            }
        )
        seen_links.add(absolute_link)

    return entries


def process_cycle(cursor, target_table):
    print("Starting RSS Bridge...")

    for url in RSS_FEEDS:
        print(f"Checking feed: {url}")
        feed = feedparser.parse(url)

        for entry in feed.entries:
            if not is_relevant_entry(entry):
                continue

            try:
                inserted = ingest_feed_entry(cursor, target_table, entry, url)
                if inserted:
                    print(f"Successfully ingested: {entry.title[:50]}...")
                else:
                    print(f"Skipped duplicate: {entry.title[:50]}...")
            except Exception as e:
                print(f"Error inserting entry: {e}")

    for url in PAGE_SOURCES:
        print(f"Checking page source: {url}")
        try:
            entries = extract_page_entries(url)
        except Exception as e:
            print(f"Error reading page source {url}: {e}")
            continue

        for entry in entries:
            if not is_relevant_entry(entry):
                continue

            try:
                inserted = ingest_page_entry(cursor, target_table, entry, url)
                if inserted:
                    print(f"Successfully ingested page item: {entry['title'][:50]}...")
                else:
                    print(f"Skipped duplicate page item: {entry['title'][:50]}...")
            except Exception as e:
                print(f"Error inserting page item: {e}")

def run_bridge():
    conn = connect_snowflake()
    cursor = conn.cursor()
    target_table = ensure_target_table(cursor)

    try:
        while True:
            process_cycle(cursor, target_table)
            if RUN_ONCE:
                break
            print(f"Sleeping for {POLL_INTERVAL_SECONDS} seconds before the next poll...")
            time.sleep(POLL_INTERVAL_SECONDS)
    finally:
        cursor.close()
        conn.close()
        print("Bridge run complete.")

if __name__ == "__main__":
    run_bridge()