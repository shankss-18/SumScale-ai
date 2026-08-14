"""
SumScale — Unit Tests for My Life, Trust Circle, Reminders, Safety Alerts & Push
=================================================================================
Validates authentication, authorization scoping, permission enforcement,
and reminder/safety workflows.
"""

import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer demo_token_123"}


@pytest.mark.asyncio
async def test_trust_circle_crud_and_permissions(auth_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Create a Trust Circle contact with default permissions (all False)
        payload = {
            "name": "Jane Doe",
            "relationship": "Spouse",
            "email": "jane@example.com",
            "phone": "+1234567890",
        }
        res = await client.post("/trust-circle", json=payload, headers=auth_headers)
        assert res.status_code == 201
        data = res.json()
        member_id = data["id"]
        assert data["name"] == "Jane Doe"
        assert data["permissions"]["safety_alerts"] is False
        assert data["permissions"]["shared_reminders"] is False

        # 2. List contacts
        list_res = await client.get("/trust-circle", headers=auth_headers)
        assert list_res.status_code == 200
        assert len(list_res.json()) >= 1

        # 3. Update permissions to enable safety alerts
        update_payload = {
            "permissions": {
                "safety_alerts": True,
                "shared_reminders": True,
                "shared_documents": False,
            }
        }
        up_res = await client.put(f"/trust-circle/{member_id}", json=update_payload, headers=auth_headers)
        assert up_res.status_code == 200
        assert up_res.json()["permissions"]["safety_alerts"] is True

        # 4. Remove contact
        del_res = await client.delete(f"/trust-circle/{member_id}", headers=auth_headers)
        assert del_res.status_code == 200


@pytest.mark.asyncio
async def test_safety_alert_workflow(auth_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Add a member with safety permission enabled
        tc_res = await client.post(
            "/trust-circle",
            json={
                "name": "Emergency Contact",
                "relationship": "Parent",
                "email": "parent@example.com",
                "permissions": {"safety_alerts": True, "shared_reminders": False, "shared_documents": False},
            },
            headers=auth_headers,
        )
        member_id = tc_res.json()["id"]

        # Trigger safety alert
        safety_res = await client.post(
            "/safety/trigger-alert",
            json={"user_confirmation": True, "note": "Testing safety alert"},
            headers=auth_headers,
        )
        assert safety_res.status_code == 201
        assert safety_res.json()["status"] == "success"
        assert safety_res.json()["notified_count"] >= 1

        # Cleanup
        await client.delete(f"/trust-circle/{member_id}", headers=auth_headers)


@pytest.mark.asyncio
async def test_reminder_crud_snooze_repeat(auth_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        due = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        # Create reminder
        create_res = await client.post(
            "/reminders",
            json={
                "title": "Pay Electricity Bill",
                "due_date": due,
                "category": "Finance",
                "priority": "high",
                "repeat": "monthly",
            },
            headers=auth_headers,
        )
        assert create_res.status_code == 201
        rem_data = create_res.json()
        rem_id = rem_data["id"]
        assert rem_data["title"] == "Pay Electricity Bill"

        # Snooze reminder
        snooze_res = await client.put(f"/reminders/{rem_id}/snooze", json={"minutes": 30}, headers=auth_headers)
        assert snooze_res.status_code == 200
        assert snooze_res.json()["status"] == "snoozed"

        # Complete reminder
        comp_res = await client.put(f"/reminders/{rem_id}/complete", headers=auth_headers)
        assert comp_res.status_code == 200
        assert comp_res.json()["is_completed"] is True

        # Delete reminder
        del_res = await client.delete(f"/reminders/{rem_id}", headers=auth_headers)
        assert del_res.status_code == 200


@pytest.mark.asyncio
async def test_push_vapid_key(auth_headers):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.get("/push/vapid-public-key")
        assert res.status_code == 200
        assert "public_key" in res.json()
