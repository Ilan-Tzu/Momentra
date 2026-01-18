import requests
from datetime import datetime
import sys

BASE_URL = "http://127.0.0.1:8000/api/v1"

def test_task_management():
    # Login first to get user context
    print("Logging in...")
    auth_resp = requests.post(f"{BASE_URL}/auth/login", json={"username": "testuser_auth", "password": "password123"})
    if auth_resp.status_code != 200:
        print("Login failed, create a user first via test_auth.py or UI")
        return
    
    user_id = auth_resp.json()['username']
    headers = {"X-User-Id": user_id}

    # 1. Create a dummy job/task to test with
    # Actually, simpler to assume a task exists or create one via accepting? 
    # Let's check getting tasks first.
    
    print("\nFetching Tasks...")
    start_date = "2024-01-01T00:00:00"
    end_date = "2030-01-01T00:00:00"
    tasks_resp = requests.get(f"{BASE_URL}/tasks?start_date={start_date}&end_date={end_date}", headers=headers)
    tasks = tasks_resp.json()
    
    task_id = None
    if not tasks:
        print("No tasks found. Cannot test Update/Delete.")
        # Try to use debug_db info or just fail
        return
    else:
        task_id = tasks[0]['id']
        print(f"Testing with Task ID: {task_id}")

    # 2. Update Task
    print("\nTesting Update Task...")
    update_payload = {"title": "Updated Title via Test"}
    update_resp = requests.patch(f"{BASE_URL}/tasks/{task_id}", json=update_payload, headers=headers)
    if update_resp.status_code == 200:
        print("Update Success!")
        print(update_resp.json())
    else:
        print(f"Update Failed: {update_resp.status_code} {update_resp.text}")

    # 3. Delete Task
    # Only uncomment if you really want to delete it, or maybe skip deletion to update for now
    # print("\nTesting Delete Task...")
    # del_resp = requests.delete(f"{BASE_URL}/tasks/{task_id}", headers=headers)
    # if del_resp.status_code == 204:
    #     print("Delete Success!")
    # else:
    #     print(f"Delete Failed: {del_resp.status_code}")

if __name__ == "__main__":
    test_task_management()
