import requests
import sys

BASE_URL = "http://127.0.0.1:8000/api/v1"

def test_auth():
    print("Testing Registration...")
    reg_payload = {"username": "testuser_auth", "password": "password123"}
    try:
        r = requests.post(f"{BASE_URL}/auth/register", json=reg_payload)
        print(f"Register Status: {r.status_code}")
        print(f"Register Response: {r.text}")
        if r.status_code not in [200, 201]:
            print("Registration Failed!")
            return
    except Exception as e:
        print(f"Registration Exception: {e}")
        return

    print("\nTesting Login...")
    login_payload = {"username": "testuser_auth", "password": "password123"}
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json=login_payload)
        print(f"Login Status: {r.status_code}")
        print(f"Login Response: {r.text}")
        if r.status_code == 200:
            print("Login Success!")
        else:
            print("Login Failed!")
    except Exception as e:
        print(f"Login Exception: {e}")

if __name__ == "__main__":
    test_auth()
