'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type WebSocketMessage = {
  type: 'chat.message' | 'chat.plot' | 'chat.done' | 'chat.audio'
  payload: {
    content?: string
    html?: string
    audio?: string
  }
}

type UseWebSocketReturn = {
  messages: Message[]
  plotHtml: string | null
  isConnected: boolean
  isProcessing: boolean
  sendMessage: (content: string) => void
  clearPlot: () => void
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws'

function getDeviceId(): string {
  const key = 'device_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

export function useWebSocket(): UseWebSocketReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [plotHtml, setPlotHtml] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const deviceIdRef = useRef<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    if (!deviceIdRef.current) {
      deviceIdRef.current = getDeviceId()
    }
    const channel = `dashboard_${deviceIdRef.current}`
    const ws = new WebSocket(`${WS_URL}?channel=${channel}`)

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
      } else if (data.type === 'chat.audio' && data.payload.audio) {
        // Convert base64 audio to blob and play
        try {
          const audioData = atob(data.payload.audio)
          const arrayBuffer = new ArrayBuffer(audioData.length)
          const uint8Array = new Uint8Array(arrayBuffer)
          for (let i = 0; i < audioData.length; i++) {
            uint8Array[i] = audioData.charCodeAt(i)
          }
          const blob = new Blob([uint8Array], { type: 'audio/mpeg' })
          const audioUrl = URL.createObjectURL(blob)

          // Create or reuse audio element
          if (!audioRef.current) {
            audioRef.current = new Audio()
          }

          audioRef.current.src = audioUrl
          audioRef.current.play().catch((error) => {
            console.error('Error playing audio:', error)
          })

          // Clean up the object URL after playing
          audioRef.current.onended = () => {
            URL.revokeObjectURL(audioUrl)
          }
        } catch (error) {
          console.error('Error processing audio:', error)
        }
      } else if (data.type === 'chat.done') {
        setIsProcessing(false)
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
    if (isProcessing) return
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setIsProcessing(true)

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
      const channel = `dashboard_${deviceIdRef.current}`
      wsRef.current.send(JSON.stringify({
        type: 'chat',
        content,
        user: 'unknown',
        channel,
      }))
    }
  }, [isProcessing])

  const clearPlot = useCallback(() => {
    setPlotHtml(null)
  }, [])

  return {
    messages,
    plotHtml,
    isConnected,
    isProcessing,
    sendMessage,
    clearPlot,
  }
}
