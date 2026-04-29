from google import genai
from google.genai import types
from google.genai.errors import ClientError
import os
import json
import mimetypes
import time
from dotenv import load_dotenv

load_dotenv()


# Initialize client at the top to avoid reference errors
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Corrected Model IDs for 2026
GATEKEEPER_MODEL = "gemini-3.1-flash-lite-preview" 
PRIMARY_MODEL = "gemini-2.5-flash"

def _is_retryable(e: ClientError) -> bool:
    """Checks for both 429 (Rate Limit) and 503 (Server Busy)."""
    code = (
        getattr(e, "status_code", None)
        or getattr(e, "code", None)
        or (e.args[0] if e.args else None)
    )
    msg = str(e).upper()
    # Handle 429, 503, and corresponding error strings
    return code in [429, 503] or "RESOURCE_EXHAUSTED" in msg or "UNAVAILABLE" in msg

def _generate_with_retry(model_id, contents, config=None, max_retries=3):
    """Generic retry wrapper for any model."""
    for attempt in range(max_retries):
        try:
            kwargs = dict(model=model_id, contents=contents)
            if config:
                kwargs["config"] = config
            return client.models.generate_content(**kwargs)
        except ClientError as e:
            if _is_retryable(e) and attempt < max_retries - 1:
                # Exponential backoff: 5s, 10s...
                wait = 2 ** attempt * 5 
                print(f"[gemini] {model_id} busy/limited. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise

def fast_hazard_check(image_path: str, report_text: str):
    """Smart gatekeeper using Lite model (500 RPD quota)."""
    prompt = f"Is there a street hazard (flood, fire, broken traffic light, accident) in this image or text: '{report_text}'? Return only 'YES' or 'NO'."
    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()
        image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")
        
        response = _generate_with_retry(GATEKEEPER_MODEL, [prompt, image_part])
        return "YES" in response.text.upper()
    except Exception as e:
        print(f"Gatekeeper error: {e}")
        return True # Fallback to YES so we don't miss hazards if Lite is down

def analyze_and_verify(image_path: str, report_text: str, location_hint: str):
    """
    Single Gemini call that does:
      1. Spatial image analysis & Precise Localization (Lat/Lng)
      2. Grounded web search verification
    """
    prompt = f"""
You are an advanced urban hazard detection system with access to real-time web search.

A user submitted this report: "{report_text}"
Reported approximate location: {location_hint}

Your task is to identify the EXACT location of this hazard. 
1. Look for visible cues in the image: street signs, building numbers, business names, unique landmarks, or local architecture.
2. Use Google Search grounding to find the precise GPS coordinates (Latitude and Longitude) for these visible locations. 
3. Verify if the hazard exists and determine its severity.

Return STRICT JSON only, no markdown fences:

{{
  "hazard": true or false,
  "type": "flood/fire/fallen_tree/accident/traffic_light/power_line/other",
  "severity": "low/medium/high",
  "determined_location": {{
    "lat": float,
    "lng": float,
    "explanation": "briefly explain how you found this location from signs/landmarks"
  }},
  "scene_understanding": {{
    "primary_objects": ["list", "of", "objects"],
    "hazard_location": "where in the image the hazard is",
    "affected_area": "road/building/sidewalk/intersection/etc",
    "obstruction": true or false
  }},
  "image_confidence": 0.0,
  "grounding": {{
    "verified": true or false,
    "web_confidence": 0.0,
    "evidence": "brief summary of supporting or contradicting web sources"
  }},
  "reason": "brief explanation combining image evidence and web findings"
}}
"""

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    mime_type = mimetypes.guess_type(image_path)[0] or "image/jpeg"
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

    # Enable real Google Search grounding
    config = types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())]
    )

    try:
        response = _generate_with_retry(PRIMARY_MODEL, [prompt, image_part], config=config)
        text = response.text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(text)
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}", "hazard": False}