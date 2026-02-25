'use client'
import { useCallback, useRef, useState } from 'react'

type UseRealtimeVoiceProps = {
  onEnd: () => void
  onCallClaudeCode: (request: string) => Promise<string>
  backendUrl?: string
}

export function useRealtimeVoice({
  onEnd,
  onCallClaudeCode,
  backendUrl = 'http://localhost:8000',
}: UseRealtimeVoiceProps) {
  const [isActive, setIsActive] = useState(false)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const lastActivityRef = useRef(Date.now())
  const inactivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onEndRef = useRef(onEnd)
  const onCallClaudeCodeRef = useRef(onCallClaudeCode)
  onEndRef.current = onEnd
  onCallClaudeCodeRef.current = onCallClaudeCode

  const endSession = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearInterval(inactivityTimerRef.current)
      inactivityTimerRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    dcRef.current = null
    if (audioElRef.current) {
      audioElRef.current.srcObject = null
    }
    setIsActive(false)
    onEndRef.current()
  }, [])

  const handleFunctionCall = useCallback(
    async (name: string, argsStr: string, callId: string) => {
      const dc = dcRef.current
      if (!dc || dc.readyState !== 'open') return

      if (name === 'end_conversation') {
        dc.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: { type: 'function_call_output', call_id: callId, output: '{"done": true}' },
          })
        )
        endSession()
        return
      }

      if (name === 'call_claude_code') {
        try {
          const args = JSON.parse(argsStr)
          const result = await onCallClaudeCodeRef.current(args.request)
          dc.send(
            JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: callId,
                output: JSON.stringify({ result }),
              },
            })
          )
          dc.send(JSON.stringify({ type: 'response.create' }))
        } catch (err) {
          console.error('call_claude_code error:', err)
          dc.send(
            JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: callId,
                output: JSON.stringify({ error: 'Failed to get response from backend' }),
              },
            })
          )
          dc.send(JSON.stringify({ type: 'response.create' }))
        }
      }
    },
    [endSession]
  )

  const startConversation = useCallback(async () => {
    // Fetch ephemeral token
    const resp = await fetch(`${backendUrl}/api/realtime-session`, { method: 'POST' })
    if (!resp.ok) throw new Error(`Failed to get session token: ${resp.status}`)
    const { token } = await resp.json()

    // Create peer connection
    const pc = new RTCPeerConnection()
    pcRef.current = pc

    // Set up remote audio
    if (!audioElRef.current) {
      audioElRef.current = document.createElement('audio')
      audioElRef.current.autoplay = true
    }
    pc.ontrack = (e) => {
      if (audioElRef.current) {
        audioElRef.current.srcObject = e.streams[0]
      }
    }

    // Get microphone and add track
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    // Create data channel
    const dc = pc.createDataChannel('oai-events')
    dcRef.current = dc

    dc.onopen = () => {
      console.log('Realtime data channel open')
      dc.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            instructions:
              'You are a home assistant voice agent. Have natural conversations. For simple questions, answer directly and concisely. For anything requiring database queries, file operations, web search, code execution, or other complex actions, use the call_claude_code function. When the user says goodbye or the conversation naturally ends (before closing ask the user if they have any followup), call end_conversation.',
            tools: [
              {
                type: 'function',
                name: 'call_claude_code',
                description:
                  'Delegate complex tasks to the Claude Code backend (database, files, web search, code execution, home automation, etc.)',
                parameters: {
                  type: 'object',
                  properties: {
                    request: { type: 'string', description: "The user's request" },
                  },
                  required: ['request'],
                },
              },
              {
                type: 'function',
                name: 'end_conversation',
                description:
                  'End the voice conversation when the user says goodbye or the conversation is complete.',
                parameters: { type: 'object', properties: {} },
              },
            ],
            tool_choice: 'auto',
            turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 800 },
          },
        })
      )
    }

    dc.onmessage = (e) => {
      const event = JSON.parse(e.data)
      console.log('Realtime event:', event.type)

      if (
        event.type === 'input_audio_buffer.speech_started' ||
        event.type === 'response.created'
      ) {
        lastActivityRef.current = Date.now()
      }

      if (event.type === 'response.done') {
        const output = event.response?.output ?? []
        for (const item of output) {
          if (item.type === 'function_call') {
            handleFunctionCall(item.name, item.arguments, item.call_id)
          }
        }
      }
    }

    dc.onerror = (err) => {
      console.error('Data channel error:', err)
      endSession()
    }

    // Create and send SDP offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    const sdpResp = await fetch(
      `https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      }
    )
    if (!sdpResp.ok) throw new Error(`SDP exchange failed: ${sdpResp.status}`)
    const answerSdp = await sdpResp.text()
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

    // Start inactivity timer
    lastActivityRef.current = Date.now()
    inactivityTimerRef.current = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 60000) {
        console.log('Inactivity timeout: ending session')
        endSession()
      }
    }, 10000)

    setIsActive(true)
  }, [backendUrl, endSession, handleFunctionCall])

  return { startConversation, endSession, isActive }
}
