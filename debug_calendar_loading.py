import sys
import os
from datetime import datetime, timedelta

# Ensure we can import from backend
project_root = os.path.dirname(os.path.abspath(__file__))
backend_path = os.path.join(project_root, 'backend')
sys.path.append(backend_path)

from app.database import SessionLocal
from app.models import Task, User, JobCandidate
from app.services import JobService

def debug_sync():
    db = SessionLocal()
    try:
        print("--- [1] USERS IN DB ---")
        users = db.query(User).all()
        for u in users:
            print(f"User ID: {u.id}, Username: '{u.username}'")
        
        if not users:
            print("ERROR: No users found in DB.")
            return

        print("\n--- [2] ALL TASKS IN DB ---")
        tasks = db.query(Task).order_by(Task.id.desc()).all()
        if not tasks:
            print("No tasks found.")
        else:
            for t in tasks:
                print(f"Task ID: {t.id} | UserID: {t.user_id} | Title: '{t.title}'")
                print(f"    Start: {t.start_time} | End: {t.end_time}")
        
        print("\n--- [3] PENDING CANDIDATES (Drafts) ---")
        candidates = db.query(JobCandidate).all()
        for c in candidates:
             print(f"Cand ID: {c.id} | JobID: {c.job_id} | Desc: {c.description[:50]}... | Cmd: {c.command_type}")

        print("\n--- [4] SIMULATING CALENDAR FETCH ---")
        # Logic mimics App.jsx fetchCalendarTasks
        start_frontend = datetime.utcnow() - timedelta(days=2)
        end_frontend = datetime.utcnow() + timedelta(days=30)
        
        print(f"Fetching range: {start_frontend} to {end_frontend}")
        
        for u in users:
            print(f"\nChecking User: '{u.username}' (ID {u.id})")
            # This calls the actual service method used by the API
            service_tasks = JobService(db).get_tasks(start_frontend, end_frontend, u.id)
            print(f" -> Service returned {len(service_tasks)} tasks")
            
            for t in service_tasks:
                 print(f"    - Task '{t.title}' @ {t.start_time}")
                 # Simple visibility check
                 # Frontend displays if task date matches a day in the strip
                 if t.start_time:
                     print(f"      [Visible?] Backend Time: {t.start_time}")
                 else:
                     print("      [Warning] No start_time set!")

    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    debug_sync()
