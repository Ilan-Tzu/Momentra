from sqlalchemy.orm import Session
from .models import Job, JobCandidate, Task, JobStatus, User
from .schemas import JobCreate, JobCandidateRead, JobCandidateUpdate, TaskUpdate
from .config import settings
import json
from datetime import datetime, timezone
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
        if not user.hashed_password or not pwd_context.verify(password, user.hashed_password):
            return None
        return user

    def verify_google_token(self, id_token: str) -> dict:
        """Verify Google ID token and return user info."""
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests
        
        try:
            # Verify the token with Google
            idinfo = google_id_token.verify_oauth2_token(
                id_token, 
                requests.Request(),
                audience=settings.GOOGLE_CLIENT_ID
            )
            
            # Token is valid, return user info
            return {
                'sub': idinfo.get('sub'),  # Google subject ID
                'email': idinfo.get('email'),
                'name': idinfo.get('name'),
                'picture': idinfo.get('picture')
            }
        except ValueError as e:
            raise ValueError(f"Invalid Google token: {str(e)}")

    def get_or_create_google_user(self, google_sub: str, email: str, name: str = None) -> User:
        """Find existing user by Google sub or email, or create a new one."""
        # First try to find by google_sub
        user = self.db.query(User).filter(User.google_sub == google_sub).first()
        if user:
            return user
        
        # Try to find by email
        user = self.db.query(User).filter(User.email == email).first()
        if user:
            # Link existing user to Google account
            user.google_sub = google_sub
            self.db.commit()
            self.db.refresh(user)
            return user
        
        # Create new user
        username = email.split('@')[0]  # Use email prefix as username
        # Ensure unique username
        base_username = username
        counter = 1
        while self.db.query(User).filter(User.username == username).first():
            username = f"{base_username}{counter}"
            counter += 1
        
        new_user = User(
            username=username,
            email=email,
            google_sub=google_sub,
            hashed_password=None  # No password for Google OAuth users
        )
        self.db.add(new_user)
        self.db.commit()
        self.db.refresh(new_user)
        return new_user

    def create_job(self, job_create: JobCreate, user_id: int) -> Job:
        job = Job(
            raw_text=job_create.raw_text, 
            user_local_time=job_create.user_local_time,
            status=JobStatus.CREATED, 
            user_id=user_id
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def parse_job(self, job_id: int) -> int:
        job = self.db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError("Job not found")

        # Parse text using the new adapter structure with user's timezone context
        result = self.llm.parse_text(job.raw_text, user_local_time=job.user_local_time)
        
        # Clear existing candidates 
        self.db.query(JobCandidate).filter(JobCandidate.job_id == job_id).delete()

        candidates = []
        
        # Get existing user tasks for conflict detection
        existing_tasks = self.db.query(Task).filter(Task.user_id == job.user_id).all()
        print(f"DEBUG: Found {len(existing_tasks)} existing tasks for user {job.user_id}")
        
        # Process Tasks
        for task in result.get("tasks", []):
            new_start = self._parse_datetime(task.get("start_time"))
            new_end = self._parse_datetime(task.get("end_time"))
            print(f"DEBUG: New task '{task.get('title')}' - start: {new_start}, end: {new_end}")
            
            # Check for conflicts with existing tasks
            conflict_found = self._find_conflict(job.user_id, new_start, new_end) if new_start else None
            
            if conflict_found:
                candidate = JobCandidate(
                    job_id=job.id,
                    description=f"Conflict: {task.get('title', 'New Task')}",
                    command_type="AMBIGUITY",
                    parameters=self._format_conflict_parameters(
                        task.get("title", "New Task"),
                        task.get("start_time"),
                        task.get("end_time"),
                        conflict_found
                    ),
                    confidence=0.0
                )
                self.db.add(candidate)
                candidates.append(candidate)
            else:
                # No conflict, but check if time is missing
                if not task.get("start_time"):
                    # Missing time - Convert to Ambiguity
                    candidate = JobCandidate(
                        job_id=job.id,
                        description=f"Ambiguity: Missing time for '{task.get('title', 'Task')}'",
                        command_type="AMBIGUITY",
                        parameters={
                            "type": "missing_time",
                            "message": f"What time is '{task.get('title', 'Task')}'?",
                            "options": [] # Frontend can offer time picker or we can just let user edit
                        },
                        confidence=0.0
                    )
                else:
                    # Valid task candidate
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
            
        # Process Ambiguities (from LLM)
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

    def _times_overlap(self, start1, end1, start2, end2):
        """Check if two time ranges overlap."""
        from datetime import timedelta
        
        # Normalize to naive UTC for safe comparison
        if start1 and start1.tzinfo: start1 = start1.replace(tzinfo=None)
        if end1 and end1.tzinfo: end1 = end1.replace(tzinfo=None)
        if start2 and start2.tzinfo: start2 = start2.replace(tzinfo=None)
        if end2 and end2.tzinfo: end2 = end2.replace(tzinfo=None)
        
        # If end times are not set or equal to start, assume 30 min duration
        if not end1 or (start1 and end1 <= start1):
            end1 = start1 + timedelta(minutes=30)
        if not end2 or (start2 and end2 <= start2):
            end2 = start2 + timedelta(minutes=30)
        
        if not start1 or not start2:
            return False
        
        # Check if same day first (for performance)
        if start1.date() != start2.date():
            return False
        
        # Overlap exists if one starts before the other ends (inclusive for same start time)
        # Also catch exact same start time as a conflict
        return (start1 < end2 and start2 < end1) or (start1 == start2)

    def _find_conflict(self, user_id: int, start_time: datetime, end_time: datetime) -> Optional[Task]:
        """Find an overlapping task for the user."""
        if not start_time:
            return None
        
        # Get existing user tasks
        existing_tasks = self.db.query(Task).filter(Task.user_id == user_id).all()
        for existing in existing_tasks:
            if existing.start_time:
                if self._times_overlap(start_time, end_time, existing.start_time, existing.end_time):
                    return existing
        return None

    def _format_conflict_parameters(self, title, start_time, end_time, conflict_task):
        """Standardize the conflict ambiguity parameters."""
        existing_title = conflict_task.title
        # Pass ISO format so frontend can convert to local time
        existing_start_iso = conflict_task.start_time.isoformat() + "Z" if conflict_task.start_time else None
        
        return {
            "type": "conflict",
            "title": title,
            "existing_title": existing_title,
            "existing_start_time": existing_start_iso,
            "start_time": start_time, # Add raw start_time for frontend fallback
            "end_time": end_time,     # Add raw end_time for frontend fallback
            "message": f"'{title}' conflicts with existing task '{existing_title}'. What would you like to do?",
            "options": [
                {"label": f"Keep '{title}' (replace)", "value": json.dumps({
                    "title": title,
                    "start_time": start_time,
                    "end_time": end_time,
                    "remove_task_id": conflict_task.id
                })},
                {"label": f"Keep '{existing_title}' (discard new)", "value": json.dumps({
                    "discard": True
                })},
                {"label": "Keep both (adjust times manually)", "value": json.dumps({
                    "title": title,
                    "start_time": start_time,
                    "end_time": end_time,
                    "keep_both": True
                })}
            ]
        }

    def get_job_details(self, job_id: int) -> Optional[Job]:
        return self.db.query(Job).filter(Job.id == job_id).first()

    def accept_candidates(self, job_id: int, selected_ids: List[int], ignore_conflicts: bool = False) -> List[Task]:
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
            if cand.command_type != "CREATE_TASK":
                print(f"DEBUG: Skipping candidate {cand.id} as it is not CREATE_TASK (type={cand.command_type})")
                continue
                
            params = cand.parameters
            if isinstance(params, str):
                try:
                    params = json.loads(params)
                except:
                    params = {}
            
            start_time = self._parse_datetime(params.get("start_time"))
            if not start_time:
                print(f"DEBUG: Skipping candidate {cand.id} due to missing start_time")
                continue
                
            # Simple mapping logic
            task = Task(
                source_job_id=job.id,
                user_id=job.user_id,
                title=params.get("title", cand.description),
                start_time=start_time,
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
            # Handle JavaScript-style ISO strings with Z suffix
            # fromisoformat() doesn't like 'Z' or '.000Z', so normalize it
            if dt_str.endswith('Z'):
                dt_str = dt_str[:-1] + '+00:00'
            # Also handle milliseconds that fromisoformat might not parse
            if '.' in dt_str and '+' in dt_str:
                # Split on + to get the base and timezone
                base, tz = dt_str.rsplit('+', 1)
                # Remove milliseconds if present
                if '.' in base:
                    base = base.split('.')[0]
                dt_str = base + '+' + tz
            elif '.' in dt_str:
                # No timezone, just remove milliseconds
                dt_str = dt_str.split('.')[0]
            
            # Parse ISO string
            dt = datetime.fromisoformat(dt_str)
            
            # If offset-aware, convert to UTC and strip tzinfo (naive UTC)
            if dt.tzinfo is not None:
                dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
            
            return dt
        except Exception as e:
            print(f"DEBUG _parse_datetime failed for '{dt_str}': {e}")
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
            # Debug: log what we're receiving
            print(f"DEBUG update_candidate: received parameters = {update_data.parameters}")
            # Simple merge or replace? For simplicity, replace the dict or specific keys.
            # SQLAlchemy mutable dicts can be tricky; let's specific replace for now.
            candidate.parameters = update_data.parameters
            print(f"DEBUG update_candidate: after set, candidate.parameters = {candidate.parameters}")
            
            # RECURSIVE CONFLICT DETECTION
            # If this is now a CREATE_TASK with a time, check if it conflicts (unless ignored)
            print(f"DEBUG update_candidate: checking command_type={candidate.command_type}")
            if candidate.command_type == "CREATE_TASK" and not update_data.ignore_conflicts:
                start_time_str = candidate.parameters.get("start_time")
                end_time_str = candidate.parameters.get("end_time")
                print(f"DEBUG update_candidate: checking conflict for start={start_time_str}")
                
                if start_time_str:
                    new_start = self._parse_datetime(start_time_str)
                    new_end = self._parse_datetime(end_time_str)
                    
                    job = self.db.query(Job).filter(Job.id == candidate.job_id).first()
                    if job:
                        conflict_found = self._find_conflict(job.user_id, new_start, new_end)
                        if conflict_found:
                            print(f"DEBUG update_candidate: Found conflict with '{conflict_found.title}', transforming back to AMBIGUITY")
                            candidate.command_type = "AMBIGUITY"
                            candidate.description = f"Conflict: {candidate.parameters.get('title', 'New Task')}"
                            candidate.parameters = self._format_conflict_parameters(
                                candidate.parameters.get("title", "New Task"),
                                start_time_str,
                                end_time_str,
                                conflict_found
                            )
                        else:
                            print("DEBUG update_candidate: No conflict found, staying CREATE_TASK")
            
        self.db.commit()
        self.db.refresh(candidate)
        print(f"DEBUG update_candidate: returning candidate type={candidate.command_type}")
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

    def _normalize_aware_dt(self, dt: Optional[datetime]) -> Optional[datetime]:
        """Convert aware datetime to naive UTC, or return as is if already naive."""
        if dt is None:
            return None
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt

    def update_task(self, task_id: int, update_data: TaskUpdate) -> Task:
        task = self.db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise ValueError("Task not found")
        
        if update_data.title is not None:
            task.title = update_data.title
        if update_data.description is not None:
            task.description = update_data.description
            
        # Normalize incoming times to naive UTC
        upd_start = self._normalize_aware_dt(update_data.start_time)
        upd_end = self._normalize_aware_dt(update_data.end_time)
            
        new_start = upd_start if update_data.start_time is not None else task.start_time
        new_end = upd_end if update_data.end_time is not None else task.end_time
        
        # Check for conflicts with OTHER tasks (unless ignored)
        if not update_data.ignore_conflicts:
            existing_tasks = self.db.query(Task).filter(Task.user_id == task.user_id, Task.id != task.id).all()
            for existing in existing_tasks:
                if existing.start_time and new_start:
                    if self._times_overlap(new_start, new_end, existing.start_time, existing.end_time):
                        # Found a conflict!
                        conflict_info = {
                            "id": existing.id,
                            "title": existing.title,
                            "start_time": existing.start_time.isoformat() if existing.start_time else None,
                            "end_time": existing.end_time.isoformat() if existing.end_time else None
                        }
                        raise ValueError(f"CONFLICT:{json.dumps(conflict_info)}")

        if update_data.start_time is not None:
            task.start_time = upd_start
        if update_data.end_time is not None:
            task.end_time = upd_end
            
        self.db.commit()
        self.db.refresh(task)
        return task

    def delete_task(self, task_id: int):
        task = self.db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise ValueError("Task not found")
        self.db.delete(task)
        self.db.commit()
