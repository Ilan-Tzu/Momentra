from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from . import models, database, routes
from .logging_config import setup_logging
from .rate_limit import limiter, rate_limit_exceeded_handler, get_cache_stats
from .config import settings
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
import logging

# Initialize structured logging
setup_logging()
logger = logging.getLogger(__name__)

# Initialize database - Commented out to use Alembic migrations
# database.init_db()

app = FastAPI(title="AI Calendar Backend")

# Add rate limiter to app state
app.state.limiter = limiter

# Register rate limit exception handler
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
    )

app.add_middleware(
    TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS
)

if settings.ENFORCE_HTTPS:
    app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router, prefix="/api/v1")

@app.get("/")
def read_root():
    logger.info("Health check endpoint called")
    return {"message": "Welcome to Momentra AI Calendar API"}

@app.get("/api/v1/cache-stats")
def cache_stats():
    """Return cache statistics for monitoring."""
    return get_cache_stats()

