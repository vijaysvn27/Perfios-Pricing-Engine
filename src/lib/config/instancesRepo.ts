import { supabase } from '../supabase'

export interface InstanceRow {
  id: string
  name: string
  is_template: boolean
  share_token: string | null
  active: boolean
  created_at: string
}

/** All instances (admin only via RLS). Template first, then by creation order. */
export async function loadInstances(): Promise<InstanceRow[]> {
  const { data, error } = await supabase
    .from('instances')
    .select('id,name,is_template,share_token,active,created_at')
    .order('is_template', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as InstanceRow[]
}

/** instance_id -> live version_no, for the instances list. */
export async function loadLiveVersions(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('config_versions').select('instance_id,version_no').eq('is_live', true)
  if (error) throw new Error(error.message)
  const map: Record<string, number> = {}
  for (const r of (data ?? []) as { instance_id: string; version_no: number }[]) map[r.instance_id] = r.version_no
  return map
}

/** Clone an instance (usually the Template) into a new partner instance. Returns the new id. */
export async function cloneInstance(sourceId: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('clone_instance', { p_source: sourceId, p_name: name })
  if (error) throw new Error(error.message)
  return data as string
}

export async function renameInstance(instanceId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('rename_instance', { p_instance: instanceId, p_name: name })
  if (error) throw new Error(error.message)
}

/** Regenerate the share token (revokes the old link). Returns the new token. */
export async function regenerateToken(instanceId: string): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_token', { p_instance: instanceId })
  if (error) throw new Error(error.message)
  return data as string
}
