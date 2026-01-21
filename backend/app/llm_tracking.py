"""
LLM Tracking Service
====================
Wrapper for OpenAI API calls with automatic token usage and cost tracking.
"""

import time
from openai import OpenAI
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, Type
from pydantic import BaseModel

from .database import SessionLocal
from .models import TokenLog

# --- Pricing Constants (per token) ---
# GPT-4o-mini pricing as of January 2026
GPT_4O_MINI_INPUT_COST_PER_TOKEN = 0.15 / 1_000_000   # $0.15 per 1M input tokens
GPT_4O_MINI_OUTPUT_COST_PER_TOKEN = 0.60 / 1_000_000  # $0.60 per 1M output tokens

# Model name constant
DEFAULT_MODEL = "gpt-4o-mini"


def call_llm_with_tracking(
    client: OpenAI,
    user_id: Optional[int],
    feature_name: str,
    messages: list,
    response_format: Type[BaseModel],
    model: str = DEFAULT_MODEL,
    temperature: float = 0.0,
    max_tokens: int = 500
) -> dict:
    """
    Calls OpenAI's structured output API and logs token usage to the database.
    
    Args:
        client: OpenAI client instance
        user_id: User making the request (nullable for anonymous/system calls)
        feature_name: Feature identifier (e.g., "scheduler", "transcription")
        messages: List of message dicts for the API
        response_format: Pydantic model for structured output
        model: OpenAI model name
        temperature: Sampling temperature
        max_tokens: Maximum tokens in response
        
    Returns:
        Parsed response as a dict
    """
    start_time = time.perf_counter()
    response = None
    usage_data = None
    
    try:
        # Make the API call
        response = client.beta.chat.completions.parse(
            model=model,
            messages=messages,
            response_format=response_format,
            max_tokens=max_tokens,
            temperature=temperature
        )
        
        # Extract usage data
        if response.usage:
            usage_data = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            }
        
        # Return parsed result
        return response.choices[0].message.parsed.model_dump()
        
    finally:
        # Always log usage, even if something fails after API call
        end_time = time.perf_counter()
        latency_ms = (end_time - start_time) * 1000
        
        if usage_data:
            _log_token_usage(
                user_id=user_id,
                feature=feature_name,
                model=model,
                prompt_tokens=usage_data["prompt_tokens"],
                completion_tokens=usage_data["completion_tokens"],
                total_tokens=usage_data["total_tokens"],
                latency_ms=latency_ms
            )


def _log_token_usage(
    user_id: Optional[int],
    feature: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    latency_ms: float
) -> None:
    """
    Saves a TokenLog entry to the database.
    Uses a fresh session to ensure commit even if caller fails.
    """
    # Calculate cost
    if model == "gpt-4o-mini":
        input_cost = prompt_tokens * GPT_4O_MINI_INPUT_COST_PER_TOKEN
        output_cost = completion_tokens * GPT_4O_MINI_OUTPUT_COST_PER_TOKEN
    else:
        # Default to gpt-4o-mini pricing for unknown models
        input_cost = prompt_tokens * GPT_4O_MINI_INPUT_COST_PER_TOKEN
        output_cost = completion_tokens * GPT_4O_MINI_OUTPUT_COST_PER_TOKEN
    
    cost_usd = input_cost + output_cost
    
    # Use a fresh session to ensure this commit is independent
    db: Session = SessionLocal()
    try:
        log_entry = TokenLog(
            user_id=user_id,
            feature=feature,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            timestamp=datetime.utcnow()
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        print(f"Failed to log token usage: {e}")
        db.rollback()
    finally:
        db.close()
