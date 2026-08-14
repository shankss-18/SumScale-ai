"""
SumScale — Cross-Modal Fraud Case Fusion Service (Feature 2)
=============================================================
Groups multi-modal uploads (image, audio, text/SMS) from the same fraud
incident and runs a Gemini fusion pass to detect correlated scam attempts.

Main function:
  fuse_case(case_id, db) → dict with fused_summary, scammer_profile, verdict
"""

import logging
import re
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.services.ai_service import call_text_llm
from app.services.fraud_verify import verify_entity

logger = logging.getLogger("omniaid.case_fusion")

_FRAUD_CASES_COLLECTION = "fraud_cases"


# ---------------------------------------------------------------------------
# Entity extraction helpers
# ---------------------------------------------------------------------------

_PHONE_RE = re.compile(r"(?:\+91[\-\s]?)?\d[\d\s\-]{8,13}\d")
_URL_RE = re.compile(r"https?://[^\s\"'<>]+|www\.[^\s\"'<>]+")
_UPI_RE = re.compile(r"[\w.\-]+@[a-zA-Z]+")


def _extract_entities(text: str) -> dict:
    phones = list({m.group().strip() for m in _PHONE_RE.finditer(text)})
    urls = list({m.group().strip() for m in _URL_RE.finditer(text)})
    upi = list({m.group().strip() for m in _UPI_RE.finditer(text)
                if "@upi" in m.group().lower() or "@ok" in m.group().lower()
                or "@ybl" in m.group().lower() or "@paytm" in m.group().lower()})
    return {"phones": phones[:10], "urls": urls[:10], "upi_ids": upi[:10]}


# ---------------------------------------------------------------------------
# Fusion prompt builder
# ---------------------------------------------------------------------------

def _build_fusion_prompt(artifacts: list) -> str:
    artifact_blocks = []
    for i, art in enumerate(artifacts, 1):
        atype = art.get("artifact_type", "text")
        content = art.get("extracted_text", "") or art.get("content", "") or ""
        artifact_blocks.append(
            f"--- Artifact {i} ({atype}) ---\n{content[:3000]}"
        )

    joined = "\n\n".join(artifact_blocks)

    return f"""You are a fraud analysis expert.
Below are {len(artifacts)} separate pieces of evidence uploaded by a user who suspects they are being scammed.
Each artifact may be a screenshot transcript, a voice recording transcript, or a text message copy.

Analyze all artifacts together and return ONLY valid JSON with this structure:
{{
  "same_incident": true or false,
  "confidence": "high" | "medium" | "low",
  "scammer_profile": {{
    "likely_name": "string or null",
    "phones": ["list of phone numbers"],
    "urls": ["list of URLs"],
    "upi_ids": ["list of UPI IDs"],
    "attack_method": "string describing the scam type (e.g. OTP fraud, KYC scam, lottery scam)"
  }},
  "corroboration_note": "1-2 sentence explanation of how these artifacts connect",
  "fused_summary": "3-4 sentence comprehensive fraud case summary",
  "recommended_actions": ["action 1", "action 2", "action 3"]
}}

<user_data>
{joined}
</user_data>

Return ONLY the JSON object. No explanation outside the JSON."""


# ---------------------------------------------------------------------------
# Main fusion function
# ---------------------------------------------------------------------------

async def fuse_case(case_id: str, db: AsyncIOMotorDatabase) -> dict:
    """
    Pull all artifacts from a fraud case, fuse them via Gemini,
    run verify_entity on all unique entities, and store results.
    """
    col = db[_FRAUD_CASES_COLLECTION]
    try:
        case = await col.find_one({"_id": ObjectId(case_id)})
    except Exception:
        case = await col.find_one({"_id": case_id})

    if not case:
        return {"error": "Case not found"}

    artifacts = case.get("artifacts", [])
    if len(artifacts) < 2:
        return {"error": "At least 2 artifacts are required for fusion"}

    # --- Run Gemini fusion ---
    prompt = _build_fusion_prompt(artifacts)
    try:
        raw = call_text_llm(prompt, temperature=0.2)
        import json
        # Strip markdown fences if present
        clean = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        fusion_result = json.loads(clean)
    except Exception as exc:
        logger.error(f"Fusion Gemini call failed: {exc}")
        fusion_result = {
            "same_incident": False,
            "confidence": "low",
            "fused_summary": "Unable to complete fusion — AI service unavailable.",
            "scammer_profile": {},
            "corroboration_note": "",
            "recommended_actions": [],
        }

    # --- Verify all entities found in the fusion ---
    scammer = fusion_result.get("scammer_profile", {})
    entity_verdicts = []

    for phone in scammer.get("phones", [])[:3]:
        v = await verify_entity("phone", phone, db)
        entity_verdicts.append({"entity_type": "phone", "value": phone, "verdict": v.verdict, "risk_score": v.risk_score})

    for url in scammer.get("urls", [])[:3]:
        v = await verify_entity("url", url, db)
        entity_verdicts.append({"entity_type": "url", "value": url, "verdict": v.verdict, "risk_score": v.risk_score})

    # Overall verdict from entity checks
    all_verdicts = [ev["verdict"] for ev in entity_verdicts]
    if "malicious" in all_verdicts:
        overall = "malicious"
    elif "suspicious" in all_verdicts:
        overall = "suspicious"
    else:
        overall = "unverified"

    # --- Store fusion result ---
    update_data = {
        "fused_summary": fusion_result.get("fused_summary", ""),
        "scammer_profile": scammer,
        "corroboration_note": fusion_result.get("corroboration_note", ""),
        "recommended_actions": fusion_result.get("recommended_actions", []),
        "same_incident": fusion_result.get("same_incident", False),
        "confidence": fusion_result.get("confidence", "low"),
        "entity_verdicts": entity_verdicts,
        "overall_verdict": overall,
        "status": "fused",
    }

    try:
        await col.update_one(
            {"_id": case.get("_id")},
            {"$set": update_data},
        )
    except Exception as exc:
        logger.error(f"Failed to update fused case: {exc}")

    return {**update_data, "case_id": case_id}
