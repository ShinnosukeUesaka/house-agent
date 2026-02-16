import asyncio
import json
import pathlib
import sys
from nt import system

import agent
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
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORK_DIR = pathlib.Path(__file__).parent



@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

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
        system_prompt="You are acting as a home assistant, you might code to process users request."
    )

    try:
        async with ClaudeSDKClient(options=options) as client:
            while True:
                data = await websocket.receive_text()
                message_data = json.loads(data)

                if message_data.get("type") == "chat":
                    user_message = message_data.get("content", "")

                    await client.query(user_message)

                    async for message in client.receive_response():
                        if isinstance(message, AssistantMessage):
                            for block in message.content:
                                if isinstance(block, TextBlock):
                                    await websocket.send_json({
                                        "type": "chat.message",
                                        "payload": {
                                            "content": block.text,
                                        },
                                    })

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
