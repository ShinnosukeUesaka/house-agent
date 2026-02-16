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