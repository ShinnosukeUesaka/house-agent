import json
import pathlib
import sys
import time
import base64

from dotenv import load_dotenv
load_dotenv(override=True)

from openai import OpenAI

import agent
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
    create_sdk_mcp_server,
    tool,
)
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORK_DIR = pathlib.Path(__file__).parent
SESSIONS_DIR = WORK_DIR / ".sessions"

_active_channels: set[str] = set()


def load_session(channel: str) -> dict | None:
    """Load session data from file. Returns None if missing or corrupt."""
    try:
        return json.loads((SESSIONS_DIR / f"{channel}.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def save_session(channel: str, data: dict) -> None:
    """Write session data to file."""
    SESSIONS_DIR.mkdir(exist_ok=True)
    (SESSIONS_DIR / f"{channel}.json").write_text(json.dumps(data))


def should_create_new_session(session_data: dict | None) -> bool:
    """Return True if we should create a new session instead of resuming."""
    if session_data is None or not session_data.get("session_id"):
        return True
    elapsed = time.time() - session_data.get("last_message_time", 0)
    message_count = session_data.get("user_message_count", 0)
    return elapsed > 3600 and message_count > 5

@app.post("/api/realtime-session")
async def create_realtime_session():
    import httpx

    api_key = os.environ["OPENAI_API_KEY"]
    async with httpx.AsyncClient() as http:
        resp = await http.post(
            "https://api.openai.com/v1/realtime/transcription_sessions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "input_audio_format": "pcm16",
                "input_audio_transcription": {
                    "model": "gpt-4o-mini-transcribe",
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 1500,
                },
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "token": data["client_secret"]["value"],
        "expires_at": data["client_secret"]["expires_at"],
    }


@app.post("/api/tts")
async def text_to_speech(request: dict):
    """Convert text to speech using OpenAI TTS API."""
    text = request.get("text", "")
    if not text:
        return Response(content=b"", status_code=400)

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    response = client.audio.speech.create(
        model="tts-1",
        voice="nova",
        input=text
    )

    # Return audio as MP3
    return Response(
        content=response.content,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-cache",
        }
    )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    channel = websocket.query_params.get("channel")
    if not channel:
        await websocket.close(code=1008, reason="Missing channel")
        return
    if channel in _active_channels:
        await websocket.close(code=1008, reason="Channel already active")
        return

    _active_channels.add(channel)
    try:
        await websocket.accept()

        # Load existing session and decide whether to resume
        session_data = load_session(channel)
        resume_id = None
        if not should_create_new_session(session_data):
            resume_id = session_data["session_id"]
            print(f"Resuming session {resume_id} for channel {channel}")
        else:
            session_data = {"session_id": None, "last_message_time": 0, "user_message_count": 0}
            print(f"Starting new session for channel {channel}")

        # Create the plot tool with access to this websocket
        display_plot = agent.create_plot_tool(websocket)

        # Create MCP server with the tool
        plot_server = create_sdk_mcp_server(
            name="home-agent-server",
            version="1.0.0",
            tools=[display_plot],
        )

        # Configure client options
        options = ClaudeAgentOptions(
            mcp_servers={"plot": plot_server},
            allowed_tools=[
                "mcp__home-agent-server__*",
                "read",
                "write",
                "edit",
                "bash",
                "glob",
                "grep",
                "web_search",
                "web_fetch",
                "ask_user_question",
            ],
            permission_mode="bypassPermissions",
            setting_sources=["project"],
            cwd=WORK_DIR,
            resume=resume_id,
            system_prompt="You are acting as a home assistant, you might code to process users request. Your response should be concise and should not include symbols as they will be read out by text to speech model. DO NOT USE markdown or lists. Your reply should be ~2 sentences long. DO NOT INCLUDE ANYTHING ELSE that should not be read by the TTS model."
        )

        async with ClaudeSDKClient(options=options) as client:
            while True:
                data = await websocket.receive_text()
                message_data = json.loads(data)
                print(message_data)
                if message_data.get("type") == "chat":
                    user_message = message_data.get("content", "")
                    user = message_data.get("user", "unknown")
                    query_text = f"[User: {user}] {user_message}" if user != "unknown" else user_message

                    print(f"message received {query_text}")
                    await client.query(query_text)
                    print("response generated")
                    async for message in client.receive_response():
                        print(message)
                        if isinstance(message, ResultMessage):
                            session_data["session_id"] = message.session_id
                        elif isinstance(message, AssistantMessage):
                            for block in message.content:
                                if isinstance(block, TextBlock):
                                    # Send text message
                                    await websocket.send_json({
                                        "type": "chat.message",
                                        "payload": {
                                            "content": block.text,
                                        },
                                    })

                                    # Generate TTS audio
                                    try:
                                        openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
                                        audio_response = openai_client.audio.speech.create(
                                            model="tts-1",
                                            voice="onyx",
                                            input=block.text
                                        )

                                        # Encode audio as base64 and send via WebSocket
                                        audio_base64 = base64.b64encode(audio_response.content).decode('utf-8')
                                        await websocket.send_json({
                                            "type": "chat.audio",
                                            "payload": {
                                                "audio": audio_base64,
                                            },
                                        })
                                    except Exception as e:
                                        print(f"TTS error: {e}")

                    # Signal completion to frontend
                    await websocket.send_json({"type": "chat.done", "payload": {}})

                    # Update session tracking after each user message
                    session_data["user_message_count"] = session_data.get("user_message_count", 0) + 1
                    session_data["last_message_time"] = time.time()
                    save_session(channel, session_data)

    except WebSocketDisconnect:
        print(f"WebSocket disconnected for channel {channel}")
    except Exception as e:
        print(f"WebSocket error for channel {channel}: {e}")
    finally:
        _active_channels.discard(channel)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
