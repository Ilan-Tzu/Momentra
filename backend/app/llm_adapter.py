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
    end_time: Optional[str] = Field(None, description="ISO 8601 format. If duration not specified, assume 1 hour.")
    description: Optional[str] = Field(None, description="Extra context or details")
    confidence: float = Field(..., description="0.0 to 1.0 confidence score")

class AmbiguityOption(BaseModel):
    label: str = Field(..., description="Button text, e.g. '8 AM'")
    value: str = Field(..., description="JSON string of parameters to apply if selected, e.g. '{\"title\": \"Meeting\", \"start_time\": \"2026-01-17T08:00:00\"}'")

class AIAmbiguity(BaseModel):
    title: str = Field(..., description="A short tentative title for the ambiguous task, e.g. 'Dinner' or 'Meeting'")
    type: str = Field(..., description="Category: 'missing_time', 'conflict', 'unclear_intent'")
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

class LLMAdapter:
    def parse_text(self, text: str, user_timezone: str = "UTC") -> dict:
        """
        Sends text to OpenAI and enforces a strict JSON schema return.
        """
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
             
        # Calculate current time dynamically
        current_dt = datetime.now()
        current_date_str = current_dt.strftime("%Y-%m-%d (%A)")
        
        # Generator next 7 days context to help LLM resolve "Friday", "Next Tuesday" etc.
        from datetime import timedelta
        upcoming_days_context = "\n".join([
            (current_dt + timedelta(days=i)).strftime(f"          - +{i} days: %Y-%m-%d (%A)")
            for i in range(8)
        ])
             
        system_prompt = f"""
        You are an AI Calendar Assistant. 
        Current Time (Context): {current_date_str}.
        User Timezone: {user_timezone}.
        
        Upcoming Days Reference:
{upcoming_days_context}

        
        Step 1: Analyze the input in the 'reasoning' field. explicitely state what is vague.
        Step 2: Extract tasks, calendar commands, and ambiguities.
        
        Rules for Ambiguity:
          1. If time is clearly specified (e.g. "10am", "10 PM", "15:00"), extract it directly.
          2. ONLY determine Ambiguity if AM/PM is missing AND context doesn't clarify (e.g. "at 8").
          3. When generating an Ambiguity:
             - Provide logical options (e.g. 8 AM vs 8 PM).
             - The 'value' must be a valid JSON string for Task parameters.
             - Generate a SHORT Title for the ambiguity (e.g. "Meeting Time?").
          
          4. Convert relative dates (tomorrow, next monday, friday) to ISO timestamps using Current Time context.
          
        - IMPORTANT: If user says a weekday (e.g. "Friday") and today is Sunday, it means the UPCOMING Friday (not past).
        - Current Date is {current_date_str}. "Friday" should be calculated relative to THIS date.
        
        Example JSON Output:
        {{
          "reasoning": "User said 'at 8' without AM/PM. Conflicting.",
          "tasks": [],
          "ambiguities": [
            {{
                "title": "Meeting Time?",
                "type": "unclear_time", 
                "message": "Did you mean 8 AM or 8 PM?",
                "options": [
                    {{"label": "8 AM", "value": "{{\\"start_time\\": \\"2026-01-17T08:00:00\\", \\"end_time\\": \\"2026-01-17T09:00:00\\"}}"}},
                    {{"label": "8 PM", "value": "{{\\"start_time\\": \\"2026-01-17T20:00:00\\", \\"end_time\\": \\"2026-01-17T21:00:00\\"}}"}}
                ]
            }}
          ],
          "commands": []
        }}
        """

        try:
            completion = client.beta.chat.completions.parse(
                model="gpt-4o-mini", 
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text},
                ],
                response_format=AIParseResult,
                max_tokens=500,
                temperature=0.0,  # Guardrail: Reduce creativity
            )

            # The SDK automatically validates the JSON against the Pydantic model
            parsed_data = completion.choices[0].message.parsed
            
            # Convert back to dict for the Service layer
            return parsed_data.model_dump()

        except Exception as e:
            print(f"OpenAI Error: {e}")
            # Fallback to an error state or empty result so app doesn't crash
            return {"tasks": [], "commands": [], "ambiguities": [{"type": "error", "message": f"AI Parsing Error: {str(e)}"}]}

    def transcribe_audio(self, file_path: str) -> str:
        """
        Transcribes audio file using OpenAI's Whisper model.
        """
        if not client.api_key or client.api_key == "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx":
             return "Mock transcription: Meeting with team tomorrow at 10am."
             
        try:
            with open(file_path, "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1", 
                    file=audio_file,
                    response_format="text"
                )
            return transcription
        except Exception as e:
            print(f"Transcription Error: {e}")
            raise e
