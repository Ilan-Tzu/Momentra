
import pytest
from datetime import datetime, timedelta
from app.services import JobService
from app.models import Task, Job, JobStatus, JobCandidate
from app.schemas import JobCreate, JobCandidateUpdate

def test_non_blocking_attribute(db_session):
    service = JobService(db_session)
    user = service.create_user("test_blocking_user", "password")
    user_id = user.id

    # 1. Create an Airbnb Task (Should be Non-Blocking)
    job = service.create_job(JobCreate(raw_text="Airbnb stay"), user_id)
    # Mock parsing by manually creating candidate
    cand = JobCandidate(
        job_id=job.id,
        description="Airbnb",
        command_type="CREATE_TASK",
        parameters={
            "title": "Airbnb Stay",
            "start_time": "2026-06-01T12:00:00Z",
            "end_time": "2026-06-05T12:00:00Z"
        }
    )
    db_session.add(cand)
    db_session.commit()
    
    tasks = service.accept_candidates(job.id, [cand.id], user_id)
    airbnb_task = tasks[0]
    
    assert airbnb_task.is_blocking is False
    print("\n[PASS] Airbnb task created as is_blocking=False")

    # 2. Create a Dinner Task overlapping overlap Airbnb (Should NOT conflict)
    # Dinner is normally blocking, but Airbnb is non-blocking, so no conflict should be found
    conflict = service._find_conflict(user_id, 
                                      datetime(2026, 6, 2, 18, 0), 
                                      datetime(2026, 6, 2, 20, 0))
    
    assert conflict is None
    print("[PASS] Dinner does not conflict with Airbnb")
    
    # 3. Create a Flight Task (Should be Blocking)
    job2 = service.create_job(JobCreate(raw_text="Flight to Paris"), user_id)
    cand2 = JobCandidate(
        job_id=job2.id,
        description="Flight",
        command_type="CREATE_TASK",
        parameters={
            "title": "Flight to Paris",
            "start_time": "2026-07-01T10:00:00Z",
            "end_time": "2026-07-01T14:00:00Z"
        }
    )
    db_session.add(cand2)
    db_session.commit()
    
    tasks2 = service.accept_candidates(job2.id, [cand2.id], user_id)
    flight_task = tasks2[0]
    
    assert flight_task.is_blocking is True
    print("[PASS] Flight task created as is_blocking=True")
    
    # 4. Create a Meeting overlapping Flight (Should CONFLICT)
    # Both are blocking
    conflict2 = service._find_conflict(user_id, 
                                       datetime(2026, 7, 1, 11, 0), 
                                       datetime(2026, 7, 1, 12, 0))
    
    assert conflict2 is not None
    assert conflict2.id == flight_task.id
    print("[PASS] Meeting correctly conflicts with Flight")

    # 5. Create a Dinner overlapping Airbnb (actually create the task to test _find_conflict against it later)
    # Let's create the dinner task
    dinner_start = datetime(2026, 6, 2, 18, 0)
    dinner_end = datetime(2026, 6, 2, 20, 0)
    dinner_task = Task(
        user_id=user_id,
        title="Dinner",
        start_time=dinner_start,
        end_time=dinner_end,
        is_blocking=True 
    )
    db_session.add(dinner_task)
    db_session.commit()
    
    # Now check if a NEW task conflicts with Dinner (blocking) but still ignores Airbnb (non-blocking)
    # Overlapping both
    conflict3 = service._find_conflict(user_id,
                                       datetime(2026, 6, 2, 19, 0), 
                                       datetime(2026, 6, 2, 19, 30))
    
    assert conflict3 is not None
    assert conflict3.id == dinner_task.id
    assert conflict3.id != airbnb_task.id
    print("[PASS] New task conflicts with Dinner, ignoring the encompassing Airbnb")

