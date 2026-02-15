'use client'

import { useState } from 'react'
import { useMeals } from '@/hooks/useMeals'
import { useWebSocket } from '@/hooks/useWebSocket'
import { DailyCaloriesChart } from '@/components/charts/DailyCaloriesChart'
import { WeeklyTrendsChart } from '@/components/charts/WeeklyTrendsChart'
import { MealBreakdownChart } from '@/components/charts/MealBreakdownChart'
import { AddMealModal } from '@/components/AddMealModal'
import { ChatButton } from '@/components/ChatButton'
import { ChatWindow } from '@/components/ChatWindow'
import { PlotWindow } from '@/components/PlotWindow'

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const { messages, plotHtml, isConnected, sendMessage, clearPlot } = useWebSocket()
  const {
    loading,
    error,
    getDailyAggregates,
    getWeeklyAggregates,
    getMealTypeAggregates,
    addMeal,
  } = useMeals()

  const dailyData = getDailyAggregates(7)
  const weeklyData = getWeeklyAggregates(4)
  const mealTypeData = getMealTypeAggregates()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Home Dashboard
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              + Add Meal
            </button>
            <ChatButton onClick={() => setIsChatOpen(true)} isConnected={isConnected} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-zinc-500">Loading...</div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DailyCaloriesChart data={dailyData} />
              <MealBreakdownChart data={mealTypeData} />
            </div>
            <WeeklyTrendsChart data={weeklyData} />
          </div>
        )}
      </main>

      <AddMealModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={async (data) => {
          await addMeal({
            ...data,
            notes: null,
            eaten_at: new Date(data.eaten_at).toISOString(),
          })
        }}
      />

      <ChatWindow
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        messages={messages}
        onSendMessage={sendMessage}
        isConnected={isConnected}
      />

      <PlotWindow html={plotHtml} onClose={clearPlot} />
    </div>
  )
}
