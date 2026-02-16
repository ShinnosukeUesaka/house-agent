'use client'
import { useState, useCallback, useRef } from 'react'
import { useWakeWord } from './useWakeWord'
import { useRealtimeSTT } from './useRealtimeSTT'

export type VoiceState = 'idle' | 'listening' | 'connecting' | 'transcribing'

type UseVoiceAssistantOptions = {
  sendMessage: (content: string) => void
  porcupineAccessKey: string
  enabled: boolean
}

export function useVoiceAssistant({ sendMessage, porcupineAccessKey, enabled }: UseVoiceAssistantOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [partialTranscript, setPartialTranscript] = useState('')
  const sendMessageRef = useRef(sendMessage)
  sendMessageRef.current = sendMessage

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

  const { isListening, error } = useWakeWord({
    accessKey: porcupineAccessKey,
    enabled: enabled && (voiceState === 'idle' || voiceState === 'listening'),
    onWakeWord: handleWakeWord,
  })

  // Update state when Porcupine starts listening
  const effectiveState: VoiceState = voiceState === 'idle' && isListening ? 'listening' : voiceState

  return {
    voiceState: effectiveState,
    partialTranscript,
    error,
  }
}
