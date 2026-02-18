import requests
import json
import time

BASE_URL = "http://localhost:8000/api/v1"
HEADERS = {"X-User-Id": "test_user_gap_conflict"}

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
            
    tasks = requests.get(f"{BASE_URL}/tasks?start_date=2026-03-01T00:00:00&end_date=2026-03-02T00:00:00", headers=HEADERS).json()
    for t in tasks:
        if t['title'] == title:
            return t
    return None

def test_gap_conflict():
    print("\n--- Testing Gap Conflict (15:30 vs 17:00) ---")
    ts = int(time.time())
    
    # 1. Create Obstacle Task: 17:00 - 18:00
    t_obstacle = create_task(f"Obstacle_{ts}", "2026-03-01T17:00", "2026-03-01T18:00")
    print(f"Created Obstacle: {t_obstacle['start_time']} -> {t_obstacle['end_time']}")

    # 2. Create Subject Task: 12:00 - 13:00 (1h duration)
    t_subject = create_task(f"Subject_{ts}", "2026-03-01T12:00", "2026-03-01T13:00")
    print(f"Created Subject: {t_subject['start_time']} -> {t_subject['end_time']}")
    
    # 3. Move Subject to 15:30 (Implicitly 16:30 end)
    # We explicitly send end_time to match frontend logic
    # Duration 1h: 15:30 -> 16:30
    print("Test 1: Move to 15:30 (1h duration -> 16:30)...")
    res = requests.patch(f"{BASE_URL}/tasks/{t_subject['id']}", json={
        "start_time": "2026-03-01T15:30:00",
        "end_time": "2026-03-01T16:30:00"
    }, headers=HEADERS)
    
    if res.status_code == 200:
        print("PASS: 1h duration did not conflict.")
    elif res.status_code == 409:
        print(f"FAIL: 1h duration Triggered CONFLICT! {res.json()['detail']}")
    else:
        print(f"FAIL: Unexpected status {res.status_code}")

    # 4. Create Long Subject: 12:00 - 14:00 (2h duration)
    t_long = create_task(f"LongSubject_{ts}", "2026-03-01T12:00", "2026-03-01T14:00")
    
    # 5. Move Long Subject to 15:30 (Implicitly 17:30 end)
    print("Test 2: Move Long Task to 15:30 (2h duration -> 17:30)...")
    res = requests.patch(f"{BASE_URL}/tasks/{t_long['id']}", json={
        "start_time": "2026-03-01T15:30:00",
        "end_time": "2026-03-01T17:30:00"
    }, headers=HEADERS)
    
    if res.status_code == 409:
        print("PASS: 2h duration Correctly Triggered Conflict.")
    elif res.status_code == 200:
        print("FAIL: 2h duration overlapped but Allowed?!")
    else:
        print(f"FAIL: Unexpected status {res.status_code}")

if __name__ == "__main__":
    test_gap_conflict()
