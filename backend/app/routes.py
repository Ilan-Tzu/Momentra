from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from . import schemas, services
from .database import get_db
import shutil
import os
import tempfile

router = APIRouter()

@router.post("/auth/register", response_model=schemas.UserRead)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    service = services.JobService(db)
    try:
        return service.create_user(user.username, user.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/auth/login", response_model=schemas.UserRead)
def login(user_login: schemas.UserLogin, db: Session = Depends(get_db)):
    user = services.JobService(db).authenticate_user(user_login.username, user_login.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return user

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...), db: Session = Depends(get_db)):
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
def create_job(job: schemas.JobCreate, db: Session = Depends(get_db), x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=400, detail="X-User-Id header required")
    service = services.JobService(db)
    user = service.get_or_create_user(x_user_id)
    return service.create_job(job, user.id)

@router.post("/jobs/{job_id}/parse", response_model=dict)
def parse_job(job_id: int, db: Session = Depends(get_db)):
    service = services.JobService(db)
    try:
        count = service.parse_job(job_id)
        return {"candidates_count": count}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/jobs/{job_id}", response_model=schemas.JobWithCandidates)
def get_job(job_id: int, db: Session = Depends(get_db)):
    service = services.JobService(db)
    job = service.get_job_details(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.post("/jobs/{job_id}/accept", response_model=schemas.JobExecuteResponse)
def accept_job(job_id: int, accept_req: schemas.JobAccept, db: Session = Depends(get_db)):
    service = services.JobService(db)
    try:
        tasks = service.accept_candidates(job_id, accept_req.selected_candidate_ids)
        # Re-fetch job to get latest status
        job = service.get_job_details(job_id)
        return {
            "job_id": job.id,
            "status": job.status,
            "tasks_created": tasks
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.patch("/candidates/{candidate_id}", response_model=schemas.JobCandidateRead)
def update_candidate(candidate_id: int, candidate_update: schemas.JobCandidateUpdate, db: Session = Depends(get_db)):
    service = services.JobService(db)
    try:
        return service.update_candidate(candidate_id, candidate_update)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.delete("/candidates/{candidate_id}", status_code=204)
def delete_candidate(candidate_id: int, db: Session = Depends(get_db)):
    service = services.JobService(db)
    try:
        service.delete_candidate(candidate_id)
        return
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/tasks", response_model=List[schemas.TaskRead])
def get_tasks(start_date: datetime, end_date: datetime, db: Session = Depends(get_db), x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=400, detail="X-User-Id header required")
    service = services.JobService(db)
    user = service.get_or_create_user(x_user_id)
    return service.get_tasks(start_date, end_date, user.id)

@router.patch("/tasks/{task_id}", response_model=schemas.TaskRead)
def update_task(task_id: int, task_update: schemas.TaskUpdate, db: Session = Depends(get_db)):
    service = services.JobService(db)
    try:
        return service.update_task(task_id, task_update)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    service = services.JobService(db)
    try:
        service.delete_task(task_id)
        return
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
