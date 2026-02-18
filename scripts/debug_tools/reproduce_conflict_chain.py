import requests
import json
import time

BASE_URL = "http://localhost:8000/api/v1"
HEADERS = {"X-User-Id": "test_user_conflict"}

def create_task(title, start_time, end_time):
    # We can create via /jobs but that's async and messy.
    # Let's see if there is a direct task creation endpoint?
    # Inspecting routes... usually there isn't one exposed directly but we can use 'update_candidate' with CREATE_TASK logic?
    # Actually, let's just insert into DB purely for setup to save time, or use the job flow.
    # Job flow is safer integration test.
    res = requests.post(f"{BASE_URL}/jobs", json={"raw_text": f"{title} from {start_time} to {end_time}"}, headers=HEADERS)
    if res.status_code != 200:
        print(f"Failed to create job for {title}: {res.text}")
        return None
    job_id = res.json()['id']
    requests.post(f"{BASE_URL}/jobs/{job_id}/parse", headers=HEADERS)
    
    # Poll for candidate
    for i in range(10): # Increased verification time
        time.sleep(1.0)
        job = requests.get(f"{BASE_URL}/jobs/{job_id}", headers=HEADERS).json()
        if job.get('candidates'):
            cand = job['candidates'][0]
            print(f"   [DEBUG] Found candidate: {cand['id']}")
            # Accept it (schema expects dict)
            acc_res = requests.post(f"{BASE_URL}/jobs/{job_id}/accept", json={'selected_candidate_ids': [cand['id']]}, headers=HEADERS)
            if acc_res.status_code != 200:
                print(f"   [DEBUG] Failed to accept: {acc_res.text}")
            break
        else:
            print(f"   [DEBUG] Waiting for candidate... {i}")
    
    # Fetch task to get ID
    tasks = requests.get(f"{BASE_URL}/tasks?start_date=2026-01-01T00:00:00&end_date=2027-01-01T00:00:00", headers=HEADERS).json()
    # Find our task (naive match)
    for t in tasks:
        if t['title'] == title:
            return t
    return None

def setup():
    # Clear existing tasks for this user? 
    # Hard to do via API without delete all. 
    # Let's just create unique titles.
    ts = int(time.time())
    
    t1 = create_task(f"TaskA_{ts}", "2026-01-25T10:00", "2026-01-25T11:00")
    t2 = create_task(f"TaskB_{ts}", "2026-01-25T11:00", "2026-01-25T12:00")
    t3 = create_task(f"TaskC_{ts}", "2026-01-25T12:00", "2026-01-25T13:00")
    
    print(f"Created Tasks: A={t1['id']}, B={t2['id']}, C={t3['id']}")
    return t1, t2, t3

def test_chain(t1, t2, t3):
    print("\n--- Testing Recursive Conflict ---")
    
    # 1. Try to move A to 11:00 (Conflict with B)
    print(f"1. Moving Task A ({t1['id']}) to 11:00...")
    res = requests.patch(f"{BASE_URL}/tasks/{t1['id']}", json={"start_time": "2026-01-25T11:00:00"}, headers=HEADERS)
    print(f"   Status: {res.status_code}")
    if res.status_code == 409:
        print(f"   Conflict: {res.json()['detail']}")
        assert "TaskB" in str(res.json()['detail'])
    else:
        print(f"   FAIL: Expected 409, got {res.status_code}")

    # 2. Simulate User resolving by moving B to 12:00 (Conflict with C)
    print(f"2. Resolving: Moving Task B ({t2['id']}) to 12:00...")
    res = requests.patch(f"{BASE_URL}/tasks/{t2['id']}", json={"start_time": "2026-01-25T12:00:00"}, headers=HEADERS)
    print(f"   Status: {res.status_code}")
    if res.status_code == 409:
        print(f"   Conflict: {res.json()['detail']}")
        assert "TaskC" in str(res.json()['detail'])
    else:
        print(f"   FAIL: Expected 409, got {res.status_code}")
        
    # 3. Simulate User resolving by moving C to 13:00 (Free)
    print(f"3. Resolving: Moving Task C ({t3['id']}) to 13:00...")
    res = requests.patch(f"{BASE_URL}/tasks/{t3['id']}", json={"start_time": "2026-01-25T13:00:00"}, headers=HEADERS)
    print(f"   Status: {res.status_code}")
    if res.status_code == 200:
        print("   SUCCESS: Task C moved.")
    else:
        print(f"   FAIL: Expected 200, got {res.status_code} - {res.text}")

    # 4. Success: Now B can move to 12:00
    print(f"4. Retrying: Moving Task B ({t2['id']}) to 12:00...")
    res = requests.patch(f"{BASE_URL}/tasks/{t2['id']}", json={"start_time": "2026-01-25T12:00:00"}, headers=HEADERS)
    print(f"   Status: {res.status_code}")
    
    # 5. Success: Now A can move to 11:00
    print(f"5. Retrying: Moving Task A ({t1['id']}) to 11:00...")
    res = requests.patch(f"{BASE_URL}/tasks/{t1['id']}", json={"start_time": "2026-01-25T11:00:00"}, headers=HEADERS)
    print(f"   Status: {res.status_code}")

if __name__ == "__main__":
    try:
        t1, t2, t3 = setup()
        if t1 and t2 and t3:
            test_chain(t1, t2, t3)
        else:
            print("Setup failed")
    except Exception as e:
        print(f"Test crashed: {e}")
