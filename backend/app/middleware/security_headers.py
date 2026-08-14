"""
OmniAid — Security Headers Middleware
=======================================
Adds hardened HTTP security headers to every response.

Headers applied:
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - Referrer-Policy: strict-origin-when-cross-origin
  - X-XSS-Protection: 0  (modern browsers, CSP is authoritative)
  - Content-Security-Policy: restrictive baseline
  - Strict-Transport-Security: only when ENVIRONMENT != development
  - Permissions-Policy: deny camera/mic/geolocation by default
"""

import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Injects security headers on every outgoing response.
    HSTS is skipped in development to avoid breaking plain-HTTP local dev.
    """

    def __init__(self, app, environment: str = "development") -> None:
        super().__init__(app)
        self._is_production = environment == "production"

    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)

        # Prevent MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Control referrer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Disable legacy XSS filter (rely on CSP instead)
        response.headers["X-XSS-Protection"] = "0"

        # Restrictive Content Security Policy baseline
        # Feature code should tighten this further per-endpoint if needed
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "connect-src 'self'; "
            "font-src 'self'; "
            "frame-ancestors 'none';"
        )

        # Deny access to sensitive browser APIs by default
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )

        # HSTS — only on production (would break local plain-HTTP dev)
        if self._is_production:
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )

        return response
