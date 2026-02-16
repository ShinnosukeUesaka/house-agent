import os
import sys
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

def add_meal(user_name: str, calories: int):
    url = f"{SUPABASE_URL}/rest/v1/meals"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    data = {
        "user_name": user_name,
        "calories": calories
    }

    response = httpx.post(url, headers=headers, json=data)
    response.raise_for_status()
    print(f"Added {calories} calories for {user_name}")
    return response.json()

if __name__ == "__main__":
    user = sys.argv[1] if len(sys.argv) > 1 else "michael"
    cals = int(sys.argv[2]) if len(sys.argv) > 2 else 500
    add_meal(user, cals)
