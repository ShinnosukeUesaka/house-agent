'use client'

import { useState } from 'react'

type MealFormData = {
  user_name: 'michael' | 'shin'
  calories: number
  meal_name: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  eaten_at: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: MealFormData) => Promise<void>
}

export function AddMealModal({ isOpen, onClose, onSubmit }: Props) {
  const [formData, setFormData] = useState<MealFormData>({
    user_name: 'michael',
    calories: 0,
    meal_name: '',
    meal_type: 'lunch',
    eaten_at: new Date().toISOString().slice(0, 16),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await onSubmit(formData)
      onClose()
      setFormData({
        user_name: 'michael',
        calories: 0,
        meal_name: '',
        meal_type: 'lunch',
        eaten_at: new Date().toISOString().slice(0, 16),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add meal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-zinc-900 rounded-lg p-6 w-full max-w-md shadow-xl border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-zinc-100">Add Meal</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Who
            </label>
            <select
              value={formData.user_name}
              onChange={e => setFormData(prev => ({ ...prev, user_name: e.target.value as 'michael' | 'shin' }))}
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              <option value="michael">Michael</option>
              <option value="shin">Shin</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Meal Name
            </label>
            <input
              type="text"
              value={formData.meal_name}
              onChange={e => setFormData(prev => ({ ...prev, meal_name: e.target.value }))}
              placeholder="e.g., Chicken salad"
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Calories
            </label>
            <input
              type="number"
              value={formData.calories || ''}
              onChange={e => setFormData(prev => ({ ...prev, calories: parseInt(e.target.value) || 0 }))}
              placeholder="500"
              min="1"
              required
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Meal Type
            </label>
            <select
              value={formData.meal_type}
              onChange={e => setFormData(prev => ({ ...prev, meal_type: e.target.value as 'breakfast' | 'lunch' | 'dinner' | 'snack' }))}
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              When
            </label>
            <input
              type="datetime-local"
              value={formData.eaten_at}
              onChange={e => setFormData(prev => ({ ...prev, eaten_at: e.target.value }))}
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || formData.calories < 1}
              className="flex-1 px-4 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Meal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
