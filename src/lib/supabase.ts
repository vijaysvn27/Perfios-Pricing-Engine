import { createClient } from '@supabase/supabase-js'
import type { ConfigSnapshot } from './engine'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (see .env.example).')
}

export const supabase = createClient(url, anonKey)

/**
 * Loads the latest PUBLISHED config — the single source the calculator reads.
 * RLS exposes only the live snapshot to the anon key.
 */
export async function loadLiveConfig(): Promise<ConfigSnapshot> {
  const { data, error } = await supabase
    .from('config_versions')
    .select('snapshot')
    .eq('is_live', true)
    .single()

  if (error) throw new Error(`Failed to load live config: ${error.message}`)
  if (!data?.snapshot) throw new Error('No live config version found.')
  return data.snapshot as ConfigSnapshot
}
