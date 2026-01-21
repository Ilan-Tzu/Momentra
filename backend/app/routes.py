from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File, Request, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from . import schemas, services
from .database import get_db
from .rate_limit import limiter
from .jwt_utils import create_access_token, create_refresh_token, verify_token
from .auth_dependencies import get_current_user
from .models import User
import shutil
import os
import tempfile

router = APIRouter()

@router.post("/auth/register", response_model=schemas.Token)
@limiter.limit("10/minute")
def register_user(request: Request, user: schemas.UserCreate, db: Session = Depends(get_db)):
    service = services.JobService(db)
    try:
        new_user = service.create_user(user.username, user.password)
        
        # Generate JWT tokens
        access_token = create_access_token(data={"sub": str(new_user.id)})
        refresh_token = create_refresh_token(data={"sub": str(new_user.id)})
        
        return schemas.Token(
            access_token=access_token,
            refresh_token=refresh_token,
            user=schemas.UserRead(id=new_user.id, username=new_user.username)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/auth/login", response_model=schemas.Token)
@limiter.limit("10/minute")
def login(request: Request, user_login: schemas.UserLogin, db: Session = Depends(get_db)):
    user = services.JobService(db).authenticate_user(user_login.username, user_login.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Generate JWT tokens
    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})
    
    return schemas.Token(
        access_token=access_token,
        refresh_token=refresh_token,
        user=schemas.UserRead(id=user.id, username=user.username)
    )

