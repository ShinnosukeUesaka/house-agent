'use client'

type Props = {
  html: string | null
  onClose: () => void
}

export function PlotWindow({ html, onClose }: Props) {
  if (!html) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-4xl h-[700px] bg-white dark:bg-zinc-900 rounded-lg shadow-xl flex flex-col border border-zinc-200 dark:border-zinc-800">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Agent Plot
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-zinc-500"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Plot iframe */}
        <div className="flex-1 p-4">
          <iframe
            srcDoc={html}
            className="w-full h-full rounded border border-zinc-200 dark:border-zinc-700 bg-white"
            sandbox="allow-scripts"
            title="Agent Plot"
          />
        </div>
      </div>
    </div>
  )
}
