"""
SumScale — Trust Circle Router
================================
Instagram/Facebook-style invite flow for trusted contacts.

Invite lifecycle:
  1. User A adds User B's email → origin entry (invite_status=pending) for A,
     mirrored entry (invite_status=pending, sync_status=mirrored) in B's circle.
     A notification email is sent to B via Brevo.
  2. User B sees pending invite and clicks Accept or Decline.
  3. Accept → both entries → invite_status=accepted, status=active
  4. Decline → both entries deleted

Security: every DB query is strictly scoped to current_user.id.
"""

import logging
from datetime import datetime, timezone
from typing import List, Dict, Any
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status, Request

from app.models.trust_circle import (
    TrustCircleMemberInDB,
    TrustCircleCreateRequest,
    TrustCircleUpdateRequest,
    TrustCirclePermissions,
)
from app.dependencies.auth import get_current_user
from app.models.user import UserInDB

logger = logging.getLogger("omniaid.trust_circle")

router = APIRouter(prefix="/trust-circle", tags=["trust-circle"])


def _doc_to_member(doc: dict) -> TrustCircleMemberInDB:
    """Normalise MongoDB document → Pydantic model."""
    doc["id"] = str(doc.get("_id") or doc.get("id", ""))
    return TrustCircleMemberInDB(**doc)


