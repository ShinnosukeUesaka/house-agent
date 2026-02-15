import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
    ToolUseBlock,
    tool,
    create_sdk_mcp_server,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def create_plot_tool(websocket: WebSocket):
    """Create a display_plot tool that can send plots to a specific websocket."""

    @tool(
        "display_plot",
        "Display an interactive Plotly chart in the user's browser. Send complete HTML including Plotly.js CDN script tags. The chart will be rendered in a popup window. Include <!DOCTYPE html>, <html>, <head> with Plotly CDN script (https://cdn.plot.ly/plotly-latest.min.js), and <body> with a div and Plotly.newPlot() call.",
        {"html": str},
    )
    async def display_plot(args: dict):
        html = args.get("html", "")
        await websocket.send_json({"type": "plot", "html": html})
        return {
            "content": [{"type": "text", "text": "Plot has been displayed to the user."}]
        }

    return display_plot


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # Create the plot tool with access to this websocket
    display_plot = create_plot_tool(websocket)

    # Create MCP server with the tool
    plot_server = create_sdk_mcp_server(
        name="plot_server",
        version="1.0.0",
        tools=[display_plot],
    )

    # Configure client options
    options = ClaudeAgentOptions(
        mcp_servers={"plot": plot_server},
        allowed_tools=["mcp__plot__display_plot"],
        permission_mode="bypassPermissions",
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
                                        "type": "message",
                                        "role": "assistant",
                                        "content": block.text,
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
