import os

import spotipy
from spotipy.oauth2 import SpotifyOAuth
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    TextBlock,
    ToolUseBlock,
    create_sdk_mcp_server,
    tool,
)
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

_spotify_client: spotipy.Spotify | None = None


def get_spotify_client() -> spotipy.Spotify:
    global _spotify_client
    if _spotify_client is None:
        _spotify_client = spotipy.Spotify(auth_manager=SpotifyOAuth(
            scope="user-modify-playback-state user-read-playback-state",
        ))
    return _spotify_client


def create_plot_tool(websocket: WebSocket):
    """Create a display_plot tool that can send plots to a specific websocket."""

    @tool(
        "display_plot",
        "Display an interactive Plotly chart in the user's browser. Send complete HTML including Plotly.js CDN script tags. The chart will be rendered in a popup window. Include <!DOCTYPE html>, <html>, <head> with Plotly CDN script (https://cdn.plot.ly/plotly-latest.min.js), and <body> with a div and Plotly.newPlot() call.",
        {"html": str},
    )
    async def display_plot(args: dict):
        html = args.get("html", "")
        await websocket.send_json({"type": "chat.plot", "payload": {"html": html}})
        return {
            "content": [{"type": "text", "text": "Plot has been displayed to the user."}]
        }

    return display_plot


def create_refresh_tool(websocket: WebSocket):
    """Create a refresh_dashboard tool that signals the frontend to refetch data."""

    @tool(
        "refresh_dashboard",
        "Refresh the dashboard UI in the user's browser. Call this after making any changes to the database (e.g., adding, updating, or deleting meals) so the user sees updated charts immediately.",
        {},
    )
    async def refresh_dashboard(args: dict):
        await websocket.send_json({"type": "data.refresh", "payload": {}})
        return {
            "content": [{"type": "text", "text": "Dashboard has been refreshed."}]
        }

    return refresh_dashboard


def create_play_song_tool():
    """Create a play_song tool that plays music on Spotify."""

    @tool(
        "play_song",
        "Play a song on Spotify. Searches for the track and starts playback on the home speaker. Provide the song name and optionally the artist.",
        {"song": str, "artist": str},
    )
    async def play_song(args: dict):
        song = args.get("song", "")
        artist = args.get("artist", "")

        try:
            sp = get_spotify_client()

            query = f"track:{song}"
            if artist:
                query += f" artist:{artist}"
            results = sp.search(q=query, type="track", limit=1)

            if not results["tracks"]["items"]:
                return {"content": [{"type": "text", "text": f"Could not find {song} by {artist}"}]}

            track = results["tracks"]["items"][0]
            track_uri = track["uri"]
            track_name = track["name"]
            track_artist = track["artists"][0]["name"]

            devices = sp.devices()
            pi_device = next(
                (d for d in devices.get("devices", [])
                 if "raspotify" in d["name"].lower() or "pi" in d["name"].lower()),
                None,
            )

            device_id = pi_device["id"] if pi_device else None
            if device_id:
                sp.transfer_playback(device_id=device_id, force_play=False)
            sp.start_playback(device_id=device_id, uris=[track_uri])

            return {"content": [{"type": "text", "text": f"Now playing {track_name} by {track_artist}"}]}
        except spotipy.SpotifyException as e:
            return {"content": [{"type": "text", "text": f"Spotify error: {e.msg}"}]}
        except Exception as e:
            return {"content": [{"type": "text", "text": f"Failed to play song: {e}"}]}

    return play_song
