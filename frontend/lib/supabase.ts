import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Meal = {
  id: string
  user_name: 'michael' | 'shin'
  calories: number
  meal_name: string | null
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null
  notes: string | null
  eaten_at: string
  created_at: string
}
