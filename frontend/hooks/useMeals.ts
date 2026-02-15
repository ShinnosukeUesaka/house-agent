'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, Meal } from '@/lib/supabase'

type DailyAggregate = {
  date: string
  michael: number
  shin: number
}

type WeeklyAggregate = {
  week: string
  michael: number
  shin: number
}

type MealTypeAggregate = {
  meal_type: string
  michael: number
  shin: number
  total: number
}

export function useMeals() {
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMeals = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('meals')
      .select('*')
      .order('eaten_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setMeals(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchMeals()
  }, [fetchMeals])

  const getDailyAggregates = useCallback((days: number = 7): DailyAggregate[] => {
    const today = new Date()
    const aggregates: DailyAggregate[] = []

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]

      const dayMeals = meals.filter(m =>
        m.eaten_at.split('T')[0] === dateStr
      )

      aggregates.push({
        date: dateStr,
        michael: dayMeals
          .filter(m => m.user_name === 'michael')
          .reduce((sum, m) => sum + m.calories, 0),
        shin: dayMeals
          .filter(m => m.user_name === 'shin')
          .reduce((sum, m) => sum + m.calories, 0),
      })
    }

    return aggregates
  }, [meals])

  const getWeeklyAggregates = useCallback((weeks: number = 4): WeeklyAggregate[] => {
    const today = new Date()
    const aggregates: WeeklyAggregate[] = []

    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date(today)
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      const weekMeals = meals.filter(m => {
        const mealDate = new Date(m.eaten_at)
        return mealDate >= weekStart && mealDate < weekEnd
      })

      const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

      aggregates.push({
        week: weekLabel,
        michael: weekMeals
          .filter(m => m.user_name === 'michael')
          .reduce((sum, m) => sum + m.calories, 0),
        shin: weekMeals
          .filter(m => m.user_name === 'shin')
          .reduce((sum, m) => sum + m.calories, 0),
      })
    }

    return aggregates
  }, [meals])

  const getMealTypeAggregates = useCallback((): MealTypeAggregate[] => {
    const types = ['breakfast', 'lunch', 'dinner', 'snack']

    return types.map(type => {
      const typeMeals = meals.filter(m => m.meal_type === type)
      const michael = typeMeals
        .filter(m => m.user_name === 'michael')
        .reduce((sum, m) => sum + m.calories, 0)
      const shin = typeMeals
        .filter(m => m.user_name === 'shin')
        .reduce((sum, m) => sum + m.calories, 0)

      return {
        meal_type: type.charAt(0).toUpperCase() + type.slice(1),
        michael,
        shin,
        total: michael + shin,
      }
    })
  }, [meals])

  const addMeal = useCallback(async (meal: Omit<Meal, 'id' | 'created_at'>) => {
    const { error: insertError } = await supabase
      .from('meals')
      .insert(meal)

    if (insertError) {
      throw new Error(insertError.message)
    }

    await fetchMeals()
  }, [fetchMeals])

  return {
    meals,
    loading,
    error,
    refetch: fetchMeals,
    getDailyAggregates,
    getWeeklyAggregates,
    getMealTypeAggregates,
    addMeal,
  }
}
