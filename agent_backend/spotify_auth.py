import spotipy
from spotipy.oauth2 import SpotifyOAuth
from dotenv import load_dotenv

load_dotenv()

sp = spotipy.Spotify(auth_manager=SpotifyOAuth(
    scope="user-modify-playback-state user-read-playback-state",
))

user = sp.current_user()
print(f"Authenticated as: {user['display_name']}")

devices = sp.devices()
print("Available devices:")
for d in devices.get("devices", []):
    print(f"  - {d['name']} ({d['type']}) active={d['is_active']}")
