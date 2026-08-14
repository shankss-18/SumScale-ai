"""
OmniAid — Case Processing & Upload Router
==========================================
Provides case creation, multipart file uploads, AI analysis, clarifying loops,
file retrieval, and deletion.

Security & Isolation Rules:
- Every query, upload, analysis, retrieval, or deletion is strictly filtered by `user_id == current_user.id`.
- Uploaded files are validated via python-magic bytes (not headers/extensions), size-capped (15MB), and count-capped (5 files per case).
- Upload files are stored in non-web-accessible directories and served ONLY via authenticated GET /cases/{id}/files/{file_id}.
- Deleting a case physically removes all associated files from disk.
"""

from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from uuid import uuid4
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query, UploadFile, File
from fastapi.responses import FileResponse

from app.schemas.case import CaseCreateRequest, CaseClarifyingAnswerRequest, CaseUpdateTitleRequest, CaseMarkCategoryRequest
from app.models.case import CaseInDB, EvidenceItem
from app.dependencies.auth import get_current_user
from app.models.user import UserInDB
from app.utils.limiter import limiter
from app.utils.file_validation import (
    validate_file,
    save_upload_file,
    delete_case_files,
    MAX_FILES_PER_CASE,
    BASE_UPLOAD_DIR,
)
from app.services.speech_service import extract_text_from_file
from app.services.ai_service import (
    extract_and_reason_health,
    extract_and_reason_fraud,
    extract_and_reason_data,
)

