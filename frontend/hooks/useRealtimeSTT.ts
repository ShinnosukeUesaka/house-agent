'use client'
import { useState, useRef, useCallback, useEffect } from 'react'

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

function trimLeadingSilence(buffer: Float32Array, threshold = 0.01, paddingSamples = 4800): Float32Array {
  let firstLoudSample = -1
  for (let i = 0; i < buffer.length; i++) {
    if (Math.abs(buffer[i]) > threshold) {
      firstLoudSample = i
      break
    }
  }
  if (firstLoudSample === -1) return new Float32Array(0)
  const start = Math.max(0, firstLoudSample - paddingSamples)
  return buffer.slice(start)
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
  const cachedTokenRef = useRef<{ token: string; expiresAt: number } | null>(null)
  onPartialRef.current = onPartialTranscript
  onFinalRef.current = onFinalTranscript
  onStateRef.current = onStateChange

  // Pre-fetch a token on mount and refresh periodically
  const fetchToken = useCallback(async () => {
    const resp = await fetch(`${backendUrl}/api/realtime-session`, { method: 'POST' })
    if (!resp.ok) throw new Error(`Failed to get session token: ${resp.status}`)
    const data = await resp.json()
    cachedTokenRef.current = { token: data.token, expiresAt: data.expires_at }
    return data.token
  }, [backendUrl])

  // Pre-fetch token on mount
  useEffect(() => {
    fetchToken().catch((err) => console.warn('Token pre-fetch failed:', err))
  }, [fetchToken])

  const getToken = useCallback(async () => {
    const cached = cachedTokenRef.current
    // Use cached token if it's still valid (with 10s buffer)
    if (cached && cached.expiresAt > Date.now() / 1000 + 10) {
      // Clear it so the next call fetches a fresh one
      cachedTokenRef.current = null
      // Pre-fetch next token in background
      fetchToken().catch(() => {})
      return cached.token
    }
    return fetchToken()
  }, [fetchToken])

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

        // 1. Get token (pre-fetched for speed)
        const token = await getToken()

        // 2. Connect to OpenAI Realtime Transcription API
        const ws = new WebSocket(
          'wss://api.openai.com/v1/realtime?intent=transcription',
          ['realtime', `openai-insecure-api-key.${token}`, 'openai-beta.realtime-v1']
        )
        wsRef.current = ws

        let transcriptAccumulator = ''
        let gotNonEmptyTranscript = false
        let timeoutId: ReturnType<typeof setTimeout> | null = null

        // Audio listener — added via addEventListener so it doesn't conflict
        // with useWakeWord's snapshot listener
        const audioListener = (event: MessageEvent) => {
          if (event.data.type === 'audio' && ws.readyState === WebSocket.OPEN) {
            const resampled = resampleToPCM16(event.data.buffer, 48000, 24000)
            const base64 = int16ToBase64(resampled)
            ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }))
          }
        }

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId)
          workletNode.port.postMessage({ type: 'stopStreaming' })
          workletNode.port.removeEventListener('message', audioListener)
          wsRef.current = null
          setIsActive(false)
          onStateRef.current('idle')
        }

        // Start listening for audio from worklet BEFORE WS opens
        workletNode.port.addEventListener('message', audioListener)

        ws.onopen = () => {
          console.log('OpenAI Realtime Transcription WS connected')
          onStateRef.current('streaming')

          // Start live audio streaming from worklet immediately
          workletNode.port.postMessage({ type: 'startStreaming' })

          // Send trimmed buffered audio
          const trimmed = trimLeadingSilence(bufferedAudio)
          if (trimmed.length > 0) {
            console.log(`Sending ${trimmed.length} buffered samples (trimmed from ${bufferedAudio.length})`)
            const resampled = resampleToPCM16(trimmed, 48000, 24000)
            const chunkSize = 4800
            for (let i = 0; i < resampled.length; i += chunkSize) {
              const chunk = resampled.slice(i, i + chunkSize)
              const base64 = int16ToBase64(chunk)
              ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }))
            }
          } else {
            console.log('Buffer was all silence, streaming live audio only')
          }
        }

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data)
          console.log('Realtime event:', data.type, data)

          switch (data.type) {
            case 'conversation.item.input_audio_transcription.delta':
              if (data.delta) {
                transcriptAccumulator += data.delta
                onPartialRef.current(transcriptAccumulator)
              }
              break

            case 'conversation.item.input_audio_transcription.completed': {
              const transcript = data.transcript || transcriptAccumulator
              if (transcript.trim()) {
                gotNonEmptyTranscript = true
                onFinalRef.current(transcript.trim())
                transcriptAccumulator = ''
                cleanup()
                if (ws.readyState === WebSocket.OPEN) ws.close()
              } else {
                // Empty transcript — keep listening for real speech
                console.log('Empty transcript, continuing to listen...')
                transcriptAccumulator = ''
              }
              break
            }

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
              if (ws.readyState === WebSocket.OPEN) ws.close()
              break

            case 'transcription_session.created':
            case 'transcription_session.updated':
              console.log('Session event:', data.type)
              break

            default:
              console.log('Unhandled event:', data.type)
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

        // Safety timeout
        timeoutId = setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN && !gotNonEmptyTranscript) {
            console.log('Timeout: no transcript received, closing')
            cleanup()
            ws.close()
          }
        }, 15000)
      } catch (err) {
        console.error('STT streaming error:', err)
        setIsActive(false)
        onStateRef.current('idle')
      }
    },
    [getToken, stopStreaming]
  )

  return { startStreaming, stopStreaming, isActive }
}
