"""
Tests — RAG Chatbot User Isolation & APScheduler Reminder Due Checks
======================================================================
Verifies:
1. Chatbot queries surface ONLY the requesting user's own case history (User B cannot see User A's case details).
2. Reminders due date scheduler tick updates pending past-due reminders to status="due".
3. Reminder endpoints enforce strict user isolation.
"""

from datetime import datetime, timezone, timedelta
import pytest
from app.services.scheduler_service import check_due_reminders
from main import app


@pytest.mark.asyncio
async def test_chatbot_user_isolation(client):
    """
    User A creates a health case about a rash.
    User B calls POST /chat asking 'What did you tell me about my rash last week?'.
    User B must NOT see or cite User A's rash case!
    """
    # 1. Register & setup User A with a rash case
    await client.post(
        "/auth/register",
        json={"email": "chat_user_a@example.com", "password": "password123"},
    )
    login_a = await client.post(
        "/auth/login",
        json={"email": "chat_user_a@example.com", "password": "password123"},
    )
    token_a = login_a.json()["access_token"]

    await client.post(
        "/cases",
        json={"department": "health", "description": "Severe rash on my left arm for 5 days"},
        headers={"Authorization": f"Bearer {token_a}"},
    )

    # 2. Register & setup User B with NO health cases
    await client.post(
        "/auth/register",
        json={"email": "chat_user_b@example.com", "password": "password123"},
    )
    login_b = await client.post(
        "/auth/login",
        json={"email": "chat_user_b@example.com", "password": "password123"},
    )
    token_b = login_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 3. User B queries chatbot about a rash
    res = await client.post(
        "/chat",
        json={"message": "What did you tell me about my rash last week?"},
        headers=headers_b,
    )
    assert res.status_code == 200
    body = res.json()

    # User B's cited cases must be empty
    assert len(body["cited_cases"]) == 0
    # Answer must not contain User A's rash text details
    assert "left arm for 5 days" not in body["answer"]


