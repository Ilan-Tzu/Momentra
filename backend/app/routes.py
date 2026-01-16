from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from . import schemas, services
from .database import get_db

router = APIRouter()

@router.post("/jobs", response_model=schemas.JobRead)
def create_job(job: schemas.JobCreate, db: Session = Depends(get_db)):
    service = services.JobService(db)
    return service.create_job(job)

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
