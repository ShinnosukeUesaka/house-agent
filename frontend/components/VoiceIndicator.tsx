'use client'

import { VoiceState } from '@/hooks/useVoiceAssistant'

type Props = {
  voiceState: VoiceState
  isProcessing: boolean
  error: string | null
}

const stateConfig: Record<VoiceState, { label: string; dotClass: string }> = {
  idle: { label: 'Voice Off', dotClass: 'bg-zinc-400' },
  listening: { label: "Say 'Alexa'", dotClass: 'bg-green-400 animate-pulse' },
  connecting: { label: 'Connecting...', dotClass: 'bg-yellow-400 animate-pulse' },
  transcribing: { label: 'Listening...', dotClass: 'bg-red-400 animate-pulse' },
}

export function VoiceIndicator({ voiceState, isProcessing, error }: Props) {
  if (error) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-medium"
        title={error}
      >
        <span className="w-2 h-2 rounded-full bg-red-500" />
        Voice Error
      </div>
    )
  }

  if (isProcessing) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-medium">
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
        Thinking...
      </div>
    )
  }

  const config = stateConfig[voiceState]
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-medium">
      <span className={`w-2 h-2 rounded-full ${config.dotClass}`} />
      {config.label}
    </div>
  )
}
