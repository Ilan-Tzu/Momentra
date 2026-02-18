import requests
import json
import time

BASE_URL = "http://localhost:8000/api/v1"
HEADERS = {"X-User-Id": "test_user_force_save"}

def verify_force_save():
    print("\n=== START: Force Save (Ignore Conflict) Verification ===")
    DATE = "2026-06-25"
    
    # 1. Create Task A (10:00-11:00)
    print("\n[Step 1] Creating Task A (10:00-11:00)...")
    res = requests.post(f"{BASE_URL}/jobs", json={"raw_text": f"Task A on {DATE} from 10:00 to 11:00"}, headers=HEADERS)
    jid_a = res.json()['id']
    requests.post(f"{BASE_URL}/jobs/{jid_a}/parse", headers=HEADERS)
    # Wait for candidate
    time.sleep(2)
    job_a = requests.get(f"{BASE_URL}/jobs/{jid_a}", headers=HEADERS).json()
    cand_a = job_a['candidates'][0]
    requests.post(f"{BASE_URL}/jobs/{jid_a}/accept", json={'selected_candidate_ids': [cand_a['id']]}, headers=HEADERS)
    print("SUCCESS: Task A Created.")

    # 2. Create Task B (11:00-12:00) - Initially Safe
    print("\n[Step 2] Creating Task B (11:00-12:00)...")
    res = requests.post(f"{BASE_URL}/jobs", json={"raw_text": f"Task B on {DATE} from 11:00 to 12:00"}, headers=HEADERS)
    jid_b = res.json()['id']
    requests.post(f"{BASE_URL}/jobs/{jid_b}/parse", headers=HEADERS)
    # Wait
    time.sleep(2)
    job_b = requests.get(f"{BASE_URL}/jobs/{jid_b}", headers=HEADERS).json()
    cand_b = job_b['candidates'][0]
    
    # 3. Edit Task B to 10:00 (Conflict) - WITH FORCE=False (Expect Ambiguity/Conflict)
    print("\n[Step 3] Editing Task B to 10:00 (Force=False)...")
    patch_res = requests.patch(f"{BASE_URL}/candidates/{cand_b['id']}", json={
        "parameters": {
            "title": "Task B (Force Check)",
            "start_time": f"{DATE}T10:00:00",
            "end_time": f"{DATE}T11:00:00"
        },
        "command_type": "CREATE_TASK",
        "ignore_conflicts": False
    }, headers=HEADERS)
    
    if patch_res.status_code == 200:
        data = patch_res.json()
        if data['command_type'] == 'AMBIGUITY':
            print("SUCCESS: Got expected AMBIGUITY (Conflict detected).")
        else:
            print(f"FAIL: Expected AMBIGUITY, got {data['command_type']}")
            return

    # 4. Edit Task B to 10:00 (Conflict) - WITH FORCE=True (Expect Success)
    print("\n[Step 4] Editing Task B to 10:00 (Force=True)...")
    patch_force = requests.patch(f"{BASE_URL}/candidates/{cand_b['id']}", json={
        "parameters": {
            "title": "Task B (Force Check)",
            "start_time": f"{DATE}T10:00:00",
            "end_time": f"{DATE}T11:00:00"
        },
        "command_type": "CREATE_TASK",
        "ignore_conflicts": True
    }, headers=HEADERS)
    
    if patch_force.status_code == 200:
        data = patch_force.json()
        if data['command_type'] == 'CREATE_TASK':
             print("SUCCESS: Got CREATE_TASK (Conflict Ignored).")
        else:
             print(f"FAIL: Expected CREATE_TASK, got {data['command_type']}")
             return
    else:
        print(f"FAIL: Update failed {patch_force.status_code}: {patch_force.text}")
        return

    # 5. Accept Task B (with Force just in case accept checks too)
    print("\n[Step 5] Accepting Task B (Force=True)...")
    acc_res = requests.post(f"{BASE_URL}/jobs/{jid_b}/accept", json={
        'selected_candidate_ids': [cand_b['id']], 
        'ignore_conflicts': True
    }, headers=HEADERS)
    
    if acc_res.status_code == 200:
        print("SUCCESS: Task B Accepted.")
    else:
        print(f"FAIL: Accept failed {acc_res.status_code}")
        return
        
    # 6. Verify Overlap
    tasks = requests.get(f"{BASE_URL}/tasks?start_date={DATE}T00:00:00&end_date={DATE}T23:59:59", headers=HEADERS).json()
    print(f"\n[Step 6] Found {len(tasks)} tasks.")
    for t in tasks:
        print(f" - {t['title']} ({t['start_time']})")
    
    if len(tasks) >= 2:
        print("\n=== TEST PASSED: Force Save Successful ===")

if __name__ == "__main__":
    verify_force_save()
