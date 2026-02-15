'use client'

import dynamic from 'next/dynamic'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

type WeeklyAggregate = {
  week: string
  michael: number
  shin: number
}

type Props = {
  data: WeeklyAggregate[]
}

export function WeeklyTrendsChart({ data }: Props) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 shadow-sm border border-zinc-200 dark:border-zinc-800">
      <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">Weekly Trends</h2>
      <Plot
        data={[
          {
            x: data.map(d => d.week),
            y: data.map(d => d.michael),
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Michael',
            line: { color: '#3b82f6', width: 3 },
            marker: { size: 8 },
          },
          {
            x: data.map(d => d.week),
            y: data.map(d => d.shin),
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Shin',
            line: { color: '#10b981', width: 3 },
            marker: { size: 8 },
          },
        ]}
        layout={{
          autosize: true,
          margin: { l: 50, r: 20, t: 20, b: 60 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: '#71717a' },
          xaxis: {
            gridcolor: '#27272a',
          },
          yaxis: {
            title: { text: 'Total Calories' },
            gridcolor: '#27272a',
          },
          legend: {
            orientation: 'h',
            y: -0.2,
          },
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: '100%', height: '300px' }}
      />
    </div>
  )
}
