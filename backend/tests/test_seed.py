"""
Tests — Seed Demo Data Verification
====================================
Verifies that seed_demo_data.py inserts demo cases idempotently,
and that logging in as demo@omniaid.ai returns all seeded cases via GET /cases.
"""

import pytest
from main import app
from scripts.seed_demo_data import seed_data, DEMO_USER_EMAIL, DEMO_USER_PASSWORD


@pytest.mark.asyncio
async def test_seed_demo_data_and_verify_get_cases(client):
    """
    Run seed_data against mock DB, log in as demo user, and verify GET /cases returns all seeded cases.
    """
    # 1. Run seed script using in-memory app.state.db
    await seed_data(db=app.state.db)

    # 2. Log in as demo user
    login_res = await client.post(
        "/auth/login",
        json={"email": DEMO_USER_EMAIL, "password": DEMO_USER_PASSWORD},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. GET /cases
    cases_res = await client.get("/cases", headers=headers)
    assert cases_res.status_code == 200
    cases = cases_res.json()

    assert len(cases) == 4

    # Department indexing
    by_id = {c["_id"]: c for c in cases}

    # Verify Health Mild Case
    h_mild = by_id["demo_case_health_mild"]
    assert h_mild["department"] == "health"
    assert h_mild["status"] == "completed"
    assert h_mild["findings"]["escalation_flag"] == "low"
    assert h_mild["findings"]["suggest_nearby_doctor"] is False

    # Verify Health Escalated Case
    h_esc = by_id["demo_case_health_escalated"]
    assert h_esc["department"] == "health"
    assert h_esc["status"] == "completed"
    assert h_esc["findings"]["escalation_flag"] == "high"
    assert h_esc["findings"]["suggest_nearby_doctor"] is True
    assert h_esc["reminder"] is not None
    assert "Follow up with Primary Doctor" in h_esc["reminder"]["title"]

    # Verify Fraud Phishing Case
    f_phish = by_id["demo_case_fraud_phishing"]
    assert f_phish["department"] == "fraud"
    assert f_phish["status"] == "completed"
    assert f_phish["findings"]["pattern_classification"] == "Phishing / Account Takeover Attempt"
    assert f_phish["findings"]["severity"] == "high"
    assert len(f_phish["findings"]["evidence_citations"]) >= 3
    assert len(f_phish["findings"]["remediation_checklist"]) >= 3

    # Verify Fraud Legitimate Case
    f_legit = by_id["demo_case_fraud_legitimate"]
    assert f_legit["department"] == "fraud"
    assert f_legit["status"] == "completed"
    assert f_legit["findings"]["severity"] == "low"
    assert f_legit["findings"]["pattern_classification"] == "Legitimate Package Notification"

    # 4. Verify Idempotency (running seed again does not duplicate)
    await seed_data(db=app.state.db)

    re_cases_res = await client.get("/cases", headers=headers)
    assert re_cases_res.status_code == 200
    assert len(re_cases_res.json()) == 4
