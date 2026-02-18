import requests
import time
import json

BASE_URL = "http://localhost:8000/api/v1"
HEADERS = {"X-User-Id": "test_user_conflict_edit_v2"}

def create_task_via_text(text):
    print(f"--> Creating via text: '{text}'")
    res = requests.post(f"{BASE_URL}/jobs", json={"raw_text": text}, headers=HEADERS)
    if res.status_code != 200:
        print(f"FAILED to post job: {res.text}")
        return None, None
    job_id = res.json()['id']
    
    # Parse
    requests.post(f"{BASE_URL}/jobs/{job_id}/parse", headers=HEADERS)
    
    # Poll for candidates
    for _ in range(10):
        time.sleep(1.0)
        job = requests.get(f"{BASE_URL}/jobs/{job_id}", headers=HEADERS).json()
        if job.get('candidates'):
            return job_id, job['candidates'][0]
    
    print("FAILED: No candidates found after polling")
    return job_id, None

def verify_conflict_and_edit():
    print("\n=== START: Conflict and Edit Verification V2 ===")
    
    # 1. Setup: Delete existing tasks (optional)
    DATE = "2026-06-20"
    
    # 2. Create Task A: 10:00 - 11:00
    print("\n[Step 1] Creating Task A (10:00-11:00)...")
    jid_a, cand_a = create_task_via_text(f"Task A on {DATE} from 10:00 to 11:00")
    if not cand_a: return
    
    # Accept Task A
    requests.post(f"{BASE_URL}/jobs/{jid_a}/accept", json={'selected_candidate_ids': [cand_a['id']]}, headers=HEADERS)
    print("SUCCESS: Task A Created.")
    
    # 3. Create Task B: 12:00 - 13:00 (SAFE)
    print("\n[Step 2] Creating Task B (12:00-13:00) - Initially Safe...")
    jid_b, cand_b = create_task_via_text(f"Task B on {DATE} from 12:00 to 13:00")
    if not cand_b: return
    
    # 4. Trigger Conflict: Edit B to 10:00 (Overlap A)
    print("\n[Step 3] Editing Task B Candidate to 10:00 (Trigger Conflict)...")
    new_start = f"{DATE}T10:00:00"
    new_end = f"{DATE}T10:30:00"
    
    patch_res = requests.patch(f"{BASE_URL}/candidates/{cand_b['id']}", json={
        "parameters": {
            "title": "Task B (Conflict Attempt)",
            "start_time": new_start,
            "end_time": new_end
        },
        "command_type": "CREATE_TASK"
    }, headers=HEADERS)
    
    if patch_res.status_code == 200:
        data = patch_res.json()
        if data['command_type'] == 'AMBIGUITY':
             print("SUCCESS: Got expected AMBIGUITY on Edit.")
             print(f"Ambiguity Detail: {data['description']}")
        else:
             print(f"FAIL: Expected AMBIGUITY, got {data['command_type']}")
             return
    else:
        print(f"FAIL: Expected 200 (Ambiguity), got {patch_res.status_code}")
        return

    # 5. Resolve Conflict: Edit Task B to 11:00 - 11:30 (SAFE)
    print("\n[Step 4] Editing Task B Candidate to 11:00 - 11:30 (Resolving Conflict)...")
    new_start_safe = f"{DATE}T11:00:00"
    new_end_safe = f"{DATE}T11:30:00"
    
    patch_res = requests.patch(f"{BASE_URL}/candidates/{cand_b['id']}", json={
        "parameters": {
            "title": "Task B (Resolved)",
            "start_time": new_start_safe,
            "end_time": new_end_safe
        },
        "command_type": "CREATE_TASK"
    }, headers=HEADERS)
    
    if patch_res.status_code == 200:
        print("SUCCESS: Candidate updated to safe time.")
    else:
        print(f"FAIL: Failed to update to safe time? {patch_res.status_code}: {patch_res.text}")
        return

    # 6. Accept Task B
    print("\n[Step 5] Accepting Task B (Resolved)...")
    res = requests.post(f"{BASE_URL}/jobs/{jid_b}/accept", json={'selected_candidate_ids': [cand_b['id']]}, headers=HEADERS)
    if res.status_code == 200:
        print("SUCCESS: Task B Accepted.")
    else:
        print(f"FAIL: Accept failed {res.status_code}")
        return

    # 7. Verify
    tasks = requests.get(f"{BASE_URL}/tasks?start_date={DATE}T00:00:00&end_date={DATE}T23:59:59", headers=HEADERS).json()
    print(f"\n[Step 6] Found {len(tasks)} tasks.")
    for t in tasks:
        print(f" - {t['title']}: {t['start_time']} -> {t['end_time']}")
        
    if len(tasks) >= 2:
        print("\n=== TEST PASSED: Conflict Detection on Edit Verified ===")

if __name__ == "__main__":
    verify_conflict_and_edit()
