'use client'

type Props = {
  onClick: () => void
  isConnected: boolean
}

export function ChatButton({ onClick, isConnected }: Props) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
    >
      <span
        className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-green-400' : 'bg-red-400'
        }`}
      />
      Chat with Agent
    </button>
  )
}
