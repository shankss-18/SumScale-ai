"""
SumScale — Fraud Verification Router (Feature 1)
=================================================
POST /api/fraud/verify         — run threat-intel checks on entity
POST /api/fraud/report         — report a confirmed-malicious entity
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies.auth import get_current_user
from app.schemas.fraud import FraudVerifyRequest, FraudVerdict
from app.services.fraud_verify import verify_entity
from app.services.shared_intel import report_to_shared_intel
from app.utils.limiter import limiter

logger = logging.getLogger("omniaid.routers.fraud")

router = APIRouter(prefix="/api/fraud", tags=["Fraud Verification"])


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


@router.post("/verify", response_model=FraudVerdict)
@limiter.limit("20/minute")
async def verify_entity_endpoint(
    request: Request,
    body: FraudVerifyRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    """
    Run parallel threat-intelligence checks on a URL, phone, domain, or IP.
    Results are cached for 24 hours.
    """
    logger.info(f"Fraud verify: type={body.entity_type} value={body.value[:30]}...")
    try:
        result = await verify_entity(body.entity_type, body.value, db)
        return result
    except Exception as exc:
        logger.error(f"verify_entity failed: {exc}")
        raise HTTPException(status_code=500, detail="Verification failed. Please try again.")


@router.post("/report")
@limiter.limit("10/minute")
async def report_entity(
    request: Request,
    body: FraudVerifyRequest,
    confirmed_malicious: bool = True,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Report a confirmed-malicious entity to the shared community intel DB.
    Uses hashed user ID for privacy.
    """
    result = await report_to_shared_intel(
        entity_type=body.entity_type,
        value=body.value,
        user_id=str(current_user.get("id") or current_user.get("_id", "")),
        confirmed_malicious=confirmed_malicious,
        db=db,
    )
    return result
