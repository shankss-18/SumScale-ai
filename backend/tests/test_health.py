"""
Tests — Health endpoint
========================
Verifies the /health endpoint returns 200 with the expected JSON shape,
and that no sensitive information leaks through the response.
"""

import pytest


@pytest.mark.asyncio
async def test_health_returns_200(client):
    """GET /health must return HTTP 200."""
    response = await client.get("/health")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_health_response_structure(client):
    """Response must contain status, service, version, and timestamp."""
    response = await client.get("/health")
    body = response.json()

    assert body["status"] == "ok"
    assert body["service"] == "OmniAid API"
    assert "version" in body
    assert "timestamp" in body


@pytest.mark.asyncio
async def test_health_exposes_no_secrets(client):
    """Response must NOT expose any API keys, DB URLs, or secrets."""
    response = await client.get("/health")
    body_text = response.text.lower()

    forbidden_patterns = [
        "api_key",
        "secret",
        "password",
        "mongodb",
        "jwt",
        "gemini",
    ]
    for pattern in forbidden_patterns:
        assert pattern not in body_text, (
            f"Health endpoint leaks sensitive term: '{pattern}'"
        )


@pytest.mark.asyncio
async def test_security_headers_present(client):
    """Every response must carry the required security headers."""
    response = await client.get("/health")

    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert "content-security-policy" in response.headers


@pytest.mark.asyncio
async def test_request_id_in_response(client):
    """Every response must carry an X-Request-ID header for correlation."""
    response = await client.get("/health")
    assert "x-request-id" in response.headers
    # Must be a non-empty string (UUID format)
    assert len(response.headers["x-request-id"]) > 0
