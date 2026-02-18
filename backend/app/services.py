from sqlalchemy.orm import Session
from .models import Job, JobCandidate, Task, JobStatus, User
from .schemas import JobCreate, JobCandidateRead, JobCandidateUpdate, TaskUpdate
from .config import settings
import json
from datetime import datetime, timezone, timedelta
from typing import List, Optional

# =============================================================================
# TIMEZONE STRATEGY (Momentra Backend)
# =============================================================================
# RULE: Database & Backend ALWAYS run in UTC. No exceptions.
# 
# All datetimes stored in the database are NAIVE UTC (no tzinfo).
# 
# Key Methods:
# - _parse_datetime(str): Parses any ISO string → naive UTC datetime
# - _normalize_aware_dt(dt): Converts aware datetime → naive UTC
# 
# Incoming data from frontend should be UTC (with 'Z' suffix).
# Outgoing data to frontend is naive UTC (frontend appends 'Z').
# =============================================================================


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

    def _is_background_event(self, title: str) -> bool:
        """Determines if a task title suggests a background/logistics event (Airbnb, Hotel, etc.)"""
        # "Flight" is removed because it SHOULD be blocking (you can't do other things during a flight)
        background_keywords = ["airbnb", "hotel", "stay", "trip", "vacation", "rent", "check-in", "check-out"]
        t = title.lower()
        return any(kw in t for kw in background_keywords)

    def _get_preferences(self, user_id: int):
        from .models import UserPreferences
        prefs = self.db.query(UserPreferences).filter(UserPreferences.user_id == user_id).first()
        if not prefs:
            return {
                "buffer_minutes": 15,
                "work_start_hour": 8,
                "work_end_hour": 22,
                "default_duration_minutes": 60,
                "ai_temperature": 0.0,
                "personal_context": None
            }
        return prefs

    def parse_job(self, job_id: int, user_id: int) -> int:
        job = self.db.query(Job).filter(Job.id == job_id, Job.user_id == user_id).first()
        if not job:
            raise ValueError("Job not found")

        # Fetch user preferences
        prefs = self._get_preferences(user_id)
        # Handle both dict (if default) and SQLAlchemy model
        ai_temp = getattr(prefs, 'ai_temperature', 0.0) if hasattr(prefs, 'ai_temperature') else prefs.get('ai_temperature', 0.0)
        p_context = getattr(prefs, 'personal_context', None) if hasattr(prefs, 'personal_context') else prefs.get('personal_context', None)

        # Parse text using the new adapter structure with user's timezone context AND preferences
        result = self.llm.parse_text(
            job.raw_text, 
            user_local_time=job.user_local_time,
            ai_temperature=ai_temp,
            personal_context=p_context,
            user_id=job.user_id
        )
        
        # DEBUG: Log the raw result to understand why ambiguities are persisting
        try:
            with open("llm_debug.log", "a") as f:
                f.write(f"\n\n--- PARSE JOB {job_id} ---\n")
                f.write(json.dumps(result, indent=2))
                f.write("\n------------------------\n")
        except: pass
        
        # Clear existing candidates 
        self.db.query(JobCandidate).filter(JobCandidate.job_id == job_id).delete()

        candidates = []
        provisionally_accepted = [] # List of {start, end, is_blocking, cand_obj}
        
        # Get existing user tasks for conflict detection
        existing_tasks = self.db.query(Task).filter(Task.user_id == job.user_id).all()
        
        # Process Tasks
        for task in result.get("tasks", []):
            new_start = self._parse_datetime(task.get("start_time"))
            new_end = self._parse_datetime(task.get("end_time"))

            # Apply default duration if end_time is missing AND start_time is present
            if new_start and not new_end:
                # Use default duration from preferences
                default_duration_min = getattr(prefs, 'default_duration_minutes', 60) if hasattr(prefs, 'default_duration_minutes') else prefs.get('default_duration_minutes', 60)
                from datetime import timedelta
                new_end = new_start + timedelta(minutes=default_duration_min)
                # Update task dict for later candidates
                task['end_time'] = new_end.isoformat() + "Z"
            
            task_title = task.get("title", "New Task")
            is_background_cand = self._is_background_event(task_title)
            
            should_raise_conflict = False
            
            # --- BACKEND LOGIC SYSTEM: DETECT CONFLICTS ---
            # If AI identified it as a TASK (has start_time), check against DB
            if new_start:
                # 1. Check for conflicts with existing tasks (Database)
                conflict_found = self._find_conflict(job.user_id, new_start, new_end)
                
                # 2. Check for conflicts with previously processed candidates in this same job
                if not conflict_found:
                    for prev in provisionally_accepted:
                        if prev['is_blocking'] and self._times_overlap(new_start, new_end, prev['start'], prev['end']):
                            conflict_found = prev['cand_obj']
                            break

                # Check exclusion criteria (background events etc)
                is_conflict_bg = False
                if conflict_found:
                    if hasattr(conflict_found, 'is_blocking'):
                        is_conflict_bg = not conflict_found.is_blocking
                    else:
                        # It's a JobCandidate, check its description for background keywords
                        conflict_title = getattr(conflict_found, 'description', '')
                        is_conflict_bg = self._is_background_event(conflict_title)
                
                if conflict_found and not (is_background_cand or is_conflict_bg):
                     should_raise_conflict = True

            # If the Backend Logic System detects a conflict, override the candidate to AMBIGUITY
            if should_raise_conflict:
                candidate = JobCandidate(
                    job_id=job.id,
                    description=f"Conflict: {task_title}",
                    command_type="AMBIGUITY",
                    parameters=self._format_conflict_parameters(
                        task_title,
                        task.get("start_time"),
                        new_end.isoformat() + "Z" if new_end else None,
                        conflict_found,
                        user_id=job.user_id,
                        provisionally_accepted=provisionally_accepted
                    ),
                    confidence=0.0
                )
            else:
                # No conflict OR background event - but check if time is missing
                if not task.get("start_time"):
                    candidate = JobCandidate(
                        job_id=job.id,
                        description=f"Ambiguity: Missing time for '{task_title}'",
                        command_type="AMBIGUITY",
                        parameters={
                            "type": "missing_time",
                            "message": f"What time is '{task_title}'?",
                            "options": [] 
                        },
                        confidence=0.0
                    )
                else:
                    # Valid task candidate
                    candidate = JobCandidate(
                        job_id=job.id,
                        description=task_title,
                        command_type="CREATE_TASK",
                        parameters={
                            "title": task_title,
                            "start_time": task.get("start_time"),
                            "end_time": new_end.isoformat() + "Z" if new_end else None, # Use calculated end time
                            "description": task.get("description")
                        },
                        confidence=float(task.get("confidence", 0.0))
                    )
                    # Track this as a provisionally accepted range for internal conflict detection
                    provisionally_accepted.append({
                        'start': new_start,
                        'end': new_end,
                        'is_blocking': not is_background_cand,
                        'cand_obj': candidate
                    })
            
            self.db.add(candidate)
            self.db.flush() # Ensure candidate has an ID for conflict parameters if needed later
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
        start1 = self._normalize_aware_dt(start1)
        end1 = self._normalize_aware_dt(end1)
        start2 = self._normalize_aware_dt(start2)
        end2 = self._normalize_aware_dt(end2)
        
        # If end times are not set or equal to start, assume 30 min duration
        if not end1 or (start1 and end1 <= start1):
            end1 = start1 + timedelta(minutes=30)
        if not end2 or (start2 and end2 <= start2):
            end2 = start2 + timedelta(minutes=30)
        
        if not start1 or not start2:
            return False
        
        # Overlap exists if one interval starts before the other ends (and vice versa)
        return (start1 < end2 and start2 < end1)

    def _find_conflict(self, user_id: int, start_time: datetime, end_time: datetime) -> Optional[Task]:
        """Find an overlapping BLOCKING task for the user."""
        if not start_time:
            return None
        
        # Get existing user tasks that are BLOCKING
        existing_tasks = self.db.query(Task).filter(
            Task.user_id == user_id, 
            Task.is_blocking == True
        ).all()
        
        for existing in existing_tasks:
            if existing.start_time:
                if self._times_overlap(start_time, end_time, existing.start_time, existing.end_time):
                    return existing
        return None

    def _round_to_boundary(self, dt: datetime, interval_min: int = 15) -> datetime:
        """Round to nearest interval boundary for cleaner suggestions."""
        total_min = dt.hour * 60 + dt.minute
        rem = total_min % interval_min
        if rem == 0:
            return dt.replace(second=0, microsecond=0)
        
        # Always round forward unless very close to previous
        if rem < 5: 
             rounded = total_min - rem
        else:
             rounded = total_min + (interval_min - rem)
             
        return dt.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(minutes=rounded)

    def _find_nearest_available_slot(
        self, 
        user_id: int, 
        conflict_start: datetime, 
        event_duration_minutes: int,
        buffer_minutes: int = 15,
        provisionally_accepted: list = None,
        work_start_hour: int = 8,
        work_end_hour: int = 22
    ) -> Optional[dict]:
        from datetime import timedelta
        
        if not conflict_start:
            return None
            
        day_start = conflict_start.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        
        # Busy slots (Blocking Tasks)
        existing_tasks = self.db.query(Task).filter(
            Task.user_id == user_id,
            Task.is_blocking == True,
            Task.start_time >= day_start,
            Task.start_time < day_end
        ).all()
        
        busy_slots = []
        for task in existing_tasks:
            if task.start_time:
                end = task.end_time or (task.start_time + timedelta(minutes=30))
                busy_slots.append((task.start_time, end))
        
        if provisionally_accepted:
             for prev in provisionally_accepted:
                if prev.get('is_blocking') and prev.get('start') and prev.get('end'):
                    busy_slots.append((prev['start'], prev['end']))
        
        busy_slots.sort(key=lambda x: x[0])
        
        # Merge overlaps in busy_slots
        if not busy_slots:
            merged = []
        else:
            merged = [busy_slots[0]]
            for current in busy_slots[1:]:
                prev_start, prev_end = merged[-1]
                if current[0] < prev_end:
                    merged[-1] = (prev_start, max(prev_end, current[1]))
                else:
                    merged.append(current)
        
        # Candidate search points
        search_points = set()
        search_points.add(self._round_to_boundary(conflict_start))
        search_points.add(self._round_to_boundary(conflict_start + timedelta(minutes=15)))
        
        for _, end in merged:
            search_points.add(self._round_to_boundary(end + timedelta(minutes=buffer_minutes)))
        
        work_start = conflict_start.replace(hour=work_start_hour, minute=0, second=0, microsecond=0)
        work_end = conflict_start.replace(hour=work_end_hour, minute=0, second=0, microsecond=0)
        if work_end_hour < work_start_hour: work_end += timedelta(days=1)
        search_points.add(work_start)

        valid_suggestions = []
        duration = timedelta(minutes=event_duration_minutes)
        buffer = timedelta(minutes=buffer_minutes)

        for start_c in search_points:
            if start_c < day_start or start_c + duration > day_end:
                continue
                
            end_c = start_c + duration
            has_conflict = False
            for b_start, b_end in merged:
                if self._times_overlap(start_c, end_c, b_start - buffer, b_end + buffer):
                    has_conflict = True
                    break
            
            if not has_conflict:
                valid_suggestions.append(start_c)

        if not valid_suggestions:
            return None
            
        def score_slot(s):
            diff = (s - conflict_start).total_seconds() / 60
            dist = abs(diff)
            penalty = 0
            if diff < 0: penalty += 500
            if s < work_start or s + duration > work_end: penalty += 200
            return dist + penalty
            
        valid_suggestions.sort(key=score_slot)
        best_start = valid_suggestions[0]
        
        return {
            "start_time": best_start.isoformat() + "Z",
            "end_time": (best_start + duration).isoformat() + "Z"
        }

    def _format_conflict_parameters(self, title, start_time, end_time, conflict_obj, user_id: int = None, provisionally_accepted: list = None):
        """Standardize the conflict ambiguity parameters. Works for Tasks or Candidates."""
        from datetime import timedelta
        
        # Detect if it's a Task (model) or something else
        if hasattr(conflict_obj, 'title'):
            # It's a Task
            existing_title = conflict_obj.title
            existing_start_iso = conflict_obj.start_time.isoformat() + "Z" if conflict_obj.start_time else None
            existing_end = conflict_obj.end_time
            remove_id_key = "remove_task_id"
            remove_id_val = conflict_obj.id
        else:
            # It's likely a JobCandidate model or dict
            if hasattr(conflict_obj, 'description'):
                existing_title = conflict_obj.description
            elif isinstance(conflict_obj, dict):
                existing_title = conflict_obj.get('title', 'Existing Event')
            else:
                existing_title = 'Existing Event'

            params = {}
            if hasattr(conflict_obj, 'parameters'):
                params = conflict_obj.parameters
            elif isinstance(conflict_obj, dict):
                params = conflict_obj.get('parameters', {})
            
            existing_start_iso = params.get('start_time') if params else None
            existing_end = self._parse_datetime(params.get('end_time')) if params else None
            remove_id_key = "remove_candidate_id"
            remove_id_val = getattr(conflict_obj, 'id', None) or (conflict_obj.get('id') if isinstance(conflict_obj, dict) else None)

        # Fetch preferences if user_id is available
        prefs = None
        buffer_min = 15
        default_dur = 60
        w_start = 8
        w_end = 22
        
        if user_id:
            prefs = self._get_preferences(user_id)
            # Use getattr/get based on object type (SQLAlchemy Model vs dict)
            if isinstance(prefs, dict):
                 buffer_min = prefs.get('buffer_minutes', 15)
                 default_dur = prefs.get('default_duration_minutes', 60)
                 w_start = prefs.get('work_start_hour', 8)
                 w_end = prefs.get('work_end_hour', 22)
            else:
                 buffer_min = getattr(prefs, 'buffer_minutes', 15)
                 default_dur = getattr(prefs, 'default_duration_minutes', 60)
                 w_start = getattr(prefs, 'work_start_hour', 8)
                 w_end = getattr(prefs, 'work_end_hour', 22)

        # Calculate event duration for smart suggestion
        new_start_dt = self._parse_datetime(start_time)
        new_end_dt = self._parse_datetime(end_time)
        
        if new_start_dt and new_end_dt:
            event_duration = int((new_end_dt - new_start_dt).total_seconds() / 60)
        else:
            event_duration = default_dur  # Use preference
            
        # Ensure end_time is set if missing, using calculated duration
        if new_start_dt and not new_end_dt:
            new_end_dt = new_start_dt + timedelta(minutes=event_duration)
            end_time = new_end_dt.isoformat() + "Z"

        # Build options list
        options = []
        
        # Try to find a smart suggestion
        if user_id and new_start_dt:
            suggested_slot = self._find_nearest_available_slot(
                user_id=user_id,
                conflict_start=new_start_dt,
                event_duration_minutes=event_duration,
                buffer_minutes=buffer_min,
                provisionally_accepted=provisionally_accepted,
                work_start_hour=w_start,
                work_end_hour=w_end
            )
            
            if suggested_slot:
                options.append({
                    "label": "Suggested time", 
                    "value": json.dumps({
                        "title": title,
                        "start_time": suggested_slot["start_time"],
                        "end_time": suggested_slot["end_time"],
                        "suggested": True
                    }),
                    "suggested": True,
                    "display_time": suggested_slot["start_time"],
                    "end_time": suggested_slot["end_time"]
                })

        # Standard options (Now using guaranteed end_time)
        options.extend([
            {"label": f"Keep '{title}' (replace)", "value": json.dumps({
                "title": title,
                "start_time": start_time,
                "end_time": end_time,
                remove_id_key: remove_id_val
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
        ])

        # Format readable time for the conflict
        existing_end_iso = existing_end.isoformat() + "Z" if existing_end else None

        return {
            "type": "conflict",
            "title": title,
            "existing_title": existing_title,
            "existing_start_time": existing_start_iso,
            "existing_end_time": existing_end_iso, # PASS END TIME
            "start_time": start_time,
            "end_time": end_time,
            "message": f"'{title}' conflicts with '{existing_title}' ({existing_start_iso} - {existing_end_iso or '?'}). What would you like to do?",
            "options": options
        }

    def get_job_details(self, job_id: int, user_id: int) -> Optional[Job]:
        return self.db.query(Job).filter(Job.id == job_id, Job.user_id == user_id).first()

    def accept_candidates(self, job_id: int, selected_ids: List[int], user_id: int, ignore_conflicts: bool = False) -> List[Task]:
        job = self.db.query(Job).filter(Job.id == job_id, Job.user_id == user_id).first()
        if not job:
            raise ValueError("Job not found")

        # Fetch selected candidates
        candidates = self.db.query(JobCandidate).filter(
            JobCandidate.id.in_(selected_ids),
            JobCandidate.job_id == job_id
        ).all()

        created_tasks = []
        issues_encountered = False

        # Maintain a list of tasks created in THIS batch to check against
        batch_tasks = []

        for cand in candidates:
            if cand.command_type != "CREATE_TASK":
                continue
                
            params = cand.parameters
            if isinstance(params, str):
                try:
                    params = json.loads(params)
                except:
                    params = {}
            
            start_time = self._parse_datetime(params.get("start_time"))
            if not start_time:
                continue
                
            end_time = self._parse_datetime(params.get("end_time"))
            
            # Ensure end_time exists; fallback to preference if missing
            if not end_time:
                prefs = self._get_preferences(user_id)
                default_dur = getattr(prefs, 'default_duration_minutes', 60) if not isinstance(prefs, dict) else prefs.get('default_duration_minutes', 60)
                end_time = start_time + timedelta(minutes=default_dur)
                
            task_title = params.get("title", cand.description)

            # --- CONFLICT CHECK ---
            conflict_found = None
            if not ignore_conflicts:
                # 1. Check DB
                conflict_found = self._find_conflict(user_id, start_time, end_time)
                
                # 2. Check previously created tasks in this batch
                if not conflict_found:
                    for batch_task in batch_tasks:
                         if batch_task['is_blocking'] and self._times_overlap(start_time, end_time, batch_task['start'], batch_task['end']):
                            conflict_found = batch_task['obj'] # Just need truthy object
                            break

            if conflict_found:
                # Update Candidate to Ambiguity
                cand.command_type = "AMBIGUITY"
                cand.description = f"Conflict: {task_title}"
                cand.parameters = self._format_conflict_parameters(
                    task_title,
                    params.get("start_time"),
                    params.get("end_time"),
                    conflict_found,
                    user_id=user_id
                )
                self.db.add(cand)
                issues_encountered = True
                continue
            
            # Simple mapping logic
            is_blocking = not self._is_background_event(task_title)
            
            task = Task(
                source_job_id=job.id,
                user_id=job.user_id,
                title=task_title,
                start_time=start_time,
                end_time=end_time,
                description=params.get("description", ""),
                is_blocking=is_blocking
            )
            self.db.add(task)
            self.db.flush() # Get ID
            created_tasks.append(task)
            batch_tasks.append({
                'start': start_time,
                'end': end_time,
                'is_blocking': is_blocking,
                'obj': task
            })
            
            # Clean up used candidate
            self.db.delete(cand)

        # NEW: Check REMAINING candidates for conflicts with the tasks we just created
        # Logic: If I just accepted "Lunch at 1PM", and there's a pending candidate "Meeting at 1PM"
        # that wasn't selected yet (or user accepted one by one), that pending candidate must now become a conflict.
        
        if created_tasks:
            # --- SYSTEM B LOGIC: POST-ACCEPTANCE CONFLICT DETECTION ---
            # Now that a task is firmly in the DB, check if any PENDING candidates conflict with it.
            # If so, convert them to AMBIGUITY immediately.
            
            # Check REMAINING candidates for conflicts
            self.db.flush() # Ensure deletes are processed so we don't fetch deleted candidates
            
            remaining_candidates = self.db.query(JobCandidate).filter(
                JobCandidate.job_id == job_id,
                JobCandidate.command_type == "CREATE_TASK" 
            ).all()
            
            print(f"DEBUG: Checking {len(remaining_candidates)} remaining candidates for conflicts against {len(created_tasks)} new tasks")

            for rem_cand in remaining_candidates:
                # Parse params
                rem_params = rem_cand.parameters
                # Handle potential SQLAlchemy dict vs str
                if isinstance(rem_params, str):
                    try: rem_params = json.loads(rem_params)
                    except: continue
                elif not isinstance(rem_params, dict):
                    continue

                rem_start = self._parse_datetime(rem_params.get("start_time"))
                rem_end = self._parse_datetime(rem_params.get("end_time"))

                if not rem_start: 
                    continue
                
                # Check against tasks created in this batch
                conflict_obj = None
                for new_task in created_tasks:
                     # Ensure we are comparing simple dates
                     if new_task.is_blocking and self._times_overlap(rem_start, rem_end, new_task.start_time, new_task.end_time):
                        conflict_obj = new_task
                        break
                
                if conflict_obj:
                    print(f"DEBUG: Found conflict! Candidate {rem_cand.id} overlaps with New Task {conflict_obj.id}")
                    # Transform to AMBIGUITY
                    rem_cand.command_type = "AMBIGUITY"
                    rem_cand.description = f"Conflict: {rem_params.get('title', 'Event')}"
                    rem_cand.parameters = self._format_conflict_parameters(
                        rem_params.get("title", "Event"),
                        rem_params.get("start_time"),
                        rem_params.get("end_time"),
                        conflict_obj,
                        user_id=user_id
                    )
                    self.db.add(rem_cand)
                    issues_encountered = True

        
        # Determine Job Status
        # If we have any remaining candidates for this job (including the ones we just turned to ambiguity), stay PARSED
        count_remaining = self.db.query(JobCandidate).filter(JobCandidate.job_id == job_id).count()
        if count_remaining > 0:
            job.status = JobStatus.PARSED
        else:
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

    def update_candidate(self, candidate_id: int, update_data: JobCandidateUpdate, user_id: int) -> JobCandidate:
        candidate = self.db.query(JobCandidate).join(Job).filter(
            JobCandidate.id == candidate_id,
            Job.user_id == user_id
        ).first()
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
                        
                        # Also check other candidates for the same job
                        if not conflict_found:
                            other_cands = self.db.query(JobCandidate).filter(
                                JobCandidate.job_id == candidate.job_id,
                                JobCandidate.id != candidate.id,
                                JobCandidate.command_type == "CREATE_TASK"
                            ).all()
                            for oc in other_cands:
                                oc_params = oc.parameters
                                if isinstance(oc_params, str):
                                    try: oc_params = json.loads(oc_params)
                                    except: continue
                                oc_start = self._parse_datetime(oc_params.get('start_time'))
                                if oc_start:
                                    oc_end = self._parse_datetime(oc_params.get('end_time'))
                                    if not oc_end:
                                        oc_end = oc_start + timedelta(minutes=60)
                                    if self._times_overlap(new_start, new_end, oc_start, oc_end):
                                        conflict_found = oc
                                        break

                        if conflict_found:
                            print(f"DEBUG update_candidate: Found conflict, transforming back to AMBIGUITY")
                            candidate.command_type = "AMBIGUITY"
                            candidate.description = f"Conflict: {candidate.parameters.get('title', 'New Task')}"
                            candidate.parameters = self._format_conflict_parameters(
                                candidate.parameters.get("title", "New Task"),
                                start_time_str,
                                end_time_str,
                                conflict_found,
                                user_id=job.user_id
                            )
                        else:
                            print("DEBUG update_candidate: No conflict found, staying CREATE_TASK")
            
        self.db.commit()
        self.db.refresh(candidate)
        print(f"DEBUG update_candidate: returning candidate type={candidate.command_type}")
        return candidate

    def delete_candidate(self, candidate_id: int, user_id: int):
        candidate = self.db.query(JobCandidate).join(Job).filter(
            JobCandidate.id == candidate_id,
            Job.user_id == user_id
        ).first()
        if not candidate:
            raise ValueError("Candidate not found")
        self.db.delete(candidate)
        self.db.commit()

    def cleanup_old_tasks(self, user_id: int):
        """Delete tasks older than 3 days to match frontend view window."""
        try:
            cutoff = datetime.utcnow() - timedelta(days=3)
            deleted = self.db.query(Task).filter(
                Task.user_id == user_id,
                Task.start_time < cutoff
            ).delete(synchronize_session=False)
            if deleted > 0:
                self.db.commit()
                print(f"DEBUG: Cleaned up {deleted} old tasks for user {user_id}")
        except Exception as e:
            self.db.rollback()
            print(f"ERROR cleanup_old_tasks: {e}")

    def get_tasks(self, start: Optional[datetime], end: Optional[datetime], user_id: int) -> List[Task]:
        """Fetch tasks for a user within an optional time range."""
        # Periodic cleanup triggered on fetch
        self.cleanup_old_tasks(user_id)
        
        query = self.db.query(Task).filter(Task.user_id == user_id)
        
        if start:
            # Task must end after the start of range
            query = query.filter(Task.end_time >= start)
        if end:
            # Task must start before the end of range
            query = query.filter(Task.start_time <= end)
            
        return query.order_by(Task.start_time.asc()).all()

    def _normalize_aware_dt(self, dt: Optional[datetime]) -> Optional[datetime]:
        """Convert aware datetime to naive UTC, or return as is if already naive."""
        if dt is None:
            return None
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt

    def update_task(self, task_id: int, update_data: TaskUpdate, user_id: int) -> Task:
        task = self.db.query(Task).filter(Task.id == task_id, Task.user_id == user_id).first()
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
                        # Found a conflict!
                        # Calculate available slot suggestion
                        suggestion = None
                        if new_start and new_end:
                            duration = int((new_end - new_start).total_seconds() / 60)
                            # Get preferences for buffers if possible (defaulting here for now as in _format_conflict_parameters)
                            # You can fetch proper prefs if needed, but defaults are safe
                            suggestion = self._find_nearest_available_slot(
                                user_id=task.user_id,
                                conflict_start=new_start,
                                event_duration_minutes=duration,
                                buffer_minutes=15 # Default buffer
                            )

                        conflict_info = {
                            "id": existing.id,
                            "title": existing.title,
                            "start_time": existing.start_time.isoformat() if existing.start_time else None,
                            "end_time": existing.end_time.isoformat() if existing.end_time else None,
                            "suggestion": suggestion
                        }
                        raise ValueError(f"CONFLICT:{json.dumps(conflict_info)}")

        if update_data.start_time is not None:
            task.start_time = upd_start
        if update_data.end_time is not None:
            task.end_time = upd_end
            
        self.db.commit()
        self.db.refresh(task)
        return task

    def delete_task(self, task_id: int, user_id: int):
        task = self.db.query(Task).filter(Task.id == task_id, Task.user_id == user_id).first()
        if not task:
            raise ValueError("Task not found")
        self.db.delete(task)
        self.db.commit()
