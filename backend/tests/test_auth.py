"""
Tests — Authentication & JWT validation
=======================================
Verifies user registration, password length constraints, duplicate email protection,
login authentication, and token verification / rejection.
"""

from datetime import timedelta
import pytest
from app.utils.auth import create_access_token


@pytest.mark.asyncio
async def test_register_user_success(client):
    """Successful user registration returns 201 and user profile."""
    res = await client.post(
        "/auth/register",
        json={"email": "user@example.com", "password": "password123"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["email"] == "user@example.com"
    assert "id" in body
    assert "password" not in body
    assert "hashed_password" not in body


@pytest.mark.asyncio
async def test_register_weak_password_rejected(client):
    """Registration with a password shorter than 8 characters returns 422."""
    res = await client.post(
        "/auth/register",
        json={"email": "user2@example.com", "password": "short"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_duplicate_email_rejected_generic_message(client):
    """Registering an existing email returns 400 with generic error message."""
    # First registration
    await client.post(
        "/auth/register",
        json={"email": "duplicate@example.com", "password": "password123"},
    )

    # Second registration with same email
    res = await client.post(
        "/auth/register",
        json={"email": "duplicate@example.com", "password": "anotherpassword123"},
    )
    assert res.status_code == 400
    body = res.json()
    assert body["detail"] == "Unable to register with these details"


@pytest.mark.asyncio
async def test_login_success(client):
    """Valid credentials return access and refresh tokens."""
    await client.post(
        "/auth/register",
        json={"email": "login@example.com", "password": "password123"},
    )

    res = await client.post(
        "/auth/login",
        json={"email": "login@example.com", "password": "password123"},
    )
    assert res.status_code == 200
    body = res.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password_rejected(client):
    """Wrong password returns 401 with generic invalid credentials message."""
    await client.post(
        "/auth/register",
        json={"email": "wrongpwd@example.com", "password": "correctpassword"},
    )

    res = await client.post(
        "/auth/login",
        json={"email": "wrongpwd@example.com", "password": "wrongpassword"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid email or password"


@pytest.mark.asyncio
async def test_login_nonexistent_email_rejected(client):
    """Non-existent email returns 401 with generic invalid credentials message."""
    res = await client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "password123"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid email or password"


@pytest.mark.asyncio
async def test_get_me_valid_token(client):
    """Protected route /auth/me returns profile with valid Bearer token."""
    reg_res = await client.post(
        "/auth/register",
        json={"email": "me@example.com", "password": "password123"},
    )
    user_id = reg_res.json()["id"]

    login_res = await client.post(
        "/auth/login",
        json={"email": "me@example.com", "password": "password123"},
    )
    token = login_res.json()["access_token"]

    me_res = await client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "me@example.com"
    assert me_res.json()["id"] == user_id


@pytest.mark.asyncio
async def test_get_me_missing_token(client):
    """Protected route without Authorization header returns 401."""
    res = await client.get("/auth/me")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_get_me_invalid_token(client):
    """Protected route with malformed Bearer token returns 401."""
    res = await client.get(
        "/auth/me",
        headers={"Authorization": "Bearer invalid_token_string"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_get_me_expired_token(client):
    """Protected route with expired Bearer token returns 401."""
    reg_res = await client.post(
        "/auth/register",
        json={"email": "expired@example.com", "password": "password123"},
    )
    user_id = reg_res.json()["id"]

    # Generate token expired 10 minutes ago
    expired_token = create_access_token(
        user_id=user_id,
        expires_delta=timedelta(minutes=-10),
    )

    res = await client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_login_rate_limiting(client):
    """Verify login endpoint returns 429 after exceeding rate limit."""
    from main import app
    if hasattr(app.state, "limiter"):
        app.state.limiter.enabled = True

    await client.post(
        "/auth/register",
        json={"email": "ratelimit@example.com", "password": "password123"},
    )

    # First 5 login attempts should process normally (200 or 401)
    for _ in range(5):
        await client.post(
            "/auth/login",
            json={"email": "ratelimit@example.com", "password": "wrongpassword"},
        )

    # 6th attempt must trigger 429 Too Many Requests
    res = await client.post(
        "/auth/login",
        json={"email": "ratelimit@example.com", "password": "wrongpassword"},
    )
    assert res.status_code == 429

    if hasattr(app.state, "limiter"):
        app.state.limiter.enabled = False


@pytest.mark.asyncio
async def test_send_and_verify_email_otp_signup_success(client):
    """Test sending 6-digit email OTP for signup with full_name and verifying it."""
    send_res = await client.post(
        "/auth/send-otp",
        json={"email": "otpuser@example.com", "purpose": "signup"},
    )
    assert send_res.status_code == 200
    body = send_res.json()
    assert body["status"] == "success"
    assert body["email"] == "otpuser@example.com"
    assert "dev_otp" in body

    dev_otp = body["dev_otp"]

    verify_res = await client.post(
        "/auth/verify-otp",
        json={"email": "otpuser@example.com", "otp_code": dev_otp, "full_name": "Alex Morgan"},
    )
    assert verify_res.status_code == 200
    v_body = verify_res.json()
    assert "access_token" in v_body
    assert "refresh_token" in v_body

    me_res = await client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {v_body['access_token']}"},
    )
    assert me_res.status_code == 200
    assert me_res.json()["full_name"] == "Alex Morgan"


@pytest.mark.asyncio
async def test_send_otp_login_nonexistent_email_returns_404(client):
    """Sending OTP for login with non-existent email returns 404 and notification message."""
    send_res = await client.post(
        "/auth/send-otp",
        json={"email": "unregistered@example.com", "purpose": "login"},
    )
    assert send_res.status_code == 404
    assert "Please register first" in send_res.json()["detail"]


@pytest.mark.asyncio
async def test_send_otp_signup_existing_email_returns_400(client):
    """Sending OTP for signup with an existing email returns 400."""
    await client.post(
        "/auth/register",
        json={"email": "alreadyhere@example.com", "password": "password123"},
    )

    send_res = await client.post(
        "/auth/send-otp",
        json={"email": "alreadyhere@example.com", "purpose": "signup"},
    )
    assert send_res.status_code == 400
    assert "already exists" in send_res.json()["detail"]



