// Per-user saved hero/terms. Stored in user_export_prefs (own-row RLS), so a
// partner's wording persists across sessions and customers until they change it.

import { supabase } from './supabase'

export interface ExportPrefs {
  hero: string
  terms: string
}

export async function loadMyExportPrefs(): Promise<ExportPrefs | null> {
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return null
  const { data, error } = await supabase
    .from('user_export_prefs')
    .select('hero,terms')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error || !data) return null
  return { hero: data.hero ?? '', terms: data.terms ?? '' }
}

export async function saveMyExportPrefs(prefs: ExportPrefs): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) throw new Error('Not signed in.')
  const { error } = await supabase.from('user_export_prefs').upsert(
    { user_id: user.id, hero: prefs.hero, terms: prefs.terms, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(error.message)
}
