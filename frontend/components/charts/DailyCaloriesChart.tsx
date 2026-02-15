'use client'

import dynamic from 'next/dynamic'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

type DailyAggregate = {
  date: string
  michael: number
  shin: number
}

type Props = {
  data: DailyAggregate[]
}

export function DailyCaloriesChart({ data }: Props) {
  const dates = data.map(d => {
    const date = new Date(d.date)
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  })

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 shadow-sm border border-zinc-200 dark:border-zinc-800">
      <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">Daily Calories</h2>
      <Plot
        data={[
          {
            x: dates,
            y: data.map(d => d.michael),
            type: 'bar',
            name: 'Michael',
            marker: { color: '#3b82f6' },
          },
          {
            x: dates,
            y: data.map(d => d.shin),
            type: 'bar',
            name: 'Shin',
            marker: { color: '#10b981' },
          },
        ]}
        layout={{
          barmode: 'group',
          autosize: true,
          margin: { l: 50, r: 20, t: 20, b: 60 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#71717a' },
          xaxis: {
            tickangle: -45,
            gridcolor: '#27272a',
          },
          yaxis: {
            title: { text: 'Calories' },
            gridcolor: '#27272a',
          },
          legend: {
            orientation: 'h',
            y: -0.3,
          },
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '300px' }}
      />
    </div>
  )
}
