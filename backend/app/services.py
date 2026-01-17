from sqlalchemy.orm import Session
from .models import Job, JobCandidate, Task, JobStatus
from .schemas import JobCreate, JobCandidateRead, JobCandidateUpdate
import os
import json
from datetime import datetime
from typing import List, Optional



from .llm_adapter import LLMAdapter

class JobService:
    def __init__(self, db: Session):
        self.db = db
        self.llm = LLMAdapter()

    def create_job(self, job_create: JobCreate) -> Job:
        job = Job(raw_text=job_create.raw_text, status=JobStatus.CREATED)
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
                description=f"Ambiguity: {amb.get('message')}",
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
            if isinstance(params, str):
                try:
                    params = json.loads(params)
                except:
                    params = {}
            
            # Simple mapping logic
            task = Task(
                source_job_id=job.id,
                title=params.get("title", cand.description),
                start_time=self._parse_datetime(params.get("start_time")),
                end_time=self._parse_datetime(params.get("end_time")),
                description=params.get("description", "")
            )
            self.db.add(task)
            created_tasks.append(task)
        
        job.status = JobStatus.ACCEPTED
        self.db.commit()
        return created_tasks

    def _parse_datetime(self, dt_str):
        if not dt_str: return None
        try:
            return datetime.fromisoformat(dt_str)
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
