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
    def parse_text(self, text: str, user_local_time: str = None) -> dict:
        """
        Sends text to OpenAI and enforces a strict JSON schema return.
        user_local_time: ISO format with timezone, e.g., "2026-01-19T10:00:00+02:00"
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
             
        system_prompt = f"""
        You are an AI Calendar Assistant. 
        
        CURRENT USER CONTEXT:
        - User's Local Date: {current_date_str}
        - User's Local Time: {current_time_str}
        - User's Timezone: {timezone_info}
        
        CRITICAL: ALL TIMES YOU OUTPUT MUST BE IN UTC (with 'Z' suffix).
        When user says "4pm", convert it to UTC based on their timezone.
        Example: If user is in UTC+2 and says "4pm", output "2026-01-19T14:00:00Z" (4pm local = 2pm UTC).
        
        Upcoming Days Reference:
{upcoming_days_context}

        
        Step 1: Analyze the input in the 'reasoning' field. Explicitly state what is vague.
        Step 2: Extract tasks, calendar commands, and ambiguities.
        Step 3: CONVERT ALL TIMES TO UTC before outputting.
        
        Rules for Ambiguity:
          1. If time is in 24-hour format (e.g. "15", "15:00", "13", "22"), it is UNAMBIGUOUS - extract directly:
             - Numbers 13-23 are ALWAYS PM (13=1pm, 15=3pm, 22=10pm)
             - Numbers 0-12 without AM/PM may need clarification IF context doesn't help
          2. If time has AM/PM specified (e.g. "10am", "10 PM"), extract it directly - NO ambiguity.
          3. Smart Context Inference (Do this BEFORE flagging ambiguity):
             - "Breakfast", "Morning", "Wake up" -> AM (e.g. "Breakfast at 8" = 8 AM)
             - "Dinner", "Evening", "Night", "Party", "Drinks" -> PM (e.g. "Dinner at 8" = 8 PM)
             - "Lunch" -> PM (12pm-2pm)
             - "Work" -> AM (start) or PM (end) depending on typical hours, default to 9am start if vague.
             - "Gym", "Workout" -> Ambiguous if not specified, unless "morning workout" etc.
             
             CRITICAL: If you infer AM/PM from these context words, the time is considered UNAMBIGUOUS.
             create a TASK for it immediately. Do NOT create an Ambiguity.

          4. ONLY create Ambiguity if:
             - Time is 1-12 without AM/PM AND context provides NO clues (e.g. "Call Bob at 4").
             - Do NOT create ambiguity for scheduling conflicts - that is handled separately by the system
          5. When generating an Ambiguity:
             - CRITICAL: The 'title' field must be the ACTUAL TASK NAME (e.g. "Dentist Appointment", "Meeting with Bob"). 
             - Do NOT use generic titles like "Meeting Time?" or "Ambiguity".
             - The title should describe WHAT the event is, not WHAT is ambiguous.
             - Provide logical options (e.g. 8 AM vs 8 PM).
             - The 'value' in each option must INCLUDE the 'title' field with the same task name.
             - Generate a helpful 'message' asking the user to clarify the time.
             - ALL TIMES IN OPTIONS MUST BE UTC (with 'Z' suffix).
             
          6. Convert relative dates (tomorrow, next monday, friday) to ISO timestamps using Current Date context.
           
        - IMPORTANT: If user says a weekday (e.g. "Friday") and today is Sunday, it means the UPCOMING Friday (not past).
        - User's Current Date is {current_date_str}. "Friday" should be calculated relative to THIS date.
        - REMEMBER: Output all times in UTC with 'Z' suffix!
        
        Example JSON Output (Ambiguity Case, times in UTC):
        {{
          "reasoning": "User said 'dentist at 8' without AM/PM. Time is ambiguous. User is in UTC+2.",
          "tasks": [],
          "ambiguities": [
            {{
                "title": "Dentist Appointment",
                "type": "unclear_time", 
                "message": "Is your dentist appointment at 8 AM or 8 PM?",
                "options": [
                    {{"label": "8 AM", "value": "{{\\"title\\": \\"Dentist Appointment\\", \\"start_time\\": \\"2026-01-17T06:00:00Z\\", \\"end_time\\": \\"2026-01-17T07:00:00Z\\"}}"}}
                    {{"label": "8 PM", "value": "{{\\"title\\": \\"Dentist Appointment\\", \\"start_time\\": \\"2026-01-17T18:00:00Z\\", \\"end_time\\": \\"2026-01-17T19:00:00Z\\"}}"}}
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
