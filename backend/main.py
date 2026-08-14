"""
OmniAid — FastAPI Application Entry Point
==========================================
Start with:  uvicorn main:app --reload  (from the /backend directory)

Startup sequence:
  1. app/config.py loads — fails fast if any required env var is missing
  2. Logging is configured (JSON structured, redacting formatter)
  3. Middleware stack is assembled (logging → security headers → CORS)
  4. Rate limiter state & exception handlers configured
  5. Routers are included
  6. Lifespan event verifies MongoDB connectivity & starts APScheduler
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# -- Config is imported first: any missing env var causes sys.exit(1) here --
from app.config import settings
from app.utils.logger import setup_logging, get_logger
from app.utils.limiter import limiter
from app.middleware.logging_middleware import RequestLoggingMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware

from app.routers.health import router as health_router
from app.routers.auth import router as auth_router
from app.routers.case import router as case_router
from app.routers.reminder import router as reminder_router
from app.routers.chat import router as chat_router
from app.routers.fraud import router as fraud_router
from app.routers.fraud_cases import router as fraud_cases_router
from app.routers.intel import router as intel_router
from app.routers.trust_circle import router as trust_circle_router
from app.routers.safety import router as safety_router
from app.routers.push import router as push_router
from app.routers.n8n import router as n8n_router
from app.routers.notifications import router as notification_router
from app.services.scheduler_service import start_scheduler, shutdown_scheduler

# ---------------------------------------------------------------------------
# Logging — must be configured before any other module logs anything
# ---------------------------------------------------------------------------
setup_logging(settings.LOG_LEVEL)
logger = get_logger("omniaid.main")


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown events
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once at startup to verify external dependencies are reachable and start scheduler.
    The app will NOT serve traffic if this block raises.
    """
    logger.info(
        "OmniAid starting up",
        extra={
            "environment": settings.ENVIRONMENT,
            "log_level": settings.LOG_LEVEL,
        },
    )

    # --- Verify MongoDB connectivity ---
    mongo_client: AsyncIOMotorClient | None = None
    try:
        mongo_kwargs = {
            "serverSelectionTimeoutMS": 10000,
            "connectTimeoutMS": 10000,
        }
        try:
            import certifi
            mongo_kwargs["tlsCAFile"] = certifi.where()
        except Exception:
            pass

        mongo_client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            **mongo_kwargs
        )
        await mongo_client.admin.command("ping")
        logger.info("MongoDB connection verified")
        app.state.mongo_client = mongo_client
        app.state.db = mongo_client[settings.MONGODB_DB_NAME]
    except Exception:
        logger.error(
            "MongoDB connection failed at startup — check MONGODB_URL in .env",
        )
        if mongo_client:
            mongo_client.close()
        raise

    # --- Start APScheduler ---
    if settings.ENVIRONMENT != "test":
        try:
            start_scheduler(app)
        except Exception as exc:
            logger.warning(f"Could not start background scheduler: {exc}")

    yield  # Application serves requests here

    # --- Graceful shutdown ---
    logger.info("OmniAid shutting down")
    shutdown_scheduler()

    if hasattr(app.state, "mongo_client") and app.state.mongo_client:
        app.state.mongo_client.close()
        logger.info("MongoDB connection closed")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="OmniAid API",
    description=(
        "Multimodal AI life-assistant — Health, Fraud & Hack Detection, "
        "and Data Insights."
    ),
    version="0.1.0",
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT == "development" else None,
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Rate Limiter & Global Exception Handlers
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception during request processing",
        extra={
            "path": request.url.path,
            "method": request.method,
            "error_type": type(exc).__name__,
        },
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


# ---------------------------------------------------------------------------
# Middleware stack
# Stack (outermost → innermost): Logging → SecurityHeaders → CORS → Routes
# ---------------------------------------------------------------------------

# 1. CORS — must declare the specific frontend origin, never "*"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "Accept"],
)

# 2. Security headers (X-Frame-Options, CSP, HSTS, etc.)
app.add_middleware(SecurityHeadersMiddleware, environment=settings.ENVIRONMENT)

# 3. Request/response logging (request_id, timing — never logs bodies)
app.add_middleware(RequestLoggingMiddleware)


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(case_router)
app.include_router(reminder_router)
app.include_router(chat_router)
app.include_router(fraud_router)
app.include_router(fraud_cases_router)
app.include_router(intel_router)
app.include_router(trust_circle_router)
app.include_router(safety_router)
app.include_router(push_router)
app.include_router(n8n_router)
app.include_router(notification_router)

