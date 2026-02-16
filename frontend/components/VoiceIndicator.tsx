'use client'

import { VoiceState } from '@/hooks/useVoiceAssistant'

type Props = {
  voiceState: VoiceState
  error: string | null
}

const stateConfig: Record<VoiceState, { label: string; dotClass: string }> = {
  idle: { label: 'Voice Off', dotClass: 'bg-zinc-400' },
  listening: { label: 'Listening...', dotClass: 'bg-green-400 animate-pulse' },
  connecting: { label: 'Connecting...', dotClass: 'bg-yellow-400 animate-pulse' },
  transcribing: { label: 'Hearing you...', dotClass: 'bg-red-400 animate-pulse' },
}

export function VoiceIndicator({ voiceState, error }: Props) {
  const config = stateConfig[voiceState]

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-medium"
      title={error || undefined}
    >
      <span className={`w-2 h-2 rounded-full ${config.dotClass}`} />
      {error ? 'Voice Error' : config.label}
    </div>
  )
}
