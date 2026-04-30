# ThreeOneOne 🚧

**Real-time hazard detection powered by AI and Snowflake.**

ThreeOneOne is a real-time hazard detection platform that aggregates posts from social media (X, Bluesky, Reddit) and direct user submissions, turning raw, noisy data into verified, actionable incidents on a live map.

---

## 💡 Inspiration
I casually brought up calling **311** and was astonished when none of my team members had heard of it. 

*   **The Problem:** The 311 Toronto app is used by less than **20%** of residents, and only **5%** of university students even know it exists. 
*   **The Gap:** While 311 calls lag, hazards like fallen trees or broken signals appear on social media within minutes. However, cities can't act on unverified tweets.
*   **The Solution:** ThreeOneOne acts as the "intelligence layer" in between—listening to public signals, using AI to decide what's a hazard, and clustering reports to surface incidents only when there is enough corroborating evidence to act.

---

## 🚀 What it does
ThreeOneOne turns raw text and images into verified incidents on an interactive map.

*   **Centralize:** All posts flow into **Snowflake**, our single source of truth.
*   **Classify:** Uses **Snowflake Cortex** and **Gemini 1.5 Flash-Lite** to filter noise and categorize hazards.
*   **Vision & Reasoning:** **Gemini 1.5 Flash** performs multimodal analysis to confirm hazards in images, while **Grounded Search** pins vague locations (like "near the bridge") to precise GPS coordinates.
*   **Cluster & Score:** **DBSCAN** groups reports by location and time. Each incident gets a confidence score based on report count, source diversity, and image evidence.
*   **Verify:** High-confidence clusters are cross-referenced against local news sources to earn a **"Confirmed"** badge.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React, TypeScript, Vite, Mapbox GL JS |
| **Backend** | FastAPI, Python |
| **Data & AI** | Snowflake (Geospatial Lake), Snowflake Cortex |
| **Models** | Gemini 3.1 Flash Lite, Gemini 2.5 Flash (Grounded Search & Vision) |
| **Analytics** | DBSCAN, Haversine Metric |

---

## 🏗️ Architecture

### Data Layer (Snowflake)
Snowflake serves as our **Geospatial Data Lake**. We ingest raw JSON via `VARIANT` columns and use native **Geospatial functions** (like `ST_GEOHASH`) to turn noise into mapped data. **Cortex AI** summarizes long posts into one-sentence "Dispatch Notes" for city workers.

### ML Pipeline
We utilize a **Tiered Inference Pipeline** for cost-effective scaling:
1.  **Gatekeeper:** Flash-Lite filters out irrelevant posts.
2.  **Multimodal:** Flash performs spatial reasoning to identify landmarks and signs to infer GPS coordinates where metadata is missing.
3.  **Validation:** Enriched data is pushed back to Snowflake to power the real-time map.

---

## 💪 Accomplishments & Lessons
*   **Explainable AI:** We built a custom confidence formula (`scoring.py`) that makes the AI's decision-making transparent to users and responders.
*   **Production-Ready:** By putting Snowflake at the center from Day 1, our data model is built for scale, not just a static demo.
*   **Grounded Metadata:** We learned to leverage `grounding_chunks` to recover news URLs even when raw JSON responses were malformed.
*   **Spatial-Temporal Clustering:** Discovered that a two-pass approach (Spatial first, then Temporal) creates much cleaner incident clusters than a single unified metric.

---

## 🔮 What's Next
*   **More Social Ingest:** Integrating Meta and Instagram APIs for broader data coverage.
*   **Admin Dashboard:** Building Snowflake-side analytics to track hazard density by neighborhood.
*   **Live Updates:** Implementing WebSockets to push new clusters to the map instantly.
*   **City Partnerships:** Piloting the platform as a "pre-call" signal feed for municipal 311 teams.
