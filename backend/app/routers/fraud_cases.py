"""
SumScale — Fraud Cases Router (Feature 2)
==========================================
POST /api/fraud/cases                       — create a new fraud case
POST /api/fraud/cases/{case_id}/artifact    — add an artifact to a case
POST /api/fraud/cases/{case_id}/fuse        — trigger cross-modal fusion
GET  /api/fraud/cases/{case_id}             — get case details
GET  /api/fraud/cases                       — list user's fraud cases
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.dependencies.auth import get_current_user
from app.services.case_fusion import fuse_case
from app.services.ai_service import get_genai_client, PROMPT_INJECTION_PROTECTION
from app.utils.limiter import limiter

logger = logging.getLogger("omniaid.routers.fraud_cases")

router = APIRouter(prefix="/api/fraud/cases", tags=["Fraud Case Fusion"])

_FRAUD_CASES_COLLECTION = "fraud_cases"
_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024   # 15 MB


async def _extract_text_from_bytes(raw: bytes, mime_type: str, filename: str) -> str:
    """Extract text from raw file bytes via Gemini multimodal."""
    from google.genai import types
    client = get_genai_client()
    try:
        file_part = types.Part.from_bytes(data=raw, mime_type=mime_type or "application/octet-stream")
        prompt = (
            f"{PROMPT_INJECTION_PROTECTION}\n\n"
            "Task: Transcribe or extract all visible text, messages, URLs, phone numbers, "
            "UPI IDs, and any other relevant details from this file. "
            "Return plain text ONLY."
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[file_part, prompt],
        )
        return (response.text or "[No text detected]").strip()[:8000]
    except Exception as exc:
        return f"[Extraction failed: {exc}]"


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def _str_id(doc: dict) -> dict:
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


@router.post("", status_code=201)
@limiter.limit("20/minute")
async def create_fraud_case(
    request: Request,
    title: str = Form(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Create a new multi-artifact fraud case."""
    user_id = str(current_user.get("id") or current_user.get("_id", ""))
    doc = {
        "user_id": user_id,
        "title": title[:120],
        "artifacts": [],
        "status": "collecting",
        "created_at": datetime.now(timezone.utc),
    }
    result = await db[_FRAUD_CASES_COLLECTION].insert_one(doc)
    return {"case_id": str(result.inserted_id), "status": "collecting"}


@router.post("/{case_id}/artifact", status_code=201)
@limiter.limit("20/minute")
async def add_artifact(
    request: Request,
    case_id: str,
    artifact_type: str = Form(..., description="image | audio | text"),
    content: Optional[str] = Form(None, description="Raw text content (for SMS/text artifacts)"),
    file: Optional[UploadFile] = File(None, description="Image or audio file"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Add one artifact (image, audio, or text) to a fraud case.
    Text content can be provided directly; files are extracted via Gemini.
    """
    user_id = str(current_user.get("id") or current_user.get("_id", ""))

    # Fetch and validate ownership
    try:
        case = await db[_FRAUD_CASES_COLLECTION].find_one({"_id": ObjectId(case_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Case not found")

    if not case or case.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Case not found")
    if len(case.get("artifacts", [])) >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 artifacts per case")

    extracted_text = content or ""
    filename = None

    if file:
        raw = await file.read()
        if len(raw) > _MAX_FILE_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="File too large (max 15 MB)")
        filename = file.filename
        try:
            extracted_text = await _extract_text_from_bytes(
                raw, file.content_type or "application/octet-stream", filename
            )
        except Exception as exc:
            logger.warning(f"File extraction failed for {filename}: {exc}")
            extracted_text = "[Could not extract text from file]"

    artifact = {
        "artifact_type": artifact_type,
        "filename": filename,
        "extracted_text": extracted_text[:8000],
        "added_at": datetime.now(timezone.utc).isoformat(),
    }

    await db[_FRAUD_CASES_COLLECTION].update_one(
        {"_id": ObjectId(case_id)},
        {"$push": {"artifacts": artifact}},
    )

    artifact_count = len(case.get("artifacts", [])) + 1
    return {
        "case_id": case_id,
        "artifact_count": artifact_count,
        "can_fuse": artifact_count >= 2,
    }


@router.post("/{case_id}/fuse")
@limiter.limit("10/minute")
async def fuse_fraud_case(
    request: Request,
    case_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Trigger Gemini cross-modal fusion on all artifacts in a fraud case.
    Requires at least 2 artifacts.
    """
    user_id = str(current_user.get("id") or current_user.get("_id", ""))

    try:
        case = await db[_FRAUD_CASES_COLLECTION].find_one({"_id": ObjectId(case_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Case not found")

    if not case or case.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Case not found")

    result = await fuse_case(case_id, db)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.get("/{case_id}")
async def get_fraud_case(
    case_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get a single fraud case by ID."""
    user_id = str(current_user.get("id") or current_user.get("_id", ""))
    try:
        case = await db[_FRAUD_CASES_COLLECTION].find_one({"_id": ObjectId(case_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Case not found")

    if not case or case.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Case not found")

    return _str_id(case)


@router.get("")
async def list_fraud_cases(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List all fraud cases for the authenticated user."""
    user_id = str(current_user.get("id") or current_user.get("_id", ""))
    cursor = db[_FRAUD_CASES_COLLECTION].find(
        {"user_id": user_id},
        {"artifacts": 0},   # exclude full artifact text from list view
    ).sort("created_at", -1).limit(50)
    cases = [_str_id(c) async for c in cursor]
    return {"cases": cases, "total": len(cases)}
