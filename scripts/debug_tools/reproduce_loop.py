
import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000/api/v1"

def run_test():
    # 0. Create a conflicting task at 8 AM
    print("0. Creating conflicting task at 8 AM...")
    conflict_job = requests.post(f"{BASE_URL}/jobs", json={"raw_text": "Dentist Appointment today at 8am"}, headers={"X-User-Id": "test_user_loop"})
    c_id = conflict_job.json()["id"]
    requests.post(f"{BASE_URL}/jobs/{c_id}/parse")
    res = requests.get(f"{BASE_URL}/jobs/{c_id}")
    cands = res.json()["candidates"]
    if cands:
        requests.post(f"{BASE_URL}/jobs/{c_id}/accept", json={"selected_candidate_ids": [cands[0]['id']]})
        print("   ✅ Conflicting task created.")

    # 1. Create a job "Meeting at 8" (ambiguous AM/PM)
    print("1. Creating ambiguous job...")
    res = requests.post(f"{BASE_URL}/jobs", json={"raw_text": "Meeting at 8"}, headers={"X-User-Id": "test_user_loop"})
    if res.status_code != 200:
        print("Failed to create job:", res.text)
        return
    job_id = res.json()["id"]
    print(f"   Job ID: {job_id}")

    # 2. Parse job
    print("2. Parsing job...")
    res = requests.post(f"{BASE_URL}/jobs/{job_id}/parse")
    if res.status_code != 200:
        print("Failed to parse:", res.text)
        return
    
    # 3. Get candidates
    print("3. Fetching candidates...")
    res = requests.get(f"{BASE_URL}/jobs/{job_id}")
    candidates = res.json()["candidates"]
    if not candidates:
        print("   No candidates found!")
        return
    
    cand = candidates[0]
    print(f"   Candidate ID: {cand['id']}, Type: {cand['command_type']}")
    print(f"   Parameters: {cand['parameters']}")

    # 4. Resolve Ambiguity -> Set to 8:00 AM
    print("4. Resolving ambiguity (setting to 08:00:00)...")
    # Simulate what frontend sends
    update_payload = {
        "description": "Meeting",
        "command_type": "CREATE_TASK",
        "parameters": {
            "title": "Meeting",
            "start_time": "2026-01-19T08:00:00",
            "end_time": "2026-01-19T09:00:00",
            "description": ""
        }
    }
    res = requests.patch(f"{BASE_URL}/candidates/{cand['id']}", json=update_payload)
    if res.status_code != 200:
        print("Failed to update candidate:", res.text)
        return
    
    updated_cand = res.json()
    print(f"   Updated Type: {updated_cand['command_type']}")
    if updated_cand['command_type'] == 'AMBIGUITY':
        print("   ❌ Candidate reverted to AMBIGUITY!")
        print("   Reason:", updated_cand.get('description'))
        print("   Params:", updated_cand.get('parameters'))
    else:
        print("   ✅ Candidate updated to CREATE_TASK")

    # 5. Accept Job
    if updated_cand['command_type'] != 'AMBIGUITY':
        print("5. Accepting job...")
        res = requests.post(f"{BASE_URL}/jobs/{job_id}/accept", json={"selected_candidate_ids": [cand['id']]})
        if res.status_code == 200:
             print("   ✅ Job accepted. Stats:", res.json())
        else:
             print("   ❌ Accept failed:", res.status_code, res.text)

if __name__ == "__main__":
    run_test()
