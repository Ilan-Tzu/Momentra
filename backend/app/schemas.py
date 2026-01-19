from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime

class JobStatus(str, Enum):
    CREATED = "created"
    PARSED = "parsed"
    ACCEPTED = "accepted"
    FAILED = "failed"

class JobCreate(BaseModel):
    raw_text: str
    user_local_time: Optional[str] = None  # ISO format with timezone, e.g., "2026-01-19T10:00:00+02:00"

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
    
    class Config:
        from_attributes = True

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    description: Optional[str] = None
    ignore_conflicts: Optional[bool] = False

class UserRead(BaseModel):
    id: int
    username: str
    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class GoogleAuth(BaseModel):
    id_token: str

class JobExecuteResponse(BaseModel):
    job_id: int
    status: JobStatus
    tasks_created: List[TaskRead]
