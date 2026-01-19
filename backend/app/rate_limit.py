"""
Rate Limiting & Caching Module
==============================

Provides:
1. Rate limiting for API endpoints (slowapi)
2. LLM response caching for OpenAI cost optimization

Rate Limits:
- Auth endpoints: 10/minute per IP
- LLM endpoints (parse, transcribe): 20/minute per user
- General API: 100/minute per user
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi import Request
from fastapi.responses import JSONResponse
from cachetools import TTLCache
import hashlib
import json
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# =============================================================================
# Rate Limiter Configuration
# =============================================================================

def get_user_id(request: Request) -> str:
    """Extract user identifier for rate limiting."""
    # Try X-User-Id header first (authenticated requests)
    user_id = request.headers.get("x-user-id")
    if user_id:
        return f"user:{user_id}"
    # Fallback to IP address (unauthenticated)
    return f"ip:{get_remote_address(request)}"

limiter = Limiter(key_func=get_user_id)

# Rate limit exception handler
def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    logger.warning(f"Rate limit exceeded for {get_user_id(request)}: {exc.detail}")
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit exceeded. Please slow down.",
            "retry_after": str(exc.detail)
        }
    )

# =============================================================================
# LLM Response Cache
# =============================================================================

# Cache configuration
# - Max 1000 entries
# - TTL of 1 hour (3600 seconds)
# Similar inputs will return cached LLM responses
llm_cache = TTLCache(maxsize=1000, ttl=3600)

def get_cache_key(text: str, user_local_time: Optional[str] = None) -> str:
    """
    Generate a cache key for LLM requests.
    Normalizes input to increase cache hit rate.
    """
    # Normalize text (lowercase, strip, remove extra whitespace)
    normalized = " ".join(text.lower().strip().split())
    
    # Include date (not time) from user_local_time for day-relative caching
    date_part = ""
    if user_local_time:
        try:
            date_part = user_local_time.split("T")[0]
        except:
            pass
    
    cache_input = f"{normalized}|{date_part}"
    return hashlib.md5(cache_input.encode()).hexdigest()

def get_cached_response(text: str, user_local_time: Optional[str] = None) -> Optional[dict]:
    """
    Check if we have a cached LLM response for this input.
    Returns None if not cached.
    """
    key = get_cache_key(text, user_local_time)
    cached = llm_cache.get(key)
    if cached:
        logger.info(f"LLM Cache HIT for key {key[:8]}...")
    return cached

def cache_response(text: str, user_local_time: Optional[str], response: dict) -> None:
    """Cache an LLM response for future use."""
    key = get_cache_key(text, user_local_time)
    llm_cache[key] = response
    logger.info(f"LLM Cache STORE for key {key[:8]}... (cache size: {len(llm_cache)})")

def get_cache_stats() -> dict:
    """Return cache statistics."""
    return {
        "current_size": len(llm_cache),
        "max_size": llm_cache.maxsize,
        "ttl_seconds": llm_cache.ttl
    }

# =============================================================================
# Transcription Cache (for repeated audio transcriptions)
# =============================================================================

# Smaller cache for transcriptions (audio files are larger)
# Cache by audio file hash
transcription_cache = TTLCache(maxsize=100, ttl=1800)  # 30 min TTL

def get_audio_cache_key(audio_bytes: bytes) -> str:
    """Generate cache key from audio file content."""
    return hashlib.md5(audio_bytes).hexdigest()

def get_cached_transcription(audio_bytes: bytes) -> Optional[str]:
    """Check for cached transcription."""
    key = get_audio_cache_key(audio_bytes)
    cached = transcription_cache.get(key)
    if cached:
        logger.info(f"Transcription Cache HIT for key {key[:8]}...")
    return cached

def cache_transcription(audio_bytes: bytes, text: str) -> None:
    """Cache a transcription result."""
    key = get_audio_cache_key(audio_bytes)
    transcription_cache[key] = text
    logger.info(f"Transcription Cache STORE for key {key[:8]}...")
