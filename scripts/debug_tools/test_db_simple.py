from app.database import SessionLocal, init_db
from app.models import User

def test_db():
    print("Testing DB connection...")
    try:
        init_db()
        db = SessionLocal()
        user_count = db.query(User).count()
        print(f"Connection successful. User count: {user_count}")
        db.close()
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    test_db()
