'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type WebSocketMessage = {
  type: 'chat.message' | 'chat.plot'
  payload: {
    content?: string
    html?: string
  }
}

type UseWebSocketReturn = {
  messages: Message[]
  plotHtml: string | null
  isConnected: boolean
  sendMessage: (content: string) => void
  clearPlot: () => void
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws'

export function useWebSocket(): UseWebSocketReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [plotHtml, setPlotHtml] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      setIsConnected(true)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect()
      }, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      const data: WebSocketMessage = JSON.parse(event.data)

      if (data.type === 'chat.message' && data.payload.content) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.payload.content!,
          },
        ])
      } else if (data.type === 'chat.plot' && data.payload.html) {
        setPlotHtml(data.payload.html)
      }
    }

    wsRef.current = ws
  }, [])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      wsRef.current?.close()
    }
  }, [connect])

  const sendMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Add user message to local state
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          content,
        },
      ])

      // Send to server
      wsRef.current.send(JSON.stringify({
        type: 'chat',
        content,
      }))
    }
  }, [])

  const clearPlot = useCallback(() => {
    setPlotHtml(null)
  }, [])

  return {
    messages,
    plotHtml,
    isConnected,
    sendMessage,
    clearPlot,
  }
}
