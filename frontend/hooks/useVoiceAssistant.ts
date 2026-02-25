'use client'
import { useState, useCallback, useEffect } from 'react'
import { useWakeWord } from './useWakeWord'
import { useRealtimeVoice } from './useRealtimeVoice'

export type VoiceState = 'idle' | 'listening' | 'connecting' | 'active'

type UseVoiceAssistantOptions = {
  sendAndAwaitResponse: (content: string) => Promise<string>
  porcupineAccessKey: string
  enabled: boolean
}

export function useVoiceAssistant({ sendAndAwaitResponse, porcupineAccessKey, enabled }: UseVoiceAssistantOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')

  const { startConversation } = useRealtimeVoice({
    onEnd: () => setVoiceState('listening'),
    onCallClaudeCode: sendAndAwaitResponse,
  })

  const triggerConversation = useCallback(() => {
    setVoiceState('connecting')
    startConversation()
      .then(() => setVoiceState('active'))
      .catch(() => setVoiceState('listening'))
  }, [startConversation])

  const handleWakeWord = useCallback(
    (_bufferedAudio: Float32Array, _workletNode: AudioWorkletNode) => {
      triggerConversation()
    },
    [triggerConversation]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (voiceState !== 'idle' && voiceState !== 'listening') return
      e.preventDefault()
      triggerConversation()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [voiceState, triggerConversation])

  const { isListening, error } = useWakeWord({
    accessKey: porcupineAccessKey,
    enabled: enabled && (voiceState === 'idle' || voiceState === 'listening'),
    onWakeWord: handleWakeWord,
  })

  const effectiveState: VoiceState = voiceState === 'idle' && isListening ? 'listening' : voiceState

  return {
    voiceState: effectiveState,
    error,
  }
}
