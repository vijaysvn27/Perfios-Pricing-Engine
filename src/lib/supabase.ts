import { createClient } from '@supabase/supabase-js'
import type { ConfigSnapshot } from './engine'

// The publishable (anon) key is designed to ship in the client bundle — RLS, not
// key secrecy, is the security boundary. These defaults let the app build/deploy
// without env config; an env var (local .env / hosting) still overrides them.
const DEFAULT_SUPABASE_URL = 'https://nljbzqcfcyltxroafloe.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_uwkF6hYsL-F_CAM7jv5byw_VeuAqLES'

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY

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
