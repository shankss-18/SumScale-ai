"""
OmniAid — Authentication Router
================================
Handles user registration, authentication, token issuance, and token refresh.

Security Rules:
- Password minimum length enforced by Pydantic schema (8 chars).
- Generic error message on duplicate email registration to prevent enumeration.
- Rate limited login endpoint to protect against brute force / credential stuffing.
- Short-lived access tokens + refresh token pattern.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from bson import ObjectId

from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    RefreshTokenRequest,
    SendOTPRequest,
    VerifyOTPRequest,
    OTPResponse,
)
from app.models.user import UserResponse
from app.utils.auth import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.services.otp_service import send_otp_identifier, verify_otp_identifier, normalize_email
from app.utils.limiter import limiter
from app.dependencies.auth import get_current_user
from app.models.user import UserInDB

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=UserResponse,
    summary="Register a new user",
    description="Registers a new user account with hashed password.",
)
async def register(request: Request, body: RegisterRequest):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection unavailable",
        )

    email_clean = body.email.lower().strip()

    existing_user = await db.users.find_one({"email": email_clean})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to register with these details",
        )

    hashed_pwd = hash_password(body.password)
    full_name_clean = body.full_name.strip() if body.full_name and body.full_name.strip() else None

    new_user_doc = {
        "email": email_clean,
        "full_name": full_name_clean,
        "phone_number": None,
        "hashed_password": hashed_pwd,
        "created_at": datetime.now(timezone.utc),
    }

    result = await db.users.insert_one(new_user_doc)
    user_id = str(result.inserted_id)

    return UserResponse(
        id=user_id,
        email=email_clean,
        full_name=full_name_clean,
        created_at=new_user_doc["created_at"],
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user and issue JWT tokens",
    description="Validates credentials via email address. Rate limited to 5 attempts per minute.",
)
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection unavailable",
        )

    email_clean = body.email.lower().strip()

    user_doc = await db.users.find_one({"email": email_clean})

    invalid_cred_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not user_doc:
        raise invalid_cred_exception

    if not verify_password(body.password, user_doc["hashed_password"]):
        raise invalid_cred_exception

    user_id = str(user_doc["_id"])
    access_token = create_access_token(user_id=user_id)
    refresh_token = create_refresh_token(user_id=user_id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
    description="Exchanges a valid refresh token for a new access token and refresh token.",
)
async def refresh_tokens(body: RefreshTokenRequest):
    try:
        payload = decode_token(body.refresh_token, expected_type="refresh")
        user_id = payload.get("sub")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    new_access = create_access_token(user_id=user_id)
    new_refresh = create_refresh_token(user_id=user_id)

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        token_type="bearer",
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user profile",
)
async def get_me(current_user: UserInDB = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        created_at=current_user.created_at,
        emergency_contact_phone=current_user.emergency_contact_phone,
        alert_consent=current_user.alert_consent,
    )


@router.post(
    "/send-otp",
    response_model=OTPResponse,
    summary="Send 6-digit OTP to Email",
)
async def send_otp_endpoint(request: Request, body: SendOTPRequest):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    try:
        clean_email = body.get_email()
    except Exception:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    purpose = (body.purpose or "login").lower().strip()

    # Check user existence in DB for login / signup rules
    user_doc = await db.users.find_one({"email": clean_email})

    if purpose == "login":
        if not user_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account found with this email address. Please register first.",
            )
    elif purpose == "signup":
        if user_doc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email address already exists. Please sign in instead.",
            )

    result = await send_otp_identifier(db=db, email=clean_email, purpose=purpose)
    result["real_sent"] = True
    return OTPResponse(**result)


@router.post(
    "/verify-otp",
    response_model=TokenResponse,
    summary="Verify OTP and issue JWT Access Token",
)
async def verify_otp_endpoint(request: Request, body: VerifyOTPRequest):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    try:
        clean_email = body.get_email()
    except Exception:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    is_valid, msg_or_email = await verify_otp_identifier(db=db, email=clean_email, otp_code=body.otp_code)
    if not is_valid:
        raise HTTPException(status_code=400, detail=msg_or_email)

    verified_email = msg_or_email
    full_name_clean = body.full_name.strip() if body.full_name and body.full_name.strip() else None

    # Check if user exists by email
    user_doc = await db.users.find_one({"email": verified_email})

    if not user_doc:
        new_user = {
            "email": verified_email,
            "full_name": full_name_clean,
            "phone_number": None,
            "hashed_password": hash_password(f"OTP_AUTH_{verified_email}"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "email_verified": True,
        }
        res = await db.users.insert_one(new_user)
        user_id = str(res.inserted_id)
    else:
        user_id = str(user_doc["_id"])
        if full_name_clean:
            await db.users.update_one(
                {"_id": user_doc["_id"]},
                {"$set": {"full_name": full_name_clean}}
            )

    access_token = create_access_token(user_id=user_id)
    refresh_token = create_refresh_token(user_id=user_id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )

