import requests
import json
import time

BASE_URL = "http://localhost:8000/api/v1"
HEADERS = {"X-User-Id": "test_user_refine"}

def verify_refinement():
    print("\n=== START: Conflict Refinement Verification ===")
    DATE = "2026-06-26"
    
    # 1. Create Task A (11:00-12:00) - "Existing Task"
    print("\n[Step 1] Creating Task A (11:00-12:00)...")
    res = requests.post(f"{BASE_URL}/jobs", json={"raw_text": f"Task A on {DATE} from 11:00 to 12:00"}, headers=HEADERS)
    jid_a = res.json()['id']
    requests.post(f"{BASE_URL}/jobs/{jid_a}/parse", headers=HEADERS)
    time.sleep(2)
    job_a = requests.get(f"{BASE_URL}/jobs/{jid_a}", headers=HEADERS).json()
    cand_a = job_a['candidates'][0]
    requests.post(f"{BASE_URL}/jobs/{jid_a}/accept", json={'selected_candidate_ids': [cand_a['id']]}, headers=HEADERS)
    
    # Get Task A ID
    tasks = requests.get(f"{BASE_URL}/tasks?start_date={DATE}T00:00:00&end_date={DATE}T23:59:59", headers=HEADERS).json()
    task_a = next(t for t in tasks if "Task A" in t['title'])
    print(f"Task A Created: ID {task_a['id']}")

    # 2. Create Task B (11:00-12:00) - "New Task" (initially conflicts)
    # We'll create it via Candidate first to simulate the flow
    print("\n[Step 2] Creating Job B (11:00-12:00 Conflict)...")
    res = requests.post(f"{BASE_URL}/jobs", json={"raw_text": f"Task B on {DATE} from 11:00 to 12:00"}, headers=HEADERS)
    jid_b = res.json()['id']
    requests.post(f"{BASE_URL}/jobs/{jid_b}/parse", headers=HEADERS)
    time.sleep(2)
    job_b = requests.get(f"{BASE_URL}/jobs/{jid_b}", headers=HEADERS).json()
    cand_b = job_b['candidates'][0]
    print(f"Candidate B Created: ID {cand_b['id']}")

    # 3. Simulate "Save" where Task B is moved to 10:00, Task A stays 11:00.
    # Frontend Logic Optimized:
    # - Checks Task A (11:00) vs stored 11:00 -> UNCHANGED -> DOES NOT CALL updateTask(A).
    # - Calls updateCandidate(B) -> 10:00.
    
    # We will simulate the Backend behavior if we *did* call updateTask(A) vs if we don't.
    # Actually, we can't fully simulate frontend logic here, but we can verify that:
    # a) If we update A (unchanged), does it conflict with B (currently 11:00)?
    
    print("\n[Step 3] Verifying Backend Conflict Logic...")
    
    # Attempt to update Task A to same time (11:00-12:00).
    # Since B (Candidate) is not a "Task" yet, A shouldn't conflict with B-candidate unless B is accepted/task?
    # Ah, B is just a candidate. Tasks only conflict with other TASKS.
    # Wait, if B is a Candidate, `updateTask(A)` checks `existing_tasks`. B is not in `tasks` table yet.
    # So `updateTask(A)` should succeed even nicely?
    
    # Unless B was ALREADY a Task?
    # User said: "change the new task... while existing is..."
    # If "New Task" is a candidate, it's not in `tasks`.
    # If "New Task" is an *edited existing task*, then it is in `tasks`.
    
    # Let's assume Scenario 2: Two EXISTING tasks.
    # Task A: 11:00-12:00.
    # Task B: 11:00-12:00 (Conflict allowed/ignored previously? or created via force?)
    # Let's create Task B forced at 11:00.
    
    print("Force updating Candidate B to CREATE_TASK (simulating Save Anyway)...")
    res_p = requests.patch(f"{BASE_URL}/candidates/{cand_b['id']}", json={
        "command_type": "CREATE_TASK",
        "parameters": {
            "title": "Task B (Forced)",
            "start_time": f"{DATE}T11:00:00",
            "end_time": f"{DATE}T12:00:00"
        },
        "ignore_conflicts": True
    }, headers=HEADERS)
    print(f"Update Res: {res_p.status_code} {res_p.text}")
    
    print("Force creating Task B at 11:00 to simulate existing conflict state...")
    res_acc = requests.post(f"{BASE_URL}/jobs/{jid_b}/accept", json={
        'selected_candidate_ids': [cand_b['id']],
        'ignore_conflicts': True
    }, headers=HEADERS)
    print(f"Accept Res: {res_acc.status_code} {res_acc.text}")
    
    time.sleep(2)
    tasks = requests.get(f"{BASE_URL}/tasks?start_date={DATE}T00:00:00&end_date={DATE}T23:59:59", headers=HEADERS).json()
    task_b = next(t for t in tasks if "Task B" in t['title'])
    print(f"Task B Created (Forced): ID {task_b['id']}")
    
    # Now we have A (11-12) and B (11-12).
    # User edits B to 10:00.
    # User leaves A at 11:00.
    
    # OLD Frontend Logic:
    # 1. `updateTask(A, 11:00)`
    # 2. `updateTask(B, 10:00)`
    
    # Test 1: updateTask(A, 11:00) - DOES IT FAIL?
    # A (11-12). B (11-12).
    # Updating A to 11-12.
    # Checks conflicts != A.id. Finds B (11-12). OVERLAP!
    # EXPECT: 409 Conflict.
    
    print("\n[Test 1] Simulating Unoptimized Frontend: Update A to same time (should fail)...")
    res_a = requests.patch(f"{BASE_URL}/tasks/{task_a['id']}", json={
        "start_time": f"{DATE}T11:00:00",
        "end_time": f"{DATE}T12:00:00",
        "ignore_conflicts": False
    }, headers=HEADERS)
    
    if res_a.status_code == 409:
        print("SUCCESS: Got expected 409 Conflict when updating unchanged A (because B overlaps).")
        print("This confirms why the User saw the bug.")
    else:
        print(f"FAIL: Expected 409, got {res_a.status_code}")
    
    # NEW Frontend Logic:
    # 1. Skip A (Unchanged).
    # 2. updateTask(B, 10:00).
    
    print("\n[Test 2] Simulating Optimized Frontend: Update B only (should succeed)...")
    res_b = requests.patch(f"{BASE_URL}/tasks/{task_b['id']}", json={
        "start_time": f"{DATE}T10:00:00",
        "end_time": f"{DATE}T11:00:00",
        "ignore_conflicts": False
    }, headers=HEADERS)
    
    if res_b.status_code == 200:
        print("SUCCESS: Task B moved to 10:00 without conflict.")
    else:
        print(f"FAIL: Task B update failed: {res_b.status_code} {res_b.text}")

    # Verify Final State
    tasks = requests.get(f"{BASE_URL}/tasks?start_date={DATE}T00:00:00&end_date={DATE}T23:59:59", headers=HEADERS).json()
    print(f"\nFinal State: {len(tasks)} tasks")
    for t in tasks:
        print(f" - {t['title']}: {t['start_time']}")

if __name__ == "__main__":
    verify_refinement()
