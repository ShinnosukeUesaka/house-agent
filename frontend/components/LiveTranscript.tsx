'use client'

type Props = {
  text: string
  isVisible: boolean
}

export function LiveTranscript({ text, isVisible }: Props) {
  if (!isVisible) return null

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 px-6 py-3 max-w-md">
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shrink-0" />
        <p className="text-zinc-900 dark:text-zinc-100 text-sm">
          {text || 'Listening...'}
        </p>
      </div>
    </div>
  )
}
