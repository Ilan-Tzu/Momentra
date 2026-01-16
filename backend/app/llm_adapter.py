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

class AIAmbiguity(BaseModel):
    type: str = Field(..., description="Category: 'missing_time', 'conflict', 'unclear_intent'")
    message: str = Field(..., description="Question to ask the user to resolve this")

class AICommand(BaseModel):
    type: str = Field(..., description="Action: 'CLEAR_DAY', 'RESCHEDULE_ALL', etc.")
    payload: str = Field("{}", description="Json stringified parameters if any, e.g. '{\"date\": \"2026-01-01\"}'")

class AIParseResult(BaseModel):
    reasoning: str = Field(..., description="Step-by-step logic explaining how times were extracted and why ambiguity was or wasn't flagged.")
    tasks: List[AICandidate]
    commands: List[AICommand]
    ambiguities: List[AIAmbiguity]

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
             
        system_prompt = f"""
        You are an AI Calendar Assistant. 
        Current Time (Context): 2026-01-16 (Friday).
        User Timezone: {user_timezone}.
        
        Step 1: Analyze the input in the 'reasoning' field. explicitely state what is vague.
        Step 2: Extract tasks, calendar commands, and ambiguities.
        
        Rules for Ambiguity:
          1. If AM/PM is missing (e.g. "at 8"), you MUST create an Ambiguity entry asking "Did you mean 8 AM or 8 PM?". DO NOT create a Task in this case.
          2. If the date is vague ("later"), create an Ambiguity.
          3. If your confidence in the guessed time is below 0.9, you MUST generate an ambiguity instead of a task.
          
        - Convert all relative times (tomorrow, next tuesday) to absolute ISO timestamps based on Current Time.
        
        Example JSON Output:
        {{
          "reasoning": "User said 'at 8' without AM/PM. This is ambiguous.",
          "tasks": [],
          "ambiguities": [{{"type": "unclear_time", "message": "Did you mean 8 AM or 8 PM?"}}],
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
