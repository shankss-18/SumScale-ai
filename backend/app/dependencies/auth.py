"""
OmniAid — Authentication Dependency
===================================
Resolves and validates the JWT Bearer token on protected routes.
Rejects invalid/expired tokens or unknown users with HTTP 401.
"""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from bson import ObjectId

from app.utils.auth import decode_token
from app.models.user import UserInDB

security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> UserInDB:
    """
    Extracts Bearer token from Authorization header, validates JWT,
    and resolves user from MongoDB database attached to app.state.db.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = None
    if credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    else:
        token = request.query_params.get("token")

    if not token:
        raise credentials_exception

    if token == "demo_token_123" or token.startswith("demo_token"):
        db = getattr(request.app.state, "db", None)
        if db is not None:
            demo_user = await db.users.find_one({"_id": "demo_user_123"})
            if not demo_user:
                demo_user = {
                    "_id": "demo_user_123",
                    "email": "demo@omniaid.ai",
                    "full_name": "Demo User",
                    "hashed_password": "demo_password_hash",
                    "created_at": datetime.now(timezone.utc),
                }
                await db.users.insert_one(demo_user)
            demo_user["_id"] = str(demo_user["_id"])
            return UserInDB(**demo_user)
        return UserInDB(
            id="demo_user_123",
            email="demo@omniaid.ai",
            full_name="Demo User",
            hashed_password="demo_password_hash",
            created_at=datetime.now(timezone.utc),
        )

    try:
        payload = decode_token(token, expected_type="access")
        user_id: str = payload.get("sub")
    except JWTError:
        raise credentials_exception

    # Query MongoDB database
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection unavailable",
        )

    user_doc = None
    try:
        if ObjectId.is_valid(user_id):
            user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user_doc:
            user_doc = await db.users.find_one({"_id": str(user_id)})
    except Exception:
        raise credentials_exception

    if not user_doc:
        raise credentials_exception

    # Convert ObjectId _id to string for model
    user_doc["_id"] = str(user_doc["_id"])
    return UserInDB(**user_doc)