# ---------------------------------------------------------------------------
# 1. List your Trust Circle (accepted + manual only, no pending received)
# ---------------------------------------------------------------------------
@router.get(
    "",
    response_model=List[TrustCircleMemberInDB],
    summary="List accepted/active trusted contacts for authenticated user",
)
async def list_trust_circle_members(
    request: Request,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    cursor = db.trust_circle.find({
        "user_id": current_user.id,
        "invite_status": {"$in": ["accepted", "manual"]},
    }).sort("created_at", -1)
    docs = await cursor.to_list(length=100)
    return [_doc_to_member(d) for d in docs]


# ---------------------------------------------------------------------------
# 2. List pending invites YOU sent (so you can cancel them)
# ---------------------------------------------------------------------------
@router.get(
    "/pending-sent",
    response_model=List[TrustCircleMemberInDB],
    summary="List pending invites sent by authenticated user",
)
async def list_pending_sent(
    request: Request,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    cursor = db.trust_circle.find({
        "user_id": current_user.id,
        "invite_status": "pending",
        "sync_status": "origin",
    }).sort("created_at", -1)
    docs = await cursor.to_list(length=100)
    return [_doc_to_member(d) for d in docs]


# ---------------------------------------------------------------------------
# 3. List pending invites YOU received (for the accept/decline panel)
# ---------------------------------------------------------------------------
@router.get(
    "/pending-received",
    response_model=List[TrustCircleMemberInDB],
    summary="List pending Trust Circle invites received by authenticated user",
)
async def list_pending_received(
    request: Request,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    cursor = db.trust_circle.find({
        "user_id": current_user.id,
        "invite_status": "pending",
        "sync_status": "mirrored",
    }).sort("created_at", -1)
    docs = await cursor.to_list(length=100)
    return [_doc_to_member(d) for d in docs]


# ---------------------------------------------------------------------------
# 4. Send a Trust Circle invite (add member)
# ---------------------------------------------------------------------------
@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=TrustCircleMemberInDB,
    summary="Send a Trust Circle invite to a contact",
)
async def add_trust_circle_member(
    request: Request,
    body: TrustCircleCreateRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    target_email = body.email.lower().strip()

    # Prevent inviting yourself
    if target_email == current_user.email.lower():
        raise HTTPException(status_code=400, detail="You cannot add yourself to your own Trust Circle.")

    # Prevent duplicate pending/accepted invite
    existing = await db.trust_circle.find_one({
        "user_id": current_user.id,
        "email": target_email,
        "invite_status": {"$in": ["pending", "accepted", "manual"]},
    })
    if existing:
        raise HTTPException(
            status_code=409,
            detail="You already have an active or pending connection with this contact."
        )

    permissions = body.permissions or TrustCirclePermissions()
    now = datetime.now(timezone.utc)
    member_id = f"tc_{uuid4().hex[:12]}"

    # Check if target email belongs to a registered SumScale user
    target_user_doc = await db.users.find_one({"email": target_email})
    is_registered_user = target_user_doc is not None

    if is_registered_user:
        # --- Instagram-style invite flow ---
        mirror_id = f"tc_{uuid4().hex[:12]}"
        target_user_id = str(target_user_doc["_id"])
        inviter_name = current_user.full_name or current_user.email

        # Origin entry in User A's circle (status: pending, hidden from B's active list)
        origin_doc = {
            "_id": member_id,
            "id": member_id,
            "user_id": current_user.id,
            "name": body.name.strip(),
            "relationship": body.relationship.strip(),
            "email": target_email,
            "phone": body.phone.strip() if body.phone else None,
            "permissions": permissions.model_dump(),
            "status": "inactive",           # becomes active on acceptance
            "invite_status": "pending",
            "sync_status": "origin",
            "mirror_member_id": mirror_id,
            "invited_by_user_id": current_user.id,
            "invited_by_name": inviter_name,
            "invited_by_email": current_user.email,
            "created_at": now,
            "updated_at": now,
        }

        # Mirror entry in User B's circle (the invite they see and can accept/decline)
        mirror_doc = {
            "_id": mirror_id,
            "id": mirror_id,
            "user_id": target_user_id,
            "name": inviter_name,
            "relationship": body.relationship.strip(),
            "email": current_user.email,
            "phone": None,
            "permissions": TrustCirclePermissions().model_dump(),
            "status": "inactive",
            "invite_status": "pending",
            "sync_status": "mirrored",
            "mirror_member_id": member_id,
            "invited_by_user_id": current_user.id,
            "invited_by_name": inviter_name,
            "invited_by_email": current_user.email,
            "created_at": now,
            "updated_at": now,
        }

        await db.trust_circle.insert_one(origin_doc)
        await db.trust_circle.insert_one(mirror_doc)

        # Fire invite notification email via agentic alert engine (non-blocking)
        try:
            from app.services.alert_engine import dispatch_brevo_email
            import asyncio
            asyncio.create_task(dispatch_brevo_email(
                recipient_email=target_email,
                subject=f"🛡️ {inviter_name} wants to add you to their SumScale Trust Circle",
                html_body=f"""
                <div style="font-family:Arial,sans-serif;padding:20px;background:#f4f7f6">
                  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #83C5BE;border-radius:24px;padding:32px;text-align:center">
                    <h2 style="color:#006D77;margin-top:0">Trust Circle Invite</h2>
                    <p style="font-size:14px;color:#555">
                      <strong>{inviter_name}</strong> ({current_user.email}) has sent you a
                      Trust Circle invite on SumScale.
                    </p>
                    <p style="font-size:13px;color:#666">
                      Log in to SumScale → Profile → Trust Circle to Accept or Decline.
                    </p>
                    <a href="http://localhost:5173/profile?tab=trust-circle"
                       style="display:inline-block;margin-top:16px;background:#006D77;color:#fff;padding:12px 28px;border-radius:30px;text-decoration:none;font-weight:bold">
                      View Invite →
                    </a>
                    <p style="font-size:11px;color:#aaa;margin-top:24px">
                      © 2026 SumScale · This invite will expire if not accepted.
                    </p>
                  </div>
                </div>
                """,
            ))
        except Exception as e:
            logger.warning(f"Could not send invite notification email: {e}")

        return _doc_to_member(origin_doc)

    else:
        # --- Non-user contact: manual entry, active immediately (no invite needed) ---
        doc = {
            "_id": member_id,
            "id": member_id,
            "user_id": current_user.id,
            "name": body.name.strip(),
            "relationship": body.relationship.strip(),
            "email": target_email,
            "phone": body.phone.strip() if body.phone else None,
            "permissions": permissions.model_dump(),
            "status": "active",
            "invite_status": "manual",
            "sync_status": "origin",
            "mirror_member_id": None,
            "invited_by_user_id": None,
            "invited_by_name": None,
            "invited_by_email": None,
            "created_at": now,
            "updated_at": now,
        }
        await db.trust_circle.insert_one(doc)
        return _doc_to_member(doc)


# ---------------------------------------------------------------------------
# 5. Accept a pending invite (User B accepts invite from User A)
# ---------------------------------------------------------------------------
@router.post(
    "/{member_id}/accept",
    response_model=TrustCircleMemberInDB,
    summary="Accept a pending Trust Circle invite",
)
async def accept_trust_circle_invite(
    request: Request,
    member_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    # Must be a pending mirrored invite for current user
    invite = await db.trust_circle.find_one({
        "_id": member_id,
        "user_id": current_user.id,
        "invite_status": "pending",
        "sync_status": "mirrored",
    })
    if not invite:
        raise HTTPException(status_code=404, detail="Pending invite not found")

    now = datetime.now(timezone.utc)

    # Activate mirror entry (User B's side)
    await db.trust_circle.update_one(
        {"_id": member_id},
        {"$set": {"invite_status": "accepted", "status": "active", "updated_at": now}},
    )

    # Activate origin entry (User A's side)
    mirror_id = invite.get("mirror_member_id")
    if mirror_id:
        await db.trust_circle.update_one(
            {"_id": mirror_id},
            {"$set": {"invite_status": "accepted", "status": "active", "updated_at": now}},
        )

    updated = await db.trust_circle.find_one({"_id": member_id})
    return _doc_to_member(updated)


# ---------------------------------------------------------------------------
# 6. Decline a pending invite (User B declines — removes both entries)
# ---------------------------------------------------------------------------
@router.post(
    "/{member_id}/decline",
    summary="Decline and remove a pending Trust Circle invite",
)
async def decline_trust_circle_invite(
    request: Request,
    member_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    invite = await db.trust_circle.find_one({
        "_id": member_id,
        "user_id": current_user.id,
        "invite_status": "pending",
        "sync_status": "mirrored",
    })
    if not invite:
        raise HTTPException(status_code=404, detail="Pending invite not found")

    mirror_id = invite.get("mirror_member_id")

    # Remove mirror entry (User B's side)
    await db.trust_circle.delete_one({"_id": member_id})

    # Remove origin entry (User A's side) — no dangling connection
    if mirror_id:
        await db.trust_circle.delete_one({"_id": mirror_id})

    return {"status": "declined", "member_id": member_id}


# ---------------------------------------------------------------------------
# 7. Update a member's details / permissions
# ---------------------------------------------------------------------------
@router.put(
    "/{member_id}",
    response_model=TrustCircleMemberInDB,
    summary="Update a trusted contact's details and granular permissions",
)
async def update_trust_circle_member(
    request: Request,
    member_id: str,
    body: TrustCircleUpdateRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    existing = await db.trust_circle.find_one({"_id": member_id, "user_id": current_user.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Trust Circle member not found")

    update_fields: Dict[str, Any] = {}
    if body.name is not None:
        update_fields["name"] = body.name.strip()
    if body.relationship is not None:
        update_fields["relationship"] = body.relationship.strip()
    if body.email is not None:
        update_fields["email"] = body.email.lower().strip()
    if body.phone is not None:
        update_fields["phone"] = body.phone.strip()
    if body.permissions is not None:
        update_fields["permissions"] = body.permissions.model_dump()
    if body.status is not None:
        update_fields["status"] = body.status

    update_fields["updated_at"] = datetime.now(timezone.utc)

    await db.trust_circle.update_one(
        {"_id": member_id, "user_id": current_user.id},
        {"$set": update_fields},
    )

    updated_doc = await db.trust_circle.find_one({"_id": member_id, "user_id": current_user.id})
    return _doc_to_member(updated_doc)


# ---------------------------------------------------------------------------
# 8. Remove / cancel a member or outgoing invite
# ---------------------------------------------------------------------------
@router.delete(
    "/{member_id}",
    summary="Remove a member from your Trust Circle (or cancel an outgoing invite)",
)
async def remove_trust_circle_member(
    request: Request,
    member_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    doc = await db.trust_circle.find_one({"_id": member_id, "user_id": current_user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Trust Circle member not found")

    mirror_id = doc.get("mirror_member_id")
    sync_status = doc.get("sync_status", "origin")

    # Delete current user's entry
    await db.trust_circle.delete_one({"_id": member_id})

    # If this was an origin entry, also remove the mirrored counterpart
    # (but only if it's still "pending" — don't delete if the other user accepted and customised)
    if mirror_id and sync_status == "origin":
        mirror_doc = await db.trust_circle.find_one({"_id": mirror_id})
        if mirror_doc and mirror_doc.get("invite_status") == "pending":
            await db.trust_circle.delete_one({"_id": mirror_id})

    # If user deletes their accepted mirrored entry, also clean up the origin
    if mirror_id and sync_status == "mirrored":
        mirror_doc = await db.trust_circle.find_one({"_id": mirror_id})
        if mirror_doc and mirror_doc.get("invite_status") in ("accepted", "pending"):
            await db.trust_circle.delete_one({"_id": mirror_id})

    return {"status": "removed", "member_id": member_id}
