'use client'
import { useState, useRef, useCallback } from 'react'

type UseRealtimeSTTOptions = {
  onPartialTranscript: (text: string) => void
  onFinalTranscript: (text: string) => void
  onStateChange: (state: 'connecting' | 'streaming' | 'idle') => void
  backendUrl?: string
}

function resampleToPCM16(float32Audio: Float32Array, fromRate: number, toRate: number): Int16Array {
  const ratio = fromRate / toRate
  const newLength = Math.floor(float32Audio.length / ratio)
  const pcm16 = new Int16Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const srcIndex = Math.floor(i * ratio)
    const sample = Math.max(-1, Math.min(1, float32Audio[srcIndex]))
    pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return pcm16
}

function int16ToBase64(int16Array: Int16Array): string {
  const bytes = new Uint8Array(int16Array.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function useRealtimeSTT({
  onPartialTranscript,
  onFinalTranscript,
  onStateChange,
  backendUrl = 'http://localhost:8000',
}: UseRealtimeSTTOptions) {
  const [isActive, setIsActive] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const onPartialRef = useRef(onPartialTranscript)
  const onFinalRef = useRef(onFinalTranscript)
  const onStateRef = useRef(onStateChange)
  onPartialRef.current = onPartialTranscript
  onFinalRef.current = onFinalTranscript
  onStateRef.current = onStateChange

  const stopStreaming = useCallback(() => {
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
      wsRef.current = null
    }
    setIsActive(false)
    onStateRef.current('idle')
  }, [])

  const startStreaming = useCallback(
    async (bufferedAudio: Float32Array, workletNode: AudioWorkletNode) => {
      try {
        setIsActive(true)
        onStateRef.current('connecting')

        // 1. Get ephemeral token from backend
        const resp = await fetch(`${backendUrl}/api/realtime-session`, { method: 'POST' })
        if (!resp.ok) throw new Error(`Failed to get session token: ${resp.status}`)
        const { token } = await resp.json()

        // 2. Connect to OpenAI Realtime Transcription API
        const ws = new WebSocket(
          'wss://api.openai.com/v1/realtime?intent=transcription',
          ['realtime', `openai-insecure-api-key.${token}`, 'openai-beta.realtime-v1']
        )
        wsRef.current = ws

        let transcriptAccumulator = ''
        let originalHandler: ((this: MessagePort, ev: MessageEvent) => void) | null = null

        const cleanup = () => {
          workletNode.port.postMessage({ type: 'stopStreaming' })
          if (originalHandler) {
            workletNode.port.onmessage = originalHandler
          }
          wsRef.current = null
          setIsActive(false)
          onStateRef.current('idle')
        }

        ws.onopen = () => {
          console.log('OpenAI Realtime Transcription WS connected')
          onStateRef.current('streaming')

          // Send buffered audio first (resample from 48kHz to 24kHz)
          const resampled = resampleToPCM16(bufferedAudio, 48000, 24000)
          const chunkSize = 4800 // 100ms of audio at 24kHz
          for (let i = 0; i < resampled.length; i += chunkSize) {
            const chunk = resampled.slice(i, i + chunkSize)
            const base64 = int16ToBase64(chunk)
            ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }))
          }

          // Start streaming live audio from the worklet
          workletNode.port.postMessage({ type: 'startStreaming' })
        }

        // Handle live audio chunks from worklet
        const handleWorkletMessage = (event: MessageEvent) => {
          if (event.data.type === 'audio' && ws.readyState === WebSocket.OPEN) {
            const resampled = resampleToPCM16(event.data.buffer, 48000, 24000)
            const base64 = int16ToBase64(resampled)
            ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }))
          }
        }

        // Store original handler and add our handler
        originalHandler = workletNode.port.onmessage
        workletNode.port.onmessage = (event: MessageEvent) => {
          if (originalHandler && event.data.type !== 'audio') {
            originalHandler.call(workletNode.port, event)
          }
          handleWorkletMessage(event)
        }

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data)

          switch (data.type) {
            // Transcription-specific events
            case 'conversation.item.input_audio_transcription.delta':
              if (data.delta) {
                transcriptAccumulator += data.delta
                onPartialRef.current(transcriptAccumulator)
              }
              break

            case 'conversation.item.input_audio_transcription.completed':
              if (data.transcript) {
                onFinalRef.current(data.transcript)
              } else if (transcriptAccumulator) {
                onFinalRef.current(transcriptAccumulator)
              }
              transcriptAccumulator = ''
              // Done with this utterance, clean up
              cleanup()
              if (ws.readyState === WebSocket.OPEN) {
                ws.close()
              }
              break

            case 'input_audio_buffer.committed':
              console.log('Audio buffer committed')
              break

            case 'input_audio_buffer.speech_started':
              console.log('VAD: speech started')
              break

            case 'input_audio_buffer.speech_stopped':
              console.log('VAD: speech stopped')
              break

            case 'error':
              console.error('OpenAI Realtime error:', data.error)
              cleanup()
              if (ws.readyState === WebSocket.OPEN) {
                ws.close()
              }
              break

            case 'transcription_session.created':
            case 'transcription_session.updated':
              console.log('Session event:', data.type)
              break

            default:
              console.log('Realtime event:', data.type)
              break
          }
        }

        ws.onerror = (err) => {
          console.error('OpenAI Realtime WS error:', err)
          cleanup()
        }

        ws.onclose = () => {
          console.log('OpenAI Realtime WS closed')
          cleanup()
        }
      } catch (err) {
        console.error('STT streaming error:', err)
        setIsActive(false)
        onStateRef.current('idle')
      }
    },
    [backendUrl, stopStreaming]
  )

  return { startStreaming, stopStreaming, isActive }
}
