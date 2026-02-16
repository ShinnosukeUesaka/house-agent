# Home Agent Project

If you are an AI agent reading this, you might be coding agent working on developing the home agent project, OR working as a home assistant agent.


# Setup
To run backend, run
```
uv run fastapi run main.py
```

To run frontend, run
```
cd frontend
pnpm run dev
```

## WebSocket Protocol

The backend (`agent_backend/main.py`) and frontend (`frontend/hooks/useWebSocket.ts`) communicate over WebSocket at `/ws?channel=<channel_id>`.

- The `channel` query parameter is required (e.g. `dashboard_<device_uuid>`). The server rejects connections without it or if the channel is already active.
- Sessions are persisted per channel to disk (`.sessions/<channel>.json`). A session is resumed if it exists, has fewer than 6 messages, or the last message was within 1 hour; otherwise a new session is created.

### Client -> Server
- `{"type": "chat", "content": "...", "user": "...", "channel": "..."}`

### Server -> Client
- `{"type": "chat.message", "payload": {"content": "..."}}` — assistant text response (may arrive multiple times per query)
- `{"type": "chat.plot", "payload": {"html": "..."}}` — interactive Plotly chart HTML
- `{"type": "chat.done", "payload": {}}` — signals the assistant has finished responding; frontend clears the processing/loading state

## Calorie Tracking (meals table)

Use **Supabase MCP** (`mcp__supabase__execute_sql`) for all database operations. Never write scripts or use bash to interact with Supabase.

### Schema: `public.meals`

| Column      | Type          | Notes                                                    |
|-------------|---------------|----------------------------------------------------------|
| `id`        | `uuid`        | PK, auto-generated                                       |
| `user_name` | `text`        | Required. `'michael'` or `'shin'`                        |
| `calories`  | `integer`     | Required. Must be `> 0`                                  |
| `meal_name` | `text`        | Nullable                                                 |
| `meal_type` | `text`        | Nullable. `'breakfast'`, `'lunch'`, `'dinner'`, `'snack'`|
| `notes`     | `text`        | Nullable                                                 |
| `eaten_at`  | `timestamptz` | Default `now()`                                          |
| `created_at`| `timestamptz` | Default `now()`, do not set manually                     |

### Example queries

```sql
-- Insert
INSERT INTO meals (user_name, calories, meal_name, meal_type)
VALUES ('shin', 500, 'chicken salad', 'lunch');

-- Today's total
SELECT COALESCE(SUM(calories), 0) FROM meals
WHERE user_name = 'shin' AND eaten_at::date = CURRENT_DATE;
```

## Voice Assistant

- Wake word: "Alexa" via Porcupine Web SDK (WASM, runs in browser)
- STT: OpenAI Realtime API with server VAD for auto-stop
- Backend provides ephemeral tokens via `POST /api/realtime-session` (keeps OPENAI_API_KEY server-side)
- A 3-second rolling audio buffer prevents word loss after wake word detection
- Final transcripts are sent through the existing WebSocket chat pipeline
- Env var: `NEXT_PUBLIC_PICOVOICE_ACCESS_KEY` (Picovoice Console access key)