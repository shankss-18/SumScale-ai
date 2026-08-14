"""
SumScale — Shared Fraud Intelligence Service
=============================================
Community-powered, privacy-preserving database of flagged entities.

- check_shared_intel(entity_type, value, db) → SharedIntelResult
  Fast MongoDB lookup. Auto-flags entities with report_count >= 3.

- report_to_shared_intel(entity_type, value, user_id, confirmed_malicious, db)
  Upsert with hashed user_id to preserve privacy.
"""

import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.schemas.fraud import SharedIntelResult

logger = logging.getLogger("omniaid.shared_intel")

_COLLECTION = "shared_fraud_intel"
_AUTO_FLAG_THRESHOLD = 3   # flag as malicious after this many reports


def _hash_entity(entity_type: str, value: str) -> str:
    """Canonical key: SHA-256 of lowercased type:value."""
    canonical = f"{entity_type.lower()}:{value.strip().lower()}"
    return hashlib.sha256(canonical.encode()).hexdigest()


def _hash_user(user_id: str) -> str:
    """One-way hash of user_id — stored instead of raw id for privacy."""
    return hashlib.sha256(user_id.encode()).hexdigest()[:16]


async def check_shared_intel(
    entity_type: str,
    value: str,
    db: AsyncIOMotorDatabase,
) -> SharedIntelResult:
    """
    Check if this entity is in the community fraud intelligence DB.
    Returns a SharedIntelResult with found, report_count, and auto_flagged.
    """
    try:
        key = _hash_entity(entity_type, value)
        col = db[_COLLECTION]
        doc = await col.find_one({"_id": key})

        if not doc:
            return SharedIntelResult(found=False)

        return SharedIntelResult(
            found=True,
            report_count=doc.get("report_count", 0),
            auto_flagged=doc.get("auto_flagged", False),
            last_reported=doc.get("last_reported"),
        )
    except Exception as exc:
        logger.warning(f"shared_intel check failed: {exc}")
        return SharedIntelResult(found=False)


async def report_to_shared_intel(
    entity_type: str,
    value: str,
    user_id: str,
    confirmed_malicious: bool,
    db: AsyncIOMotorDatabase,
) -> dict:
    """
    Upsert a community report for this entity.
    Increments report_count and auto-flags at threshold.
    """
    try:
        key = _hash_entity(entity_type, value)
        user_hash = _hash_user(user_id)
        col = db[_COLLECTION]
        now = datetime.now(timezone.utc)

        existing = await col.find_one({"_id": key})
        reporters = set(existing.get("reporters", [])) if existing else set()
        reporters.add(user_hash)
        count = len(reporters)
        auto_flagged = count >= _AUTO_FLAG_THRESHOLD and confirmed_malicious

        await col.update_one(
            {"_id": key},
            {
                "$set": {
                    "entity_type": entity_type,
                    "value_preview": value[:30],   # store only a prefix for display
                    "report_count": count,
                    "auto_flagged": auto_flagged,
                    "last_reported": now,
                    "reporters": list(reporters),
                }
            },
            upsert=True,
        )
        logger.info(
            f"shared_intel updated: {entity_type}:{value[:20]}... "
            f"count={count} auto_flagged={auto_flagged}"
        )
        return {"success": True, "report_count": count, "auto_flagged": auto_flagged}
    except Exception as exc:
        logger.error(f"report_to_shared_intel failed: {exc}")
        return {"success": False}


async def get_intel_stats(db: AsyncIOMotorDatabase) -> dict:
    """Aggregate stats for the public intel-stats endpoint."""
    try:
        col = db[_COLLECTION]
        total = await col.count_documents({})
        auto_flagged = await col.count_documents({"auto_flagged": True})

        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        pipeline = [
            {"$match": {"last_reported": {"$gte": week_ago}}},
            {"$sort": {"report_count": -1}},
            {"$limit": 5},
            {"$project": {
                "_id": 0,
                "entity_type": 1,
                "value_preview": 1,
                "report_count": 1,
                "auto_flagged": 1,
            }},
        ]
        top_docs = await col.aggregate(pipeline).to_list(5)
        return {
            "total_entities_tracked": total,
            "auto_flagged_count": auto_flagged,
            "top_flagged_this_week": top_docs,
        }
    except Exception as exc:
        logger.error(f"get_intel_stats failed: {exc}")
        return {"total_entities_tracked": 0, "auto_flagged_count": 0, "top_flagged_this_week": []}
