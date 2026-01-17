import httpx
import time
import sys

BASE_URL = "http://localhost:8000/api/v1"

def run_test():
    print("Starting Edit Flow verification...")
    
    # 1. Create Job with ambiguous/wrong time
    print("\n[Step 1] Creating Job (Meeting at 8)...")
    response = httpx.post(f"{BASE_URL}/jobs", json={"raw_text": "Meeting at 8"}, timeout=30.0)
    if response.status_code != 200:
        print(f"Failed: {response.text}")
        sys.exit(1)
    
    job_id = response.json()["id"]
    print(f"Job ID: {job_id}")

    # 2. Parse
    print("\n[Step 2] Parsing...")
    httpx.post(f"{BASE_URL}/jobs/{job_id}/parse", timeout=30.0)
    
    # 3. Get Preview
    print("\n[Step 3] Fetching Candidates...")
    preview = httpx.get(f"{BASE_URL}/jobs/{job_id}").json()
    candidates = preview["candidates"]
    if not candidates:
        print("No candidates found.")
        sys.exit(1)
        
    candidate = candidates[0]
    print(f"Original Candidate: {candidate['description']} (Type: {candidate['command_type']})")
    
    # 4. Edit Candidate
    print("\n[Step 4] Updating Candidate via PATCH...")
    new_title = "Updated Meeting Title"
    new_params = candidate["parameters"]
    new_params["title"] = new_title
    
    # If it's ambiguity, we might want to change command_type too? 
    # Current implementation only updates description and parameters.
    # Frontend logic usually handles converting Ambiguity -> Task by just treating it as a task and sending a full task payload.
    # But for now, let's just update title.
    
    patch_payload = {
        "description": new_title,
        "parameters": new_params
    }
    
    response = httpx.patch(f"{BASE_URL}/candidates/{candidate['id']}", json=patch_payload)
    if response.status_code != 200:
        print(f"Failed to patch: {response.text}")
        sys.exit(1)
        
    updated = response.json()
    print(f"Updated Candidate: {updated['description']}")
    assert updated["description"] == new_title
    
    # 5. Verify persistence
    print("\n[Step 5] verifying persistence...")
    preview_again = httpx.get(f"{BASE_URL}/jobs/{job_id}").json()
    saved_cand = preview_again["candidates"][0]
    assert saved_cand["description"] == new_title
    
    print("\nEdit Verification Successful!")

if __name__ == "__main__":
    time.sleep(2)
    run_test()
