from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime
import bleach

def sanitize_string(v: Any) -> Any:
    if isinstance(v, str):
        # Strip whitespace and clean HTML to prevent XSS
        # tags=[] and attributes={} means all HTML is stripped/escaped
        return bleach.clean(v.strip(), tags=[], attributes={}, strip=True)
    return v

class JobStatus(str, Enum):
    CREATED = "created"
    PARSED = "parsed"
    ACCEPTED = "accepted"
    FAILED = "failed"

class JobCreate(BaseModel):
    raw_text: str
    user_local_time: Optional[str] = None  # ISO format with timezone, e.g., "2026-01-19T10:00:00+02:00"

    @field_validator("raw_text")
    @classmethod
    def sanitize_input(cls, v):
        return sanitize_string(v)

class JobCandidateRead(BaseModel):
    id: int
    description: str
    command_type: str  # e.g., "CREATE_EVENT", "CLEAR_DAY", "REMINDER"
    parameters: Dict[str, Any]
    confidence: float
    original_text_segment: Optional[str] = None
    
    class Config:
        from_attributes = True

class JobCandidateUpdate(BaseModel):
    description: Optional[str] = None
    command_type: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    ignore_conflicts: Optional[bool] = False

    @field_validator("description", "command_type")
    @classmethod
    def sanitize_input(cls, v):
        if v is None: return v
        return sanitize_string(v)

    @field_validator("parameters")
    @classmethod
    def sanitize_parameters(cls, v):
        if v is None: return v
        if isinstance(v, dict):
            return {k: sanitize_string(val) if isinstance(val, str) else val for k, val in v.items()}
        return v

class JobRead(BaseModel):
    id: int
    status: JobStatus
    raw_text: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class JobWithCandidates(JobRead):
    candidates: List[JobCandidateRead] = []

class JobAccept(BaseModel):
    selected_candidate_ids: List[int]
    ignore_conflicts: Optional[bool] = False

class TaskRead(BaseModel):
    id: int
    title: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    description: Optional[str] = None
    is_blocking: bool = True
    
    class Config:
        from_attributes = True

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    description: Optional[str] = None
    ignore_conflicts: Optional[bool] = False

    @field_validator("title", "description")
    @classmethod
    def sanitize_input(cls, v):
        if v is None: return v
        return sanitize_string(v)

class UserRead(BaseModel):
    id: int
    username: str
    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def sanitize_input(cls, v):
        return sanitize_string(v)

class UserLogin(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def sanitize_input(cls, v):
        return sanitize_string(v)

class GoogleAuth(BaseModel):
    id_token: str

class JobExecuteResponse(BaseModel):
    job_id: int
    status: JobStatus
    tasks_created: List[TaskRead]
    remaining_candidates: List[JobCandidateRead] = []

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead

class TokenRefresh(BaseModel):
    refresh_token: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserPreferencesRead(BaseModel):
    id: int
    user_id: int
    buffer_minutes: int = 15
    work_start_hour: int = 8
    work_end_hour: int = 22
    default_duration_minutes: int = 60
    ai_temperature: float = 0.0
    personal_context: Optional[str] = None
    first_day_of_week: int = 1
    time_format_24h: bool = False
    
    class Config:
        from_attributes = True

class UserPreferencesUpdate(BaseModel):
    buffer_minutes: Optional[int] = None
    work_start_hour: Optional[int] = None
    work_end_hour: Optional[int] = None
    default_duration_minutes: Optional[int] = None
    ai_temperature: Optional[float] = None
    personal_context: Optional[str] = None
    first_day_of_week: Optional[int] = None
    time_format_24h: Optional[bool] = None
