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
 * Loads the Template instance's live PUBLISHED config — for the legacy logged-in
 * (admin) calculator only. config_versions is admin-readable; the no-login partner
 * calculator does NOT use this (it prices server-side via the Edge Function in
 * Step 5 and never receives the rate-bearing snapshot).
 */
export async function loadLiveConfig(): Promise<ConfigSnapshot> {
  const tmpl = await supabase.from('instances').select('id').eq('is_template', true).single()
  if (tmpl.error) throw new Error(`Failed to load template instance: ${tmpl.error.message}`)
  const { data, error } = await supabase
    .from('config_versions')
    .select('snapshot')
    .eq('instance_id', tmpl.data.id)
    .eq('is_live', true)
    .single()

  if (error) throw new Error(`Failed to load live config: ${error.message}`)
  if (!data?.snapshot) throw new Error('No live config version found.')
  return data.snapshot as ConfigSnapshot
}
