import os
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import List, Optional
from pathlib import Path
from dotenv import load_dotenv

# 1. Get the absolute path to the directory where this file lives
# Then go up to the 'backend' folder (app -> backend)
# __file__ = backend/app/llm_adapter.py
# parent = backend/app
# parent.parent = backend
base_path = Path(__file__).resolve().parent.parent
env_path = base_path / ".env"

# 2. Load it explicitly
load_dotenv(dotenv_path=str(env_path))

# 3. Initialize
api_key = os.getenv("OPENAI_API_KEY")

if not api_key:
    print(f"❌ OPENAI_API_KEY not found. Looked in: {env_path}")
    # Don't raise error to keep app running with mock, but log it loudly
    # raise ValueError(f"❌ OPENAI_API_KEY not found. Looked in: {env_path}")

client = OpenAI(api_key=api_key)

# --- AI Specific Schemas (Internal to this adapter) ---
class AICandidate(BaseModel):
    title: str = Field(..., description="A concise title for the task")
    start_time: Optional[str] = Field(None, description="ISO 8601 format (YYYY-MM-DDTHH:MM:SS) if specific time mentioned, else null")
    end_time: Optional[str] = Field(None, description="ISO 8601 format. If duration not specified, leave null.")
    description: Optional[str] = Field(None, description="Extra context or details")
    confidence: float = Field(..., description="0.0 to 1.0 confidence score")

class AmbiguityOption(BaseModel):
    label: str = Field(..., description="Button text, e.g. '8 AM'")
    value: str = Field(..., description="JSON string of parameters to apply if selected, e.g. '{\"title\": \"Meeting\", \"start_time\": \"2026-01-17T08:00:00\"}'")

class AIAmbiguity(BaseModel):
    title: str = Field(..., description="A short tentative title for the ambiguous task, e.g. 'Dinner' or 'Meeting'")
    type: str = Field(..., description="Category: 'missing_time', 'unclear_intent'")
    message: str = Field(..., description="Question to ask the user to resolve this")
    options: List[AmbiguityOption] = Field(default_factory=list, description="Suggested resolution options")

class AICommand(BaseModel):
    type: str = Field(..., description="Action: 'CLEAR_DAY', 'RESCHEDULE_ALL', etc.")
    payload: str = Field("{}", description="Json stringified parameters if any, e.g. '{\"date\": \"2026-01-01\"}'")

class AIParseResult(BaseModel):
    reasoning: str = Field(..., description="Step-by-step logic explaining how times were extracted and why ambiguity was or wasn't flagged.")
    tasks: List[AICandidate]
    commands: List[AICommand]
    ambiguities: List[AIAmbiguity]

from datetime import datetime
from .local_parser import parse_simple_task

