"""
OmniAid — Authentication Schemas
================================
Input validation schemas for auth endpoints with strict field length constraints.
"""

from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


class SendOTPRequest(BaseModel):
    email: Optional[EmailStr] = Field(
        default=None,
        description="User email address for OTP verification",
    )
    identifier: Optional[str] = Field(
        default=None,
        description="Alias for email address for backward compatibility",
    )
    purpose: Optional[str] = Field(default="login", description="login | signup")

    def get_email(self) -> str:
        target = self.email or self.identifier
        if not target:
            raise ValueError("Email address is required")
        return str(target).strip().lower()


class VerifyOTPRequest(BaseModel):
    email: Optional[EmailStr] = Field(default=None)
    identifier: Optional[str] = Field(default=None)
    otp_code: str = Field(min_length=4, max_length=10, description="6-digit OTP code")
    full_name: Optional[str] = Field(default=None, max_length=100)

    def get_email(self) -> str:
        target = self.email or self.identifier
        if not target:
            raise ValueError("Email address is required")
        return str(target).strip().lower()


class OTPResponse(BaseModel):
    status: str
    email: str
    expires_in_seconds: int
    real_sent: bool = True
    dev_otp: Optional[str] = None


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: Optional[str] = Field(default=None, max_length=100)
    password: str = Field(
        min_length=8,
        max_length=128,
        description="Password must be between 8 and 128 characters long",
    )


class LoginRequest(BaseModel):
    email: EmailStr = Field(
        description="Email address for login",
    )
    password: str = Field(
        min_length=1,
        max_length=128,
        description="Password input field",
    )



class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str