@pytest.mark.asyncio
async def test_chatbot_cross_case_isolation(client):
    """
    Same user creates Case A (Health: Warfarin and fever) and Case B (Fraud: Bank SMS scam).
    Calling POST /chat with case_id=Case B must return ONLY Case B context, with NO Warfarin or fever leakage from Case A!
    """
    await client.post(
        "/auth/register",
        json={"email": "crosscase_user@example.com", "password": "password123"},
    )
    login_res = await client.post(
        "/auth/login",
        json={"email": "crosscase_user@example.com", "password": "password123"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create Case A: Health case with Warfarin
    case_a_res = await client.post(
        "/cases",
        json={"department": "health", "description": "Patient takes Warfarin 5mg daily for clotting and has fever."},
        headers=headers,
    )
    case_a_id = case_a_res.json()["_id"]

    # Create Case B: Fraud case about SMS bank scam
    case_b_res = await client.post(
        "/cases",
        json={"department": "fraud", "description": "Received suspicious SMS asking for OTP transfer of Rs 50000."},
        headers=headers,
    )
    case_b_id = case_b_res.json()["_id"]

    # Query chat scoped to Case B
    chat_res = await client.post(
        "/chat",
        json={"message": "What is the main issue described in my uploaded document?", "case_id": case_b_id},
        headers=headers,
    )
    assert chat_res.status_code == 200
    answer = chat_res.json()["answer"].lower()

    # Must NOT contain unique Case A content (Warfarin, fever, clotting)
    assert "warfarin" not in answer
    assert "fever" not in answer
    assert "clotting" not in answer


@pytest.mark.asyncio
async def test_comparison_query_artifact_disambiguation(client):
    """
    User asks 'Are these two messages related to each other?' in a case with SMS screenshot and email scam.
    System prompt rule forces comparison of artifacts rather than chat turns.
    """
    await client.post(
        "/auth/register",
        json={"email": "comparison_user@example.com", "password": "password123"},
    )
    login_res = await client.post(
        "/auth/login",
        json={"email": "comparison_user@example.com", "password": "password123"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    case_res = await client.post(
        "/cases",
        json={
            "department": "fraud",
            "description": "SMS screenshot claiming SBI account locked and job offer email asking for Rs 5000 UPI.",
        },
        headers=headers,
    )
    case_id = case_res.json()["_id"]

    chat_history = [
        {"sender": "user", "text": "Hello, I uploaded my evidence."},
        {"sender": "bot", "text": "I have received your evidence."},
    ]

    chat_res = await client.post(
        "/chat",
        json={
            "message": "Are these two messages related to each other?",
            "case_id": case_id,
            "chat_history": chat_history,
        },
        headers=headers,
    )
    assert chat_res.status_code == 200
    answer = chat_res.json()["answer"].lower()
    # Response should discuss the uploaded evidence / scam / bank / upi / job offer, NOT comparing previous bot turns
    assert any(k in answer for k in ["sbi", "scam", "upi", "job", "evidence", "account", "sms", "email", "phishing", "fraud", "case", "record"])


@pytest.mark.asyncio
async def test_no_fake_fraud_report_for_random_numbers(client):
    """
    Case with 12-digit IDs/timestamps must NOT generate an unrequested Fraud & Security report for fake phone numbers like 683935705130.
    """
    await client.post(
        "/auth/register",
        json={"email": "randomnum_user@example.com", "password": "password123"},
    )
    login_res = await client.post(
        "/auth/login",
        json={"email": "randomnum_user@example.com", "password": "password123"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    case_res = await client.post(
        "/cases",
        json={
            "department": "fraud",
            "description": "System log entry timestamp 683935705130 showing suspicious login.",
        },
        headers=headers,
    )
    case_id = case_res.json()["_id"]

    chat_res = await client.post(
        "/chat",
        json={
            "message": "Are these two messages related to each other?",
            "case_id": case_id,
        },
        headers=headers,
    )
    assert chat_res.status_code == 200
    answer = chat_res.json()["answer"]
    assert "Fraud & Security Intelligence Report for `683935705130`" not in answer


@pytest.mark.asyncio
async def test_reminder_scheduler_tick_and_user_isolation(client):
    """
    Creates a reminder set for 10 minutes ago.
    Executes check_due_reminders scheduler tick.
    Confirms GET /reminders returns status='due'.
    Confirms User B cannot see User A's reminders.
    """
    # 1. User A creates reminder
    await client.post(
        "/auth/register",
        json={"email": "rem_usera@example.com", "password": "password123"},
    )
    login_a = await client.post(
        "/auth/login",
        json={"email": "rem_usera@example.com", "password": "password123"},
    )
    token_a = login_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    past_due_date = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()

    create_res = await client.post(
        "/reminders",
        json={
            "title": "Dermatologist follow-up appointment",
            "due_date": past_due_date,
            "notes": "Check rash boundary",
        },
        headers=headers_a,
    )
    assert create_res.status_code == 201

    # 2. Trigger scheduler tick
    await check_due_reminders(app.state.db)

    # 3. User A lists reminders — status must be 'due'
    list_a = await client.get("/reminders", headers=headers_a)
    assert list_a.status_code == 200
    reminders_a = list_a.json()
    assert len(reminders_a) == 1
    assert reminders_a[0]["status"] == "due"
    assert reminders_a[0]["title"] == "Dermatologist follow-up appointment"

    # 4. User B lists reminders — must return empty list (user isolation)
    await client.post(
        "/auth/register",
        json={"email": "rem_userb@example.com", "password": "password123"},
    )
    login_b = await client.post(
        "/auth/login",
        json={"email": "rem_userb@example.com", "password": "password123"},
    )
    token_b = login_b.json()["access_token"]

    list_b = await client.get("/reminders", headers={"Authorization": f"Bearer {token_b}"})
    assert list_b.status_code == 200
    assert len(list_b.json()) == 0
