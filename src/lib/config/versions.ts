import { supabase } from '../supabase'
import type { ConfigSnapshot } from '../engine'

export interface VersionRow {
  version_no: number
  published_by: string | null
  published_at: string
  is_live: boolean
}

export async function listVersions(): Promise<VersionRow[]> {
  const { data, error } = await supabase
    .from('config_versions')
    .select('version_no,published_by,published_at,is_live')
    .order('version_no', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as VersionRow[]
}

/** Publish the client-built snapshot as a new live version. Returns its number. */
export async function publish(snapshot: ConfigSnapshot, publishedBy: string): Promise<number> {
  const { data, error } = await supabase.rpc('publish_snapshot', {
    p_snapshot: snapshot,
    p_published_by: publishedBy,
  })
  if (error) throw new Error(error.message)
  return data as number
}

export async function rollback(versionNo: number): Promise<void> {
  const { error } = await supabase.rpc('rollback_to_version', { p_version_no: versionNo })
  if (error) throw new Error(error.message)
}

export async function resetDraftToLive(): Promise<void> {
  const { error } = await supabase.rpc('reset_draft_to_live')
  if (error) throw new Error(error.message)
}
