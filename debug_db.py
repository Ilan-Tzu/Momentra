from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app.models import Base, User, Task, Job, JobCandidate
import sys
import os

# Add backend directory to path so imports work
sys.path.append(os.path.join(os.getcwd(), 'backend'))

SQLALCHEMY_DATABASE_URL = "sqlite:///backend/sql_app.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def debug_db():
    print("--- Users ---")
    users = db.query(User).all()
    for u in users:
        print(f"ID: {u.id}, Name: {u.username}")

    print("\n--- Jobs ---")
    jobs = db.query(Job).all()
    for j in jobs:
        print(f"ID: {j.id}, UserID: {j.user_id}, Status: {j.status}, Text: {j.raw_text}")

    print("\n--- Candidates ---")
    candidates = db.query(JobCandidate).all()
    for c in candidates:
        print(f"ID: {c.id}, JobID: {c.job_id}, Type: {c.command_type}, Desc: {c.description}")

    print("\n--- Tasks ---")
    tasks = db.query(Task).all()
    for t in tasks:
        print(f"ID: {t.id}, UserID: {t.user_id}, Title: {t.title}, Start: {t.start_time}")

    if not users:
        print("\nWARNING: No users found. Login flow might be creating users in a different DB or transaction failed.")
    if not tasks:
        print("\nWARNING: No tasks found. Acceptance flow might be failing to save tasks.")

if __name__ == "__main__":
    debug_db()
