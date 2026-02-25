'use client'
import { useState, useCallback, useRef } from 'react'
import { useWakeWord } from './useWakeWord'
import { useRealtimeSTT } from './useRealtimeSTT'

export type VoiceState = 'idle' | 'listening' | 'connecting' | 'transcribing'

type UseVoiceAssistantOptions = {
  sendMessage: (content: string) => void
  porcupineAccessKey: string
  enabled: boolean
  isProcessing: boolean
}

export function useVoiceAssistant({ sendMessage, porcupineAccessKey, enabled, isProcessing }: UseVoiceAssistantOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [partialTranscript, setPartialTranscript] = useState('')
  const sendMessageRef = useRef(sendMessage)
  const isProcessingRef = useRef(isProcessing)
  sendMessageRef.current = sendMessage
  isProcessingRef.current = isProcessing

  const handleFinalTranscript = useCallback((text: string) => {
    const trimmed = text.trim()
    if (trimmed) {
      console.log('Final transcript:', trimmed)
      sendMessageRef.current(trimmed)

      // Play completion beep to confirm message was sent
      try {
        const beepContext = new AudioContext()
        const oscillator = beepContext.createOscillator()
        const gainNode = beepContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(beepContext.destination)

        // Use 1200 Hz for completion beep (different from 800 Hz wake word beep)
        oscillator.frequency.value = 1200
        oscillator.type = 'sine'

        // Shorter, higher-pitched double beep pattern for "request sent"
        gainNode.gain.setValueAtTime(0.3, beepContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, beepContext.currentTime + 0.1)

        // Second beep
        gainNode.gain.setValueAtTime(0.3, beepContext.currentTime + 0.15)
        gainNode.gain.exponentialRampToValueAtTime(0.01, beepContext.currentTime + 0.25)

        oscillator.start(beepContext.currentTime)
        oscillator.stop(beepContext.currentTime + 0.25)

        oscillator.onended = () => {
          beepContext.close()
        }
      } catch (err) {
        console.error('Failed to play completion beep:', err)
      }
    }
    setPartialTranscript('')
  }, [])

  const handleStateChange = useCallback((state: 'connecting' | 'streaming' | 'idle') => {
    if (state === 'connecting') setVoiceState('connecting')
    else if (state === 'streaming') setVoiceState('transcribing')
    else setVoiceState((prev) => (prev === 'idle' ? 'idle' : 'listening'))
  }, [])

  const { startStreaming } = useRealtimeSTT({
    onPartialTranscript: setPartialTranscript,
    onFinalTranscript: handleFinalTranscript,
    onStateChange: handleStateChange,
  })

  const handleWakeWord = useCallback(
    (bufferedAudio: Float32Array, workletNode: AudioWorkletNode) => {
      setVoiceState('connecting')
      setPartialTranscript('')
      startStreaming(bufferedAudio, workletNode)
    },
    [startStreaming]
  )

  const handleWakeWordBlocked = useCallback(() => {
    if (!isProcessingRef.current) return
    try {
      const ctx = new AudioContext()
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      oscillator.type = 'sine'
      // Descending tone: 400 Hz → 250 Hz
      oscillator.frequency.setValueAtTime(400, ctx.currentTime)
      oscillator.frequency.linearRampToValueAtTime(250, ctx.currentTime + 0.3)
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.3)
      oscillator.onended = () => ctx.close()
    } catch (err) {
      console.error('Failed to play error beep:', err)
    }
  }, [])

  const { isListening, error } = useWakeWord({
    accessKey: porcupineAccessKey,
    enabled: enabled && !isProcessing && (voiceState === 'idle' || voiceState === 'listening'),
    onWakeWord: handleWakeWord,
    onWakeWordBlocked: handleWakeWordBlocked,
  })

  // Update state when Porcupine starts listening
  const effectiveState: VoiceState = voiceState === 'idle' && isListening ? 'listening' : voiceState

  return {
    voiceState: effectiveState,
    partialTranscript,
    error,
  }
}
