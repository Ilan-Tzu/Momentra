from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from . import models, database, routes
from .logging_config import setup_logging
from .rate_limit import limiter, rate_limit_exceeded_handler, get_cache_stats
from .config import settings
from slowapi.errors import RateLimitExceeded
import logging

# Initialize structured logging
setup_logging()
logger = logging.getLogger(__name__)

# Initialize database
database.init_db()

app = FastAPI(title="AI Calendar Backend")

# Add middlewares
if settings.ENFORCE_HTTPS:
    app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(
    TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS
)

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

# Add rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
    )

app.include_router(routes.router, prefix="/api/v1")

# ==================== Admin Dashboard ====================
from .admin import setup_admin
setup_admin(app)

@app.get("/")
def read_root():
    logger.info("Health check endpoint called")
    return {"message": "Welcome to Momentra AI Calendar API"}

@app.get("/api/v1/cache-stats")
def cache_stats():
    """Return cache statistics for monitoring."""
    return get_cache_stats()
