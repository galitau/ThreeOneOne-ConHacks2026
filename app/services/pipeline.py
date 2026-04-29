from .gemini_service import analyze_and_verify, fast_hazard_check


# app/services/pipeline.py

def process_report(report):
    """
    Analyzes reports using a tiered Gemini approach.
    Defaults to False if the primary model fails.
    """
    result = {
        "hazard": False,
        "image_analysis": None,
        "grounding": None,
    }

    if report.get("image_path"):
        # STEP 1: Smart Lite gatekeeper check (High Quota)
        is_suspicious = fast_hazard_check(report["image_path"], report.get("text", ""))

        if is_suspicious:
            # FIX: use the location_hint from the report (post text) instead of
            # hardcoded "Unknown" — gives Gemini real street/city context to work with.
            location_hint = report.get("location_hint") or report.get("text", "")[:300] or "Unknown"

            # STEP 2: Deep analysis with real location context
            analysis = analyze_and_verify(
                image_path=report["image_path"],
                report_text=report.get("text", ""),
                location_hint=location_hint,
            )

            result["image_analysis"] = analysis

            if "error" not in analysis:
                result["hazard"] = bool(analysis.get("hazard"))
                result["grounding"] = analysis.get("grounding")

    return result