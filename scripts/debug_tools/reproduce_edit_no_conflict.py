import requests
import json
import time

BASE_URL = "http://localhost:8000/api/v1"
HEADERS = {"X-User-Id": "test_user_edit_bug"}

def create_task(title, start_time, end_time):
    res = requests.post(f"{BASE_URL}/jobs", json={"raw_text": f"{title} from {start_time} to {end_time}"}, headers=HEADERS)
    if res.status_code != 200:
        return None
    job_id = res.json()['id']
    requests.post(f"{BASE_URL}/jobs/{job_id}/parse", headers=HEADERS)
    
    for _ in range(10):
        time.sleep(1.0)
        job = requests.get(f"{BASE_URL}/jobs/{job_id}", headers=HEADERS).json()
        if job.get('candidates'):
            cand = job['candidates'][0]
            requests.post(f"{BASE_URL}/jobs/{job_id}/accept", json={'selected_candidate_ids': [cand['id']]}, headers=HEADERS)
            break
            
    tasks = requests.get(f"{BASE_URL}/tasks?start_date=2026-01-01T00:00:00&end_date=2027-01-01T00:00:00", headers=HEADERS).json()
    for t in tasks:
        if t['title'] == title:
            return t
    return None

def test_edit_no_conflict():
    print("\n--- Testing Edit With No Conflict ---")
    ts = int(time.time())
    
    # 1. Create Task A: 10:00 - 11:00
    t1 = create_task(f"TaskA_{ts}", "2026-02-01T10:00", "2026-02-01T11:00")
    if not t1:
        print("Failed to create task")
        return

    print(f"Created Task A ({t1['id']}): {t1['start_time']} -> {t1['end_time']}")

    # 2. Edit Task A to 12:00 (Send ONLY start_time, mimicking frontend)
    print(f"Moving Task A to 12:00 (Sending only start_time)...")
    res = requests.patch(f"{BASE_URL}/tasks/{t1['id']}", json={"start_time": "2026-02-01T12:00:00"}, headers=HEADERS)
    
    print(f"Status: {res.status_code}")
    if res.status_code == 409:
        print(f"FAIL: Got Conflict! Detail: {res.json()['detail']}")
    elif res.status_code == 200:
        updated = res.json()
        print(f"SUCCESS: Updated to {updated['start_time']} -> {updated['end_time']}")
        # Check if duration was auto-corrected to 1h
        # 12:00 to 13:00?
    else:
        print(f"FAIL: Unexpected status {res.status_code}: {res.text}")

if __name__ == "__main__":
    test_edit_no_conflict()
