from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File, Request, status
from sqlalchemy.orm import Session
from typing import List, Optional
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
            "tasks_created": tasks,
            "remaining_candidates": job.candidates
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
def get_tasks(start: Optional[datetime] = None, end: Optional[datetime] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    service = services.JobService(db)
    return service.get_tasks(start, end, current_user.id)

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

# ==================== Admin Endpoints ====================

@router.get("/admin/stats")
def get_admin_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns aggregated analytics for the admin dashboard.
    """
    from sqlalchemy import func, distinct
    from datetime import timedelta
    from .models import TokenLog, Job, User, Task
    
    # 1. Total Cost & Requests
    total_stats = db.query(
        func.sum(TokenLog.cost_usd).label("total_cost"),
        func.count(TokenLog.id).label("total_requests"),
        func.avg(TokenLog.latency_ms).label("avg_latency")
    ).first()
    
    total_cost = total_stats.total_cost or 0.0
    total_requests = total_stats.total_requests or 0
    avg_latency = total_stats.avg_latency or 0.0
    
    # 2. Active Users (Users who created a job in last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    active_users = db.query(func.count(distinct(Job.user_id))).filter(
        Job.created_at >= thirty_days_ago
    ).scalar() or 0
    
    # 3. Job Conversion Funnel
    # Count jobs by status
    job_counts = db.query(
        Job.status, func.count(Job.id)
    ).group_by(Job.status).all()
    
    job_stats = {status.name: count for status, count in job_counts}
    total_jobs = sum(job_stats.values())
    accepted_jobs = job_stats.get("ACCEPTED", 0)
    conversion_rate = (accepted_jobs / total_jobs * 100) if total_jobs > 0 else 0.0
    
    # 4. Model Usage (Cost by Model)
    model_stats = db.query(
        TokenLog.model,
        func.sum(TokenLog.cost_usd).label("cost"),
        func.count(TokenLog.id).label("calls")
    ).group_by(TokenLog.model).all()
    
    model_usage = [
        {"model": m[0], "cost": round(m[1] or 0, 4), "calls": m[2]} 
        for m in model_stats
    ]
    
    # 5. Daily Stats (Last 14 days)
    daily_stats_query = db.query(
        func.date(TokenLog.timestamp).label("date"),
        func.sum(TokenLog.cost_usd).label("total_cost"),
        func.count(TokenLog.id).label("total_requests")
    ).filter(
        TokenLog.timestamp >= datetime.utcnow() - timedelta(days=14)
    ).group_by(
        func.date(TokenLog.timestamp)
    ).order_by(
        func.date(TokenLog.timestamp).desc()
    ).all()
    
    return {
        "overview": {
            "total_cost_usd": round(total_cost, 4),
            "total_requests": total_requests,
            "avg_latency_ms": round(avg_latency, 0),
            "active_users_30d": active_users,
            "conversion_rate": round(conversion_rate, 1),
            "total_jobs": total_jobs
        },
        "job_status_distribution": job_stats,
        "model_usage": model_usage,
        "daily_stats": [
            {
                "date": str(stat.date),
                "total_cost": round(stat.total_cost or 0, 4),
                "total_requests": stat.total_requests or 0
            }
            for stat in daily_stats_query
        ]
    }
