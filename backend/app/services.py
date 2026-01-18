from sqlalchemy.orm import Session
from .models import Job, JobCandidate, Task, JobStatus, User
from .schemas import JobCreate, JobCandidateRead, JobCandidateUpdate, TaskUpdate
import os
import json
from datetime import datetime
from typing import List, Optional



from .llm_adapter import LLMAdapter

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class JobService:
    def __init__(self, db: Session):
        self.db = db
        self.llm = LLMAdapter()

    def get_or_create_user(self, username: str) -> User:
        # Legacy method for dev/testing or non-pw flow
        user = self.db.query(User).filter(User.username == username).first()
        if not user:
            user = User(username=username, hashed_password="legacy_no_access")
            self.db.add(user)
            self.db.commit()
            self.db.refresh(user)
        return user

    def create_user(self, username: str, password: str) -> User:
        user = self.db.query(User).filter(User.username == username).first()
        if user:
            raise ValueError("Username already taken")
        hashed = pwd_context.hash(password)
        new_user = User(username=username, hashed_password=hashed)
        self.db.add(new_user)
        self.db.commit()
        self.db.refresh(new_user)
        return new_user

    def authenticate_user(self, username: str, password: str) -> Optional[User]:
        user = self.db.query(User).filter(User.username == username).first()
        if not user:
            return None
        if not pwd_context.verify(password, user.hashed_password):
            return None
        return user

    def create_job(self, job_create: JobCreate, user_id: int) -> Job:
        job = Job(raw_text=job_create.raw_text, status=JobStatus.CREATED, user_id=user_id)
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def parse_job(self, job_id: int) -> int:
        job = self.db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError("Job not found")

        # Parse text using the new adapter structure
        result = self.llm.parse_text(job.raw_text, user_timezone="UTC")
        
        # Clear existing candidates 
        self.db.query(JobCandidate).filter(JobCandidate.job_id == job_id).delete()

        candidates = []
        
        # Process Tasks
        for task in result.get("tasks", []):
            candidate = JobCandidate(
                job_id=job.id,
                description=task.get("title", ""),
                command_type="CREATE_TASK",
                parameters={
                    "title": task.get("title"),
                    "start_time": task.get("start_time"),
                    "end_time": task.get("end_time"),
                    "description": task.get("description")
                },
                confidence=float(task.get("confidence", 0.0))
                # no original_text_segment in user's schema, skipping or we could add back if needed
            )
            self.db.add(candidate)
            candidates.append(candidate)
            
        # Process Commands
        for cmd in result.get("commands", []):
            params = {}
            if "payload" in cmd:
                try:
                    params = json.loads(cmd["payload"])
                except:
                    params = {}
            
            candidate = JobCandidate(
                job_id=job.id,
                description=f"Command: {cmd.get('type')}",
                command_type=cmd.get("type", "COMMAND"),
                parameters=params,
                confidence=1.0 
            )
            self.db.add(candidate)
            candidates.append(candidate)
            
        # Process Ambiguities
        for amb in result.get("ambiguities", []):
            candidate = JobCandidate(
                job_id=job.id,
                description=amb.get("title") or f"Ambiguity: {amb.get('message')}",
                command_type="AMBIGUITY",
                parameters={
                    "type": amb.get("type"), 
                    "message": amb.get("message"),
                    "options": [
                        {"label": opt.get("label"), "value": opt.get("value")} 
                        for opt in amb.get("options", [])
                    ]
                },
                confidence=0.0
            )
            self.db.add(candidate)
            candidates.append(candidate)
        
        job.status = JobStatus.PARSED
        self.db.commit()
        return len(candidates)

    def get_job_details(self, job_id: int) -> Optional[Job]:
        return self.db.query(Job).filter(Job.id == job_id).first()

    def accept_candidates(self, job_id: int, selected_ids: List[int]) -> List[Task]:
        job = self.db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError("Job not found")

        # Fetch selected candidates
        candidates = self.db.query(JobCandidate).filter(
            JobCandidate.id.in_(selected_ids),
            JobCandidate.job_id == job_id
        ).all()

        created_tasks = []
        for cand in candidates:
            # Here we "execute" the command. For now assume mostly creating tasks.
            params = cand.parameters
            # Handle potential stingified JSON if somehow double encoded, DB JSON type handles dicts implicitly
            if isinstance(params, str):
                try:
                    params = json.loads(params)
                except:
                    params = {}
            
            # Simple mapping logic
            task = Task(
                source_job_id=job.id,
                user_id=job.user_id,
                title=params.get("title", cand.description),
                start_time=self._parse_datetime(params.get("start_time")),
                end_time=self._parse_datetime(params.get("end_time")),
                description=params.get("description", "")
            )
            print(f"DEBUG: Creating Task: title='{task.title}', start={task.start_time}, user_id={task.user_id}")
            self.db.add(task)
            created_tasks.append(task)
        
        job.status = JobStatus.ACCEPTED
        self.db.commit()
        return created_tasks

    def _parse_datetime(self, dt_str):
        if not dt_str: return None
        try:
            # Parse ISO string
            dt = datetime.fromisoformat(dt_str)
            
            # If offset-aware, convert to UTC and strip tzinfo (naive UTC)
            if dt.tzinfo is not None:
                dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            
            return dt
        except:
            return None

    def update_candidate(self, candidate_id: int, update_data: JobCandidateUpdate) -> JobCandidate:
        candidate = self.db.query(JobCandidate).filter(JobCandidate.id == candidate_id).first()
        if not candidate:
            raise ValueError("Candidate not found")
        
        if update_data.description is not None:
            candidate.description = update_data.description
            
        if update_data.command_type is not None:
            candidate.command_type = update_data.command_type
        
        if update_data.parameters is not None:
            # Simple merge or replace? For simplicity, replace the dict or specific keys.
            # SQLAlchemy mutable dicts can be tricky; let's specific replace for now.
            candidate.parameters = update_data.parameters
            
        self.db.commit()
        self.db.refresh(candidate)
        return candidate

    def delete_candidate(self, candidate_id: int):
        candidate = self.db.query(JobCandidate).filter(JobCandidate.id == candidate_id).first()
        if not candidate:
            raise ValueError("Candidate not found")
        self.db.delete(candidate)
        self.db.commit()

    def get_tasks(self, start_date: datetime, end_date: datetime, user_id: int) -> List[Task]:
        # Relaxed query to just show all user tasks for now to ensure they appear
        # We can re-add strict range filtering later if needed
        return self.db.query(Task).filter(
            Task.user_id == user_id
        ).order_by(Task.start_time.asc()).all()

    def update_task(self, task_id: int, update_data: TaskUpdate) -> Task:
        task = self.db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise ValueError("Task not found")
        
        if update_data.title is not None:
            task.title = update_data.title
        if update_data.description is not None:
            task.description = update_data.description
        if update_data.start_time is not None:
            task.start_time = update_data.start_time
        if update_data.end_time is not None:
            task.end_time = update_data.end_time
            
        self.db.commit()
        self.db.refresh(task)
        return task

    def delete_task(self, task_id: int):
        task = self.db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise ValueError("Task not found")
        self.db.delete(task)
        self.db.commit()