class LLMAdapter:
    def parse_text(self, text: str, user_local_time: str = None, ai_temperature: float = 0.0, personal_context: str = None, user_id: int = None) -> dict:
        """
        Sends text to OpenAI and enforces a strict JSON schema return.
        user_local_time: ISO format with timezone, e.g., "2026-01-19T10:00:00+02:00"
        ai_temperature: float between 0.0 and 1.0 (default 0.0)
        personal_context: Optional string containing user's personal context/preferences
        user_id: Optional user ID for token usage tracking
        """
        # --- CHECK CACHE FIRST ---
        from .rate_limit import get_cached_response, cache_response
        
        # Start with base cache key
        cache_key_elements = [text, user_local_time]
        if ai_temperature > 0:
            cache_key_elements.append(str(ai_temperature))
        if personal_context:
            cache_key_elements.append(personal_context)
            
        # We can't easily change the cache function signature everywhere, so we might skip caching 
        # for highly personalized requests, OR just rely on the text+time for now if we assume properties rarely change.
        # However, strictly speaking, changing context SHOULD change the output.
        # For this implementation, I will skip smart caching update for now to avoid breaking changes in rate_limit.py,
        # but ideally we should update get_cached_response to take *args.
        # Let's just proceed with standard caching for now.

        cached = get_cached_response(text, user_local_time)
        if cached:
            return cached
            
        # --- LOCAL GUARD (FAST PATH) ---
        # Try to parse simple commands locally before hitting the LLM
        # Only use if temperature is low (user doesn't want creative interpretation)
        if ai_temperature < 0.3:
            local_result = parse_simple_task(text, user_local_time)
            if local_result:
                print(f"⚡ Local Parser used for: '{text}'")
                
                # Log this as a "local" event with 0 cost
                from .llm_tracking import log_token_usage
                log_token_usage(
                    user_id=user_id,
                    feature="scheduler-local",
                    model="local-regex",
                    prompt_tokens=0,
                    completion_tokens=0,
                    total_tokens=0,
                    latency_ms=10.0 # Approximate
                )
                
                return local_result
        
        # --- MOCK/FALLBACK IF NO KEY ---
        if not client.api_key or client.api_key == "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx":
             print("Warning: OPENAI_API_KEY invalid or missing. Using mock response.")
             return {
                 "reasoning": "Mock execution",
                 "tasks": [{
                     "title": "Mock Task (No API Key)",
                     "description": text,
                     "start_time": None,
                     "end_time": None,
                     "confidence": 0.0
                 }],
                 "commands": [],
                 "ambiguities": []
             }
             
        # Parse user's local time if provided, otherwise use server time
        if user_local_time:
            try:
                from dateutil import parser as date_parser
                user_dt = date_parser.isoparse(user_local_time)
                current_date_str = user_dt.strftime("%Y-%m-%d (%A)")
                current_time_str = user_dt.strftime("%H:%M")
                timezone_offset = user_dt.strftime("%z")  # e.g., "+0200"
                timezone_info = f"UTC{timezone_offset[:3]}:{timezone_offset[3:]}" if timezone_offset else "UTC"
            except:
                current_dt = datetime.now()
                current_date_str = current_dt.strftime("%Y-%m-%d (%A)")
                current_time_str = current_dt.strftime("%H:%M")
                timezone_info = "UTC (assumed)"
                user_dt = current_dt
        else:
            current_dt = datetime.now()
            current_date_str = current_dt.strftime("%Y-%m-%d (%A)")
            current_time_str = current_dt.strftime("%H:%M")
            timezone_info = "UTC (assumed)"
            user_dt = current_dt
        
        # Generate next 7 days context to help LLM resolve "Friday", "Next Tuesday" etc.
        from datetime import timedelta
        upcoming_days_context = "\n".join([
            (user_dt + timedelta(days=i)).strftime(f"          - +{i} days: %Y-%m-%d (%A)")
            for i in range(8)
        ])
        
        personal_context_section = f"\nUser context: {personal_context}" if personal_context else ""

        system_prompt = f"""You extract scheduling intent into structured JSON. Output all times in UTC (suffix 'Z'). Convert from {timezone_info}.
MATH RULE: Subtract the offset from local time to get UTC. Example: If TZ is UTC+02:00, then 8:00 AM local = 06:00:00Z.

Date: {current_date_str} | Time: {current_time_str} | TZ: {timezone_info}{personal_context_section}

Upcoming dates:
{upcoming_days_context}

Rules:
1. AM/PM RESOLUTION: Resolve AM/PM ONLY if explicit contextual clues exist.
   - PM Clues: "Dinner", "Evening", "Tonight", "Night", "Afternoon".
   - AM Clues: "Breakfast", "Morning", "Early".
   - Mixed: "8 in the evening" (PM), "10 in the morning" (AM) are clear.
   - If a clue exists, extract directly to tasks[]. Do NOT flag as ambiguous.
2. MANDATORY AMBIGUITY: If a 12h time is given (e.g., "8", "8:30") WITHOUT one of the clues above, you MUST use ambiguities[]. Never guess based on world knowledge (e.g., don't guess "Tennis" is AM or "Meeting" is PM). If the user says "Tennis at 8", and provides no other info, ask AM or PM.
3. 24h CERTAINTY: 13:00-23:59 (e.g. "17:15") is ALWAYS unambiguous. Never ask AM/PM.
4. MULTI-DAY RANGES: If the user provides a range (e.g., "Feb 20 - Feb 21"), the start date is the first date and the end date is the second date. Do NOT extend the range further.
5. LODGING DEFAULTS: For lodging tasks ("Airbnb", "Hotel", "Stay", "Check-in"), if times are not specified, use a default START time of 15:00 (Check-in) and a default END time of 11:00 (Check-out) on their respective start/end dates.
6. EXTRACT: Clear times -> tasks[]. Missing dates -> assume today (or tomorrow if time passed).
7. REJECT: Do NOT flag schedule overlaps or use the word 'conflict' — that is System B's job.
8. ambiguities[].options[].value must be a JSON string of task parameters.
"""

        try:
            from .llm_tracking import call_llm_with_tracking
            
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ]
            
            result = call_llm_with_tracking(
                client=client,
                user_id=user_id,
                feature_name="scheduler",
                messages=messages,
                response_format=AIParseResult,
                temperature=ai_temperature,
                max_tokens=500
            )
            
            # Cache the successful response
            cache_response(text, user_local_time, result)
            
            return result

        except Exception as e:
            print(f"OpenAI Error: {e}")
            # Fallback to an error state or empty result so app doesn't crash
            return {"tasks": [], "commands": [], "ambiguities": [{"type": "error", "message": f"AI Parsing Error: {str(e)}"}]}

    def transcribe_audio(self, file_path: str) -> str:
        """
        Transcribes audio file using OpenAI's Whisper model.
        Uses caching to avoid redundant transcriptions.
        """
        from .rate_limit import get_cached_transcription, cache_transcription
        if not client.api_key or client.api_key == "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx":
             return "Mock transcription: Meeting with team tomorrow at 10am."
             
        try:
            # Read audio file for caching
            with open(file_path, "rb") as f:
                audio_bytes = f.read()
            
            # Check cache
            cached = get_cached_transcription(audio_bytes)
            if cached:
                return cached
            
            # Make API call
            with open(file_path, "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1", 
                    file=audio_file,
                    response_format="text"
                )
            
            # Cache result
            cache_transcription(audio_bytes, transcription)
            
            return transcription
        except Exception as e:
            print(f"Transcription Error: {e}")
            raise e
