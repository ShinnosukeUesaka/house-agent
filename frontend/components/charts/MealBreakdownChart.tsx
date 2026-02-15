'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

type MealTypeAggregate = {
  meal_type: string
  michael: number
  shin: number
  total: number
}

type Props = {
  data: MealTypeAggregate[]
}

type ViewMode = 'both' | 'michael' | 'shin'

export function MealBreakdownChart({ data }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('both')

  const getValues = () => {
    switch (viewMode) {
      case 'michael':
        return data.map(d => d.michael)
      case 'shin':
        return data.map(d => d.shin)
      default:
        return data.map(d => d.total)
    }
  }

  const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444']

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 shadow-sm border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Meal Breakdown</h2>
        <div className="flex gap-1">
          {(['both', 'michael', 'shin'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === mode
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <Plot
        data={[
          {
            values: getValues(),
            labels: data.map(d => d.meal_type),
            type: 'pie',
            hole: 0.4,
            marker: { colors },
            textinfo: 'label+percent',
            textposition: 'outside',
          },
        ]}
        layout={{
          autosize: true,
          margin: { l: 20, r: 20, t: 20, b: 20 },
          paper_bgcolor: 'transparent',
          font: { color: '#71717a' },
          showlegend: false,
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '300px' }}
      />
    </div>
  )
}
