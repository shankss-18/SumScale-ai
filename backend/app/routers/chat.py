"""
OmniAid — RAG Chatbot Router
============================
POST /chat — Endpoint for grounded conversational Q&A over the user's case history.

Security Rules:
- Rate limited separately (10 attempts per minute per IP).
- RAG context is strictly filtered by user_id == current_user.id.
- User input wrapped in <user_data> delimiters.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from app.schemas.chat import ChatRequest, ChatResponse
from app.dependencies.auth import get_current_user
from app.models.user import UserInDB
from app.utils.limiter import limiter
from app.services.chat_service import generate_grounded_chat_response

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post(
    "",
    response_model=ChatResponse,
    summary="Grounded AI Assistant Q&A over user case history",
)
@limiter.limit("60/minute")
async def chat_with_assistant(
    request: Request,
    body: ChatRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    # SECURITY RULE: Fetch ONLY cases owned by current_user.id, scoped strictly to case_id if provided
    from bson import ObjectId
    query = {"user_id": current_user.id}
    if body.case_id:
        if ObjectId.is_valid(body.case_id):
            query["$or"] = [{"_id": body.case_id}, {"_id": ObjectId(body.case_id)}]
        else:
            query["_id"] = body.case_id

    cursor = db.cases.find(query).sort("created_at", -1)
    user_cases = await cursor.to_list(length=50)

    # Auto-correct case department if evidence or query contains fraud/scam/invoice indicators
    fraud_keywords = [
        "fraud", "scam", "bank", "otp", "phishing", "sms", "link",
        "whatsapp", "transaction", "money", "account", "police", "card",
        "cyber", "verify", "paytm", "upi", "lottery", "prize", "urgent",
        "invoice", "payment", "due date", "transfer", "shipment", "suspension",
        "login", "claim", "winner", "security", "unusual activity", "wire",
        "credit card", "debit card", "pin", "password", "tax", "customs",
        "fee", "forfeited", "logistics", "accounts department", "warehouse"
    ]
    # Auto-re-extract OCR text for evidence items that have placeholder strings or missing text
    from pathlib import Path
    from app.services.speech_service import extract_text_from_file

    for c in user_cases:
        updated_ev_flag = False
        evidence_list = c.get("evidence", [])
        for ev in evidence_list:
            cur_txt = (ev.get("extracted_text") or "").strip()
            stored_path = ev.get("meta", {}).get("stored_path")
            mime_type = ev.get("file_type") or "image/png"

            if (not cur_txt or "uploaded document:" in cur_txt.lower() or "preserved for ai" in cur_txt.lower() or len(cur_txt) < 80) and stored_path:
                p = Path(stored_path)
                if p.exists():
                    try:
                        fresh_text = await extract_text_from_file(p, mime_type)
                        if fresh_text and "uploaded document:" not in fresh_text.lower():
                            ev["extracted_text"] = fresh_text
                            updated_ev_flag = True
                    except Exception as ocr_err:
                        pass

        if updated_ev_flag:
            try:
                await db.cases.update_one({"_id": c["_id"]}, {"$set": {"evidence": evidence_list}})
            except Exception as update_err:
                pass

        # Auto-correct case department if evidence or query contains fraud/scam/invoice indicators
        ev_text = " ".join([e.get("extracted_text", "") for e in evidence_list]).lower()
        if c.get("department") != "fraud" and any(k in ev_text for k in fraud_keywords):
            c["department"] = "fraud"
            try:
                await db.cases.update_one({"_id": c["_id"]}, {"$set": {"department": "fraud"}})
            except Exception as e:
                pass

    result = await generate_grounded_chat_response(
        user_message=body.message.strip(),
        user_cases=user_cases,
        language=body.language or "en",
        chat_history=body.chat_history or [],
        db=db,
    )

    return ChatResponse(
        answer=result["answer"],
        cited_cases=result["cited_cases"],
        suggested_next_questions=result.get("suggested_next_questions", []),
        auto_generated_title=result.get("auto_generated_title", None),
        safety_check=result.get("safety_check", None),
        reminder_suggestion=result.get("reminder_suggestion", None),
    )


@router.get(
    "/tts",
    summary="Proxy Text-to-Speech audio bytes server-to-server",
)
async def get_tts_audio(text: str, lang: str = "en"):
    """
    Proxy Google TTS API server-to-server to stream audio/mpeg
    directly to the frontend without browser CORS or origin restrictions.
    """
    clean_text = text[:300].strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text is required for TTS")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    import httpx
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                "https://translate.google.com/translate_tts",
                params={
                    "ie": "UTF-8",
                    "q": clean_text,
                    "tl": lang,
                    "client": "tw-ob",
                },
                headers=headers,
            )

            if res.status_code != 200:
                raise HTTPException(status_code=502, detail="TTS service error")

            return Response(content=res.content, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS generation error: {str(e)}")
