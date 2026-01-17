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

class TaskRead(BaseModel):
    id: int
    title: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    description: Optional[str] = None
    
    class Config:
        from_attributes = True

class JobExecuteResponse(BaseModel):
    job_id: int
    status: JobStatus
    tasks_created: List[TaskRead]