router = APIRouter(prefix="/cases", tags=["cases"])


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=CaseInDB,
    summary="Create a new case envelope",
)
@limiter.limit("20/minute")
async def create_case(
    request: Request,
    body: CaseCreateRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    case_id = f"case_{uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    evidence = []
    if body.description and body.description.strip():
        evidence.append({
            "file_id": None,
            "file_type": "text/plain",
            "original_name": "user_description.txt",
            "extracted_text": body.description.strip(),
            "meta": {"source": "free_text"},
        })

    case_doc = {
        "_id": case_id,
        "user_id": current_user.id,
        "department": body.department,
        "status": "draft",
        "evidence": evidence,
        "merged_facts": {},
        "clarifying_qa": [],
        "findings": {},
        "reminder": None,
        "created_at": now,
        "updated_at": now,
    }

    await db.cases.insert_one(case_doc)
    return CaseInDB(**case_doc)


@router.post(
    "/{case_id}/upload",
    response_model=CaseInDB,
    summary="Upload evidence files to a case",
)
@limiter.limit("10/minute")
async def upload_case_file(
    request: Request,
    case_id: str,
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    # 1. Fetch case & verify ownership
    case_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    if not case_doc:
        raise HTTPException(status_code=404, detail="Case not found")

    # 2. Check file count limit (max 5 per case)
    current_evidence = case_doc.get("evidence", [])
    file_evidence_count = sum(1 for e in current_evidence if e.get("file_id") is not None)
    if file_evidence_count >= MAX_FILES_PER_CASE:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum limit of {MAX_FILES_PER_CASE} files per case reached.",
        )

    # 3. Read content bytes for magic detection & size check
    content = await file.read()
    filename = file.filename or "uploaded_file"

    is_valid, detected_mime, error_msg = validate_file(
        content=content,
        original_filename=filename,
        department=case_doc["department"],
    )

    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    # 4. Save to non-web-accessible directory
    file_id, file_path = save_upload_file(
        content=content,
        user_id=current_user.id,
        case_id=case_id,
        original_filename=filename,
    )

    # 5. Extract text/transcript asynchronously via multimodal service
    extracted_text = await extract_text_from_file(file_path, detected_mime)

    new_evidence_item = {
        "file_id": file_id,
        "file_type": detected_mime,
        "original_name": filename,
        "extracted_text": extracted_text,
        "meta": {
            "size_bytes": len(content),
            "stored_path": str(file_path),
        },
    }

    # Filter out existing evidence item with same original_name to prevent duplicates
    updated_evidence = [e for e in current_evidence if e.get("original_name") != filename]
    updated_evidence.append(new_evidence_item)

    now = datetime.now(timezone.utc)

    await db.cases.update_one(
        {"_id": case_id, "user_id": current_user.id},
        {
            "$set": {"evidence": updated_evidence, "updated_at": now},
        },
    )

    updated_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    return CaseInDB(**updated_doc)


@router.post(
    "/{case_id}/analyze",
    response_model=CaseInDB,
    summary="Run AI analysis pipeline on case evidence",
)
@limiter.limit("10/minute")
async def analyze_case(
    request: Request,
    case_id: str,
    language: str = Query(default="en"),
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    # 1. Fetch case & verify ownership
    case_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    if not case_doc:
        raise HTTPException(status_code=404, detail="Case not found")

    evidence_items = case_doc.get("evidence", [])
    if not evidence_items:
        raise HTTPException(status_code=400, detail="Please upload evidence or enter a description before analyzing.")

    evidence_texts = [
        item.get("extracted_text", "")
        for item in evidence_items
        if item.get("extracted_text")
    ]

    dept = case_doc.get("department")

    # Comprehensive auto-detection for fraud, phishing, scam, fake invoice, security threats
    combined_evidence = " ".join(evidence_texts).lower()
    fraud_keywords = [
        "fraud", "scam", "bank", "otp", "phishing", "sms", "link",
        "whatsapp", "transaction", "money", "account", "police", "card",
        "cyber", "verify", "paytm", "upi", "lottery", "prize", "urgent",
        "invoice", "payment", "due date", "transfer", "shipment", "suspension",
        "login", "claim", "winner", "security", "unusual activity", "wire",
        "credit card", "debit card", "pin", "password", "tax", "customs",
        "fee", "forfeited", "logistics", "accounts department", "warehouse"
    ]
    if any(k in combined_evidence for k in fraud_keywords):
        dept = "fraud"

    previous_facts = case_doc.get("merged_facts", {})
    clarifying_qa = {
        qa["question_id"]: qa.get("answer", "")
        for qa in case_doc.get("clarifying_qa", [])
        if qa.get("answer")
    }

    # 2. Dispatch to department pipeline
    if dept == "fraud":
        new_status, merged_facts, questions, findings = await extract_and_reason_fraud(
            evidence_texts=evidence_texts,
            previous_facts=previous_facts,
            language=language,
        )
    elif dept == "data":
        new_status, merged_facts, questions, findings = await extract_and_reason_data(
            evidence_texts=evidence_texts,
            previous_facts=previous_facts,
            language=language,
        )
    else:  # health
        new_status, merged_facts, questions, findings = await extract_and_reason_health(
            evidence_texts=evidence_texts,
            previous_facts=previous_facts,
            clarifying_answers=clarifying_qa,
            language=language,
        )

    now = datetime.now(timezone.utc)
    update_data = {
        "department": dept,  # Persist auto-detected department back to DB!
        "status": new_status,
        "merged_facts": merged_facts,
        "findings": findings,
        "updated_at": now,
    }
    if questions:
        update_data["clarifying_qa"] = questions

    await db.cases.update_one(
        {"_id": case_id, "user_id": current_user.id},
        {"$set": update_data},
    )

    updated_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    return CaseInDB(**updated_doc)


@router.post(
    "/{case_id}/clarify",
    response_model=CaseInDB,
    summary="Submit answers to clarifying questions",
)
@limiter.limit("10/minute")
async def answer_clarifying_questions(
    request: Request,
    case_id: str,
    answers: List[CaseClarifyingAnswerRequest],
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    case_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    if not case_doc:
        raise HTTPException(status_code=404, detail="Case not found")

    existing_qa = case_doc.get("clarifying_qa", [])
    answer_map = {ans.question_id: ans.answer for ans in answers}

    now = datetime.now(timezone.utc)
    updated_qa = []
    for item in existing_qa:
        qid = item["question_id"]
        if qid in answer_map:
            item["answer"] = answer_map[qid]
            item["answered_at"] = now
        updated_qa.append(item)

    await db.cases.update_one(
        {"_id": case_id, "user_id": current_user.id},
        {"$set": {"clarifying_qa": updated_qa, "updated_at": now}},
    )

    # Automatically trigger re-analysis pass
    return await analyze_case(request=request, case_id=case_id, current_user=current_user)


@router.get(
    "",
    response_model=List[CaseInDB],
    summary="List cases for authenticated user",
)
async def list_cases(
    request: Request,
    department: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    query = {"user_id": current_user.id}
    if department:
        query["department"] = department
    if status_filter:
        query["status"] = status_filter

    cursor = db.cases.find(query).sort("created_at", -1)
    cases = await cursor.to_list(length=100)
    return [CaseInDB(**doc) for doc in cases]


@router.get(
    "/{case_id}",
    response_model=CaseInDB,
    summary="Get case details by ID",
)
async def get_case(
    request: Request,
    case_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    case_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    if not case_doc:
        raise HTTPException(status_code=404, detail="Case not found")

    return CaseInDB(**case_doc)


@router.get(
    "/{case_id}/files/{file_id}",
    summary="Download/view an uploaded evidence file safely",
)
async def get_case_file(
    request: Request,
    case_id: str,
    file_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    """
    Secure file delivery endpoint: verifies user owns the case before returning file content.
    """
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    case_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    if not case_doc:
        raise HTTPException(status_code=404, detail="Case not found")

    target_evidence = next(
        (e for e in case_doc.get("evidence", []) if e.get("file_id") == file_id),
        None,
    )
    if not target_evidence:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = BASE_UPLOAD_DIR / current_user.id / case_id / f"{file_id}{Path(target_evidence['original_name']).suffix.lower()}"

    if not file_path.exists():
        # Fallback search inside case dir
        case_dir = BASE_UPLOAD_DIR / current_user.id / case_id
        matching_files = list(case_dir.glob(f"{file_id}.*")) if case_dir.exists() else []
        if matching_files:
            file_path = matching_files[0]
        else:
            raise HTTPException(status_code=404, detail="File content missing on server disk")

    return FileResponse(
        path=file_path,
        media_type=target_evidence["file_type"],
        filename=target_evidence["original_name"],
    )


@router.delete(
    "/{case_id}",
    summary="Delete a case and all associated files from disk",
)
async def delete_case(
    request: Request,
    case_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    case_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    if not case_doc:
        raise HTTPException(status_code=404, detail="Case not found")

    # 1. Delete physical files from disk
    delete_case_files(user_id=current_user.id, case_id=case_id)

    # 2. Delete database record
    await db.cases.delete_one({"_id": case_id, "user_id": current_user.id})

    return {"status": "deleted", "case_id": case_id}


@router.patch(
    "/{case_id}/title",
    response_model=CaseInDB,
    summary="Update custom title for a case / chat session",
)
async def update_case_title(
    request: Request,
    case_id: str,
    body: CaseUpdateTitleRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    case_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    if not case_doc:
        raise HTTPException(status_code=404, detail="Case not found")

    now = datetime.now(timezone.utc)
    new_title = body.title.strip()

    await db.cases.update_one(
        {"_id": case_id, "user_id": current_user.id},
        {"$set": {"title": new_title, "updated_at": now}}
    )

    updated_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    return CaseInDB(**updated_doc)


@router.post(
    "/{case_id}/messages",
    response_model=CaseInDB,
    summary="Save chat history messages for a case",
)
async def save_case_chat_history(
    request: Request,
    case_id: str,
    body: Dict[str, Any],
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    messages = body.get("messages", [])
    now = datetime.now(timezone.utc)

    await db.cases.update_one(
        {"_id": case_id, "user_id": current_user.id},
        {"$set": {"chat_history": messages, "updated_at": now}}
    )

    updated_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    if not updated_doc:
        raise HTTPException(status_code=404, detail="Case not found")
    return CaseInDB(**updated_doc)


@router.patch(
    "/{case_id}/category",
    response_model=CaseInDB,
    summary="Mark/update case status and severity category",
)
async def update_case_category(
    request: Request,
    case_id: str,
    body: CaseMarkCategoryRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    case_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    if not case_doc:
        raise HTTPException(status_code=404, detail="Case not found")

    now = datetime.now(timezone.utc)
    set_fields = {"updated_at": now}

    if body.status is not None:
        set_fields["status"] = body.status

    if body.severity is not None:
        findings = case_doc.get("findings") or {}
        findings["severity"] = body.severity
        findings["escalation_flag"] = body.severity
        set_fields["findings"] = findings

    await db.cases.update_one(
        {"_id": case_id, "user_id": current_user.id},
        {"$set": set_fields}
    )

    updated_doc = await db.cases.find_one({"_id": case_id, "user_id": current_user.id})
    return CaseInDB(**updated_doc)


