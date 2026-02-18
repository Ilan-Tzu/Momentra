import httpx
import time
import sys

BASE_URL = "http://localhost:8000/api/v1"

def run_test():
    print("Starting verification flow...")
    
    # 1. Create Job
    print("\n[Step 1] Creating Job...")
    response = httpx.post(f"{BASE_URL}/jobs", json={"raw_text": "Visiting grandma tomorrow at 8"}, timeout=30.0)
    if response.status_code != 200:
        print(f"Failed to create job: {response.text}")
        sys.exit(1)
    
    job = response.json()
    job_id = job["id"]
    print(f"Job created with ID: {job_id}")
    assert job["status"] == "created"

    # 2. Parse Job
    print("\n[Step 2] Parsing Job...")
    response = httpx.post(f"{BASE_URL}/jobs/{job_id}/parse", timeout=30.0)
    if response.status_code != 200:
        print(f"Failed to parse job: {response.text}")
        sys.exit(1)
    
    parse_result = response.json()
    print(f"Parse result: {parse_result}")
    
    # 3. Preview
    print("\n[Step 3] Getting Preview...")
    response = httpx.get(f"{BASE_URL}/jobs/{job_id}")
    if response.status_code != 200:
        print(f"Failed to get preview: {response.text}")
        sys.exit(1)
        
    preview = response.json()
    print(f"Preview received. Status: {preview['status']}")
    assert preview["status"] == "parsed"
    
    candidates = preview["candidates"]
    print(f"Found {len(candidates)} candidates:")
    for c in candidates:
        print(f" - [{c['command_type']}] {c['description']} (Conf: {c['confidence']})")
        
    if not candidates:
        print("No candidates found! (Check LLM key or mock)")
        # In mock mode we expect 1 mock candidate
    
    candidate_id = candidates[0]["id"]
    
    # 4. Accept
    print("\n[Step 4] Accepting Candidate...")
    response = httpx.post(f"{BASE_URL}/jobs/{job_id}/accept", json={"selected_candidate_ids": [candidate_id]})
    if response.status_code != 200:
        print(f"Failed to accept job: {response.text}")
        sys.exit(1)
        
    result = response.json()
    print(f"Execution result: {result}")
    assert result["status"] == "accepted"
    print(f"Tasks created: {len(result['tasks_created'])}")
    
    print("\nVerification Successful!")

if __name__ == "__main__":
    # Wait for server to start if triggered immediately
    time.sleep(2)
    try:
        run_test()
    except httpx.ConnectError:
        print("Could not connect to server. Is it running?")
        sys.exit(1)