@router.post("/auth/google", response_model=schemas.Token)
@limiter.limit("10/minute")
def google_login(request: Request, auth_data: schemas.GoogleAuth, db: Session = Depends(get_db)):
    """Authenticate user via Google OAuth and return JWT tokens."""
    service = services.JobService(db)
    try:
        # Verify the Google token
        google_info = service.verify_google_token(auth_data.id_token)
        
        # Get or create user
        user = service.get_or_create_google_user(
            google_sub=google_info['sub'],
            email=google_info['email'],
            name=google_info.get('name')
        )
        
        # Generate JWT tokens
        access_token = create_access_token(data={"sub": str(user.id)})
        refresh_token = create_refresh_token(data={"sub": str(user.id)})
        
        return schemas.Token(
            access_token=access_token,
            refresh_token=refresh_token,
            user=schemas.UserRead(id=user.id, username=user.username)
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

@router.post("/auth/refresh", response_model=schemas.TokenResponse)
@limiter.limit("20/minute")
def refresh_token_endpoint(request: Request, token_data: schemas.TokenRefresh, db: Session = Depends(get_db)):
    """Refresh access token using a valid refresh token."""
    # Verify refresh token
    payload = verify_token(token_data.refresh_token, token_type="refresh")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    # Extract user ID
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    
    # Verify user still exists
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Generate new access token
    new_access_token = create_access_token(data={"sub": user_id})
    
    return schemas.TokenResponse(access_token=new_access_token)

@router.post("/transcribe")
@limiter.limit("20/minute")
async def transcribe_audio(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Create a temporary file to save the upload
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
        shutil.copyfileobj(file.file, temp_file)
        temp_path = temp_file.name
    
    try:
        service = services.JobService(db)
        text = service.llm.transcribe_audio(temp_path)
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.post("/jobs", response_model=schemas.JobRead)
def create_job(job: schemas.JobCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = services.JobService(db)
    return service.create_job(job, current_user.id)

@router.post("/jobs/{job_id}/parse", response_model=dict)
@limiter.limit("20/minute")
def parse_job(request: Request, job_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = services.JobService(db)
    try:
        count = service.parse_job(job_id, current_user.id)
        return {"candidates_count": count}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/jobs/{job_id}", response_model=schemas.JobWithCandidates)
def get_job(job_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = services.JobService(db)
    job = service.get_job_details(job_id, current_user.id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.post("/jobs/{job_id}/accept", response_model=schemas.JobExecuteResponse)
def accept_job(job_id: int, accept_req: schemas.JobAccept, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = services.JobService(db)
    try:
        tasks = service.accept_candidates(job_id, accept_req.selected_candidate_ids, current_user.id, ignore_conflicts=accept_req.ignore_conflicts)
        # Re-fetch job to get latest status
        job = service.get_job_details(job_id, current_user.id)
        return {
            "job_id": job.id,
            "status": job.status,
            "tasks_created": tasks
        }
    except ValueError as e:
        if "CONFLICT:" in str(e):
             import json
             detail_str = str(e).split("CONFLICT:", 1)[1]
             try:
                detail_obj = json.loads(detail_str)
                raise HTTPException(status_code=409, detail=detail_obj)
             except:
                raise HTTPException(status_code=409, detail=detail_str)
        raise HTTPException(status_code=404, detail=str(e))

@router.patch("/candidates/{candidate_id}", response_model=schemas.JobCandidateRead)
def update_candidate(candidate_id: int, candidate_update: schemas.JobCandidateUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = services.JobService(db)
    try:
        return service.update_candidate(candidate_id, candidate_update, current_user.id)
    except ValueError as e:
        if "CONFLICT:" in str(e):
             import json
             detail_str = str(e).split("CONFLICT:", 1)[1]
             try:
                detail_obj = json.loads(detail_str)
                raise HTTPException(status_code=409, detail=detail_obj)
             except:
                raise HTTPException(status_code=409, detail=detail_str)
        raise HTTPException(status_code=404, detail=str(e))

@router.delete("/candidates/{candidate_id}", status_code=204)
def delete_candidate(candidate_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = services.JobService(db)
    try:
        service.delete_candidate(candidate_id, current_user.id)
        return
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/tasks", response_model=List[schemas.TaskRead])
def get_tasks(start_date: datetime, end_date: datetime, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = services.JobService(db)
    return service.get_tasks(start_date, end_date, current_user.id)

@router.patch("/tasks/{task_id}", response_model=schemas.TaskRead)
def update_task(task_id: int, task_update: schemas.TaskUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = services.JobService(db)
    try:
        return service.update_task(task_id, task_update, current_user.id)
    except Exception as e:
        msg = str(e)
        # Check for conflict error
        if "CONFLICT:" in msg:
            import json
            try:
                # Extract JSON part after CONFLICT:
                json_str = msg.split("CONFLICT:", 1)[1]
                conflict_data = json.loads(json_str)
                raise HTTPException(status_code=409, detail=conflict_data)
            except Exception as parse_err:
                print(f"Failed to parse conflict data: {parse_err}")
                # If parsing fails, still return 409 but with raw message
                raise HTTPException(status_code=409, detail=msg)
        
        # Log unexpected errors
        print(f"ERROR in update_task: {e}")
        import traceback
        traceback.print_exc()
        
        if isinstance(e, ValueError):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = services.JobService(db)
    try:
        service.delete_task(task_id, current_user.id)
        return
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/preferences", response_model=schemas.UserPreferencesRead)
def get_preferences(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from .models import UserPreferences
    
    # Get or create preferences
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == current_user.id).first()
    if not prefs:
        prefs = UserPreferences(user_id=current_user.id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs

@router.patch("/preferences", response_model=schemas.UserPreferencesRead)
def update_preferences(
    prefs_update: schemas.UserPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from .models import UserPreferences
    
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == current_user.id).first()
    if not prefs:
        prefs = UserPreferences(user_id=current_user.id)
        db.add(prefs)
    
    #Update fields if provided
    if prefs_update.buffer_minutes is not None:
        prefs.buffer_minutes = prefs_update.buffer_minutes
    if prefs_update.work_start_hour is not None:
        prefs.work_start_hour = prefs_update.work_start_hour
    if prefs_update.work_end_hour is not None:
        prefs.work_end_hour = prefs_update.work_end_hour
    if prefs_update.default_duration_minutes is not None:
        prefs.default_duration_minutes = prefs_update.default_duration_minutes
    if prefs_update.ai_temperature is not None:
        prefs.ai_temperature = prefs_update.ai_temperature
    if prefs_update.personal_context is not None:
        prefs.personal_context = prefs_update.personal_context
    if prefs_update.first_day_of_week is not None:
        prefs.first_day_of_week = prefs_update.first_day_of_week
    if prefs_update.time_format_24h is not None:
        prefs.time_format_24h = prefs_update.time_format_24h
    
    db.commit()
    db.refresh(prefs)
    return prefs
