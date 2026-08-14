"""
OmniAid — Standalone Demo Data Seeder
======================================
Inserts pre-built synthetic demo cases into MongoDB for live demonstration reliability.

Seeded Cases:
1. Health — Clean / Mild (Low escalation, no doctor needed)
2. Health — Escalated (High escalation, doctor suggested, follow-up reminder set)
3. Fraud — Phishing Attempt (High severity, detailed evidence citations & remediation checklist)
4. Fraud — Ambiguous / Legitimate (Low severity, delivery notification)

Idempotent: Uses fixed deterministic IDs (_id) so running multiple times updates/skips
without duplicating records.
"""

import sys
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add backend directory to sys.path so app imports work
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings
from app.utils.auth import hash_password

DEMO_USER_EMAIL = "demo@omniaid.ai"
DEMO_USER_PASSWORD = "DemoUserPass123!"

DEMO_USER_ID = "507f191e810c19729de860ea"  # Valid 24-char ObjectId string


async def seed_data(db=None):
    client = None
    if db is None:
        print(f"Connecting to MongoDB at {settings.MONGODB_URL}...")
        client = AsyncIOMotorClient(settings.MONGODB_URL, serverSelectionTimeoutMS=3000)
        db = client[settings.MONGODB_DB_NAME]
        try:
            await client.admin.command("ping")
            print("Connected to MongoDB successfully.")
        except Exception as e:
            print(f"Warning: Could not connect to real MongoDB instance: {e}")
            if client:
                client.close()
            return False

    # 1. Upsert Demo User
    demo_user_doc = {
        "_id": DEMO_USER_ID,
        "email": DEMO_USER_EMAIL,
        "hashed_password": hash_password(DEMO_USER_PASSWORD),
        "created_at": datetime.now(timezone.utc),
    }

    existing_user = await db.users.find_one({"email": DEMO_USER_EMAIL})
    if existing_user:
        user_id = str(existing_user["_id"])
        print(f"Demo user '{DEMO_USER_EMAIL}' already exists (ID: {user_id}).")
    else:
        res = await db.users.insert_one(demo_user_doc)
        user_id = str(res.inserted_id)
        print(f"Created demo user '{DEMO_USER_EMAIL}' (ID: {user_id}).")

    now = datetime.now(timezone.utc)
    reminder_due = now + timedelta(days=3)

    # 2. Seed Cases
    cases = [
        # Case 1: Health — Mild / Resolved
        {
            "_id": "demo_case_health_mild",
            "user_id": user_id,
            "department": "health",
            "status": "completed",
            "evidence": [
                {
                    "file_id": None,
                    "file_type": "text/plain",
                    "original_name": "symptom_notes.txt",
                    "extracted_text": "I have had a mild scratchy throat and runny nose since yesterday morning. No fever or body aches.",
                    "meta": {"source": "voice_note"},
                }
            ],
            "merged_facts": {
                "symptoms": ["mild scratchy throat", "runny nose"],
                "duration": "1 day",
                "severity_self_reported": "mild",
                "body_part": "throat/nasal",
                "visual_findings": "none",
                "report_summary": "none",
                "existing_conditions_mentioned": [],
                "medications_mentioned": [],
            },
            "clarifying_qa": [],
            "findings": {
                "summary": "Mild upper respiratory scratchiness and nasal congestion.",
                "likely_associations": [
                    "Common Cold (Rhinovirus)",
                    "Seasonal Environmental Allergies",
                ],
                "otc_suggestions": [
                    "Stay well hydrated with warm fluids",
                    "Saline nasal spray for congestion",
                    "Sufficient vocal and physical rest",
                ],
                "educational_resources": [
                    {
                        "title": "Cold vs. Allergies Overview",
                        "url": "https://www.youtube.com/results?search_query=common+cold+vs+allergies",
                    }
                ],
                "escalation_flag": "low",
                "escalation_reason": "Mild localized symptoms without fever or shortness of breath.",
                "suggest_nearby_doctor": False,
                "disclaimer": "This is decision-support only. It is not a medical diagnosis and does not replace a doctor.",
            },
            "reminder": None,
            "created_at": now - timedelta(hours=12),
            "updated_at": now - timedelta(hours=12),
        },
        # Case 2: Health — Escalated with Reminder
        {
            "_id": "demo_case_health_escalated",
            "user_id": user_id,
            "department": "health",
            "status": "completed",
            "evidence": [
                {
                    "file_id": "file_demo_rash_img",
                    "file_type": "image/jpeg",
                    "original_name": "arm_patch.jpg",
                    "extracted_text": "Spreading red circular rash on forearm for 4 days accompanied by low-grade fever.",
                    "meta": {"source": "photo_upload"},
                }
            ],
            "merged_facts": {
                "symptoms": ["spreading red circular rash", "low-grade fever"],
                "duration": "4 days",
                "severity_self_reported": "moderate",
                "body_part": "forearm",
                "visual_findings": "Erythematous circular lesion with mild central clearing.",
                "report_summary": "none",
                "existing_conditions_mentioned": [],
                "medications_mentioned": [],
            },
            "clarifying_qa": [
                {
                    "question_id": "q_duration",
                    "question": "How long have you been experiencing these symptoms?",
                    "answer": "Started 4 days ago after a hike.",
                    "answered_at": now - timedelta(hours=5),
                }
            ],
            "findings": {
                "summary": "Spreading circular skin lesion with systemic low-grade fever following outdoor exposure.",
                "likely_associations": [
                    "Contact Dermatitis",
                    "Erythema Migrans (Associated with tick-borne exposure)",
                    "Fungal Ringworm (Tinea Corporis)",
                ],
                "otc_suggestions": [
                    "Avoid scratching or applying unverified creams",
                    "Keep the affected area clean and dry",
                    "Document rash boundary with a soft marker to monitor expansion",
                ],
                "educational_resources": [
                    {
                        "title": "Identifying Expanding Skin Lesions",
                        "url": "https://www.youtube.com/results?search_query=erythema+migrans+identification",
                    }
                ],
                "escalation_flag": "high",
                "escalation_reason": "Expanding rash combined with fever requires clinical evaluation by a medical professional.",
                "suggest_nearby_doctor": True,
                "disclaimer": "This is decision-support only. It is not a medical diagnosis and does not replace a doctor.",
            },
            "reminder": {
                "reminder_id": "rem_dermatologist_01",
                "title": "Follow up with Primary Doctor or Dermatologist",
                "due_date": reminder_due,
                "is_completed": False,
                "notes": "Evaluate forearm rash if redness expands further.",
            },
            "created_at": now - timedelta(hours=6),
            "updated_at": now - timedelta(hours=5),
        },
        # Case 3: Fraud — Phishing Attempt (Cited evidence)
        {
            "_id": "demo_case_fraud_phishing",
            "user_id": user_id,
            "department": "fraud",
            "status": "completed",
            "evidence": [
                {
                    "file_id": "file_demo_phish_screenshot",
                    "file_type": "image/png",
                    "original_name": "urgent_bank_sms.png",
                    "extracted_text": "ALERT: Your National Trust Account #8841 is LOCKED due to suspicious activity. Verify immediately at http://alert-secure-bank-login.net/verify or funds will be seized within 24 hours.",
                    "meta": {"source": "screenshot"},
                }
            ],
            "merged_facts": {
                "sender_identifier": "+1-800-FAKE-BANK / alert-secure-bank-login.net",
                "claimed_authority": "National Trust Bank Security",
                "urgency_language": "LOCKED due to suspicious activity / seized within 24 hours",
                "requested_action": "Click unencrypted link and enter login credentials",
                "suspicious_links": ["http://alert-secure-bank-login.net/verify"],
                "amount_mentioned": "entire account balance",
            },
            "clarifying_qa": [],
            "findings": {
                "pattern_classification": "Phishing / Account Takeover Attempt",
                "risk_score": 95,
                "severity": "high",
                "evidence_citations": [
                    "Sender domain 'alert-secure-bank-login.net' is an unofficial domain not belonging to National Trust Bank.",
                    "High-urgency coercive phrasing ('seized within 24 hours') designed to bypass critical thinking.",
                    "Link uses unencrypted HTTP protocol ('http://') rather than official secure HTTPS portal.",
                ],
                "remediation_checklist": [
                    "1. DO NOT click the link or enter any account credentials.",
                    "2. Log into your banking account ONLY through the official mobile app or bookmarked website URL.",
                    "3. Contact National Trust Bank fraud division via the official phone number printed on your physical card.",
                    "4. Report SMS to your mobile provider spam number (7726).",
                ],
                "suggest_nearby_help": True,
            },
            "reminder": None,
            "created_at": now - timedelta(hours=2),
            "updated_at": now - timedelta(hours=2),
        },
        # Case 4: Fraud — Ambiguous / Legitimate Delivery SMS
        {
            "_id": "demo_case_fraud_legitimate",
            "user_id": user_id,
            "department": "fraud",
            "status": "completed",
            "evidence": [
                {
                    "file_id": None,
                    "file_type": "text/plain",
                    "original_name": "delivery_sms.txt",
                    "extracted_text": "CourierExpress: Your package #CX-99201 is out for delivery today. Track live at https://courierexpress.com/track/CX-99201. Reply STOP to opt out.",
                    "meta": {"source": "pasted_text"},
                }
            ],
            "merged_facts": {
                "sender_identifier": "CourierExpress Shortcode",
                "claimed_authority": "CourierExpress Logistics",
                "urgency_language": "none",
                "requested_action": "Optional live tracking link check",
                "suspicious_links": [],
                "amount_mentioned": "none",
            },
            "findings": {
                "pattern_classification": "Legitimate Package Notification",
                "risk_score": 10,
                "severity": "low",
                "evidence_citations": [
                    "Domain 'courierexpress.com' matches official registered logistics domain.",
                    "No urgent threats, fee requests, OTP requests, or personal identity demands.",
                    "Standard opt-out option (STOP) present.",
                ],
                "remediation_checklist": [
                    "1. If expecting a delivery, track status directly on the official app or website.",
                    "2. No immediate security action required.",
                ],
                "suggest_nearby_help": False,
            },
            "reminder": None,
            "created_at": now - timedelta(hours=1),
            "updated_at": now - timedelta(hours=1),
        },
    ]

    for case_data in cases:
        await db.cases.update_one(
            {"_id": case_data["_id"]},
            {"$set": case_data},
            upsert=True,
        )
        print(f"Seeded case '{case_data['_id']}' ({case_data['department']} - {case_data['findings'].get('escalation_flag') or case_data['findings'].get('severity')})")

    if client:
        client.close()

    print("\n--- Seed complete! Demo credentials ---")
    print(f"   Email:    {DEMO_USER_EMAIL}")
    print(f"   Password: {DEMO_USER_PASSWORD}")
    return True


if __name__ == "__main__":
    asyncio.run(seed_data())
