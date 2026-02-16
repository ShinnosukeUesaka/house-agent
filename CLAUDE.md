We are making home dashboard.
We are tracking
- calories
- more to come

Everything is managed by the agent living in agent_backend

## WebSocket Protocol

The backend (`agent_backend/main.py`) and frontend (`frontend/hooks/useWebSocket.ts`) communicate over WebSocket at `/ws`.

### Client -> Server
- `{"type": "chat", "content": "..."}`

### Server -> Client
- `{"type": "chat.message", "payload": {"content": "..."}}`
- `{"type": "chat.plot", "payload": {"html": "..."}}`

## Voice Assistant

- Wake word: "Alexa" via Porcupine Web SDK (WASM, runs in browser)
- STT: OpenAI Realtime API with server VAD for auto-stop
- Backend provides ephemeral tokens via `POST /api/realtime-session` (keeps OPENAI_API_KEY server-side)
- A 3-second rolling audio buffer prevents word loss after wake word detection
- Final transcripts are sent through the existing WebSocket chat pipeline
- Env var: `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` (Picovoice Console access key)