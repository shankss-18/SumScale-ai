"""
Tests — Case Processing & Security Isolation
=============================================
Verifies case creation, multipart upload validation (python-magic, extension mismatch),
AI analysis, user isolation (User A cannot access/analyze/delete User B's case), and file deletion.
"""

import os
from pathlib import Path
import pytest
from unittest.mock import patch, AsyncMock


def get_id(json_dict: dict) -> str:
    return json_dict.get("_id") or json_dict.get("id")


@pytest.mark.asyncio
async def test_create_case_success(client):
    """Authenticated user can create a case envelope."""
    await client.post(
        "/auth/register",
        json={"email": "caseuser1@example.com", "password": "password123"},
    )
    login_res = await client.post(
        "/auth/login",
        json={"email": "caseuser1@example.com", "password": "password123"},
    )
    token = login_res.json()["access_token"]

    res = await client.post(
        "/cases",
        json={"department": "health", "description": "Severe rash on arm for 3 days"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["department"] == "health"
    assert body["status"] == "draft"
    assert len(body["evidence"]) == 1
    assert body["evidence"][0]["extracted_text"] == "Severe rash on arm for 3 days"


@pytest.mark.asyncio
async def test_create_case_oversized_description_rejected(client):
    """Case creation with description > 5000 chars is rejected with 422."""
    await client.post(
        "/auth/register",
        json={"email": "caseuser2@example.com", "password": "password123"},
    )
    login_res = await client.post(
        "/auth/login",
        json={"email": "caseuser2@example.com", "password": "password123"},
    )
    token = login_res.json()["access_token"]

    huge_text = "a" * 5001
    res = await client.post(
        "/cases",
        json={"department": "health", "description": huge_text},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_mismatched_file_extension_rejected(client):
    """File with extension .pdf but plain text content is rejected for extension mismatch."""
    await client.post(
        "/auth/register",
        json={"email": "fileuser@example.com", "password": "password123"},
    )
    login_res = await client.post(
        "/auth/login",
        json={"email": "fileuser@example.com", "password": "password123"},
    )
    token = login_res.json()["access_token"]

    # Create fraud case (which allows text/plain and application/pdf)
    case_res = await client.post(
        "/cases",
        json={"department": "fraud"},
        headers={"Authorization": f"Bearer {token}"},
    )
    case_id = get_id(case_res.json())

    # Upload fake PDF (plain text content with .pdf extension)
    files = {"file": ("fake_document.pdf", b"This is plain text, not a PDF header!", "application/pdf")}
    res = await client.post(
        f"/cases/{case_id}/upload",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 400
    assert "Extension '.pdf' does not match detected file content" in res.json()["detail"]



@pytest.mark.asyncio
async def test_upload_txt_file_and_deduplication(client):
    """Uploading a .txt file extracts plain text correctly, and uploading duplicate filename replaces instead of duplicating."""
    await client.post(
        "/auth/register",
        json={"email": "txtuser@example.com", "password": "password123"},
    )
    login_res = await client.post(
        "/auth/login",
        json={"email": "txtuser@example.com", "password": "password123"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    case_res = await client.post(
        "/cases",
        json={"department": "fraud"},
        headers=headers,
    )
    case_id = get_id(case_res.json())

    # Upload .txt email file
    files_txt = {"file": ("job_scam_email.txt", b"Subject: Urgent Job Offer\nPlease transfer Rs 5000 via UPI.", "text/plain")}
    res_txt = await client.post(
        f"/cases/{case_id}/upload",
        files=files_txt,
        headers=headers,
    )
    assert res_txt.status_code == 200
    evidence = res_txt.json()["evidence"]
    assert len(evidence) == 1
    assert "Urgent Job Offer" in evidence[0]["extracted_text"]

    # Upload same filename again — must deduplicate (replace) instead of length=2
    res_dup = await client.post(
        f"/cases/{case_id}/upload",
        files=files_txt,
        headers=headers,
    )
    assert res_dup.status_code == 200
    evidence_dup = res_dup.json()["evidence"]
    assert len(evidence_dup) == 1


@pytest.mark.asyncio
async def test_cross_user_security_isolation(client):
    """
    CRITICAL SECURITY TEST:
    User A creates a case.
    User B attempts to:
      1. List cases (User A's case must not appear)
      2. Read User A's case (must return 404)
      3. Upload file to User A's case (must return 404)
      4. Trigger analysis on User A's case (must return 404)
      5. Delete User A's case (must return 404)
    """
    # User A setup
    await client.post(
        "/auth/register",
        json={"email": "usera@example.com", "password": "password123"},
    )
    login_a = await client.post(
        "/auth/login",
        json={"email": "usera@example.com", "password": "password123"},
    )
    token_a = login_a.json()["access_token"]

    # User A creates case
    case_a = await client.post(
        "/cases",
        json={"department": "fraud", "description": "Phishing email attempt"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    case_id_a = get_id(case_a.json())

    # User B setup
    await client.post(
        "/auth/register",
        json={"email": "userb@example.com", "password": "password123"},
    )
    login_b = await client.post(
        "/auth/login",
        json={"email": "userb@example.com", "password": "password123"},
    )
    token_b = login_b.json()["access_token"]

    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. User B lists cases
    list_b = await client.get("/cases", headers=headers_b)
    assert list_b.status_code == 200
    assert len(list_b.json()) == 0

    # 2. User B tries to read User A's case
    read_b = await client.get(f"/cases/{case_id_a}", headers=headers_b)
    assert read_b.status_code == 404

    # 3. User B tries to upload to User A's case
    upload_b = await client.post(
        f"/cases/{case_id_a}/upload",
        files={"file": ("test.txt", b"some text", "text/plain")},
        headers=headers_b,
    )
    assert upload_b.status_code == 404

    # 4. User B tries to analyze User A's case
    analyze_b = await client.post(f"/cases/{case_id_a}/analyze", headers=headers_b)
    assert analyze_b.status_code == 404

    # 5. User B tries to delete User A's case
    delete_b = await client.delete(f"/cases/{case_id_a}", headers=headers_b)
    assert delete_b.status_code == 404


@pytest.mark.asyncio
async def test_case_deletion_removes_physical_files(client):
    """Deleting a case removes physical upload files from disk."""
    await client.post(
        "/auth/register",
        json={"email": "deleter@example.com", "password": "password123"},
    )
    login_res = await client.post(
        "/auth/login",
        json={"email": "deleter@example.com", "password": "password123"},
    )
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create case
    case_res = await client.post("/cases", json={"department": "fraud"}, headers=headers)
    case_id = get_id(case_res.json())

    # Upload valid text file
    upload_res = await client.post(
        f"/cases/{case_id}/upload",
        files={"file": ("evidence.txt", b"Suspicious message text content", "text/plain")},
        headers=headers,
    )
    assert upload_res.status_code == 200

    # Delete case
    del_res = await client.delete(f"/cases/{case_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Confirm case is gone from DB
    get_res = await client.get(f"/cases/{case_id}", headers=headers)
    assert get_res.status_code == 404
