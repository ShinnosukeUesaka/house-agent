
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
