import { supabase } from '../supabase'
import type { CmTier, FieldDef, InformationalQuestion, ModuleDef, ModuleFieldTag, Settings } from '../engine'
import type { DraftState } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

const FIELD_COLS = 'field_key,label,unit_price_inr,frequency,active,sort_order,question_text,example,why_text,section,section_sort,item_sort'
const INFO_COLS = 'question_key,question_text,example,why_text,answer_type,options,section,section_sort,item_sort,active'

/** Read one instance's draft working set into memory. */
export async function loadDraft(instanceId: string): Promise<DraftState> {
  const [fields, modules, mf, tiers, settings, info] = await Promise.all([
    supabase.from('fields').select(FIELD_COLS).eq('instance_id', instanceId),
    supabase.from('modules').select('module_key,label,kind,pricing_type,deployment_pct,amc_pct,multiplier,applies_multiplier,active').eq('instance_id', instanceId),
    supabase.from('module_fields').select('modules(module_key),fields(field_key)').eq('instance_id', instanceId),
    supabase.from('cm_tiers').select('tier_key,label,license_fee_inr,amc_pct,implementation_fee_inr').eq('instance_id', instanceId),
    supabase.from('settings').select('currency,deployment_pct,amc_pct,y2_includes_deployment,cm_model,rounding,excel_hero,excel_terms').eq('instance_id', instanceId).single(),
    supabase.from('informational_questions').select(INFO_COLS).eq('instance_id', instanceId),
  ])
  const err = fields.error || modules.error || mf.error || tiers.error || settings.error || info.error
  if (err) throw new Error(`loadDraft failed: ${err.message}`)

  const module_fields: ModuleFieldTag[] = (mf.data ?? []).map((r: any) => {
    const m = Array.isArray(r.modules) ? r.modules[0] : r.modules
    const f = Array.isArray(r.fields) ? r.fields[0] : r.fields
    return { module_key: m.module_key, field_key: f.field_key }
  })

  return {
    fields: (fields.data ?? []) as FieldDef[],
    modules: (modules.data ?? []) as ModuleDef[],
    module_fields,
    cm_tiers: (tiers.data ?? []) as CmTier[],
    settings: settings.data as Settings,
    informational_questions: (info.data ?? []) as InformationalQuestion[],
  }
}

export async function upsertInformationalQuestion(instanceId: string, q: InformationalQuestion): Promise<void> {
  const { error } = await supabase.from('informational_questions').upsert({ ...q, instance_id: instanceId }, { onConflict: 'instance_id,question_key' })
  if (error) throw new Error(error.message)
}

export async function deleteInformationalQuestion(instanceId: string, questionKey: string): Promise<void> {
  const { error } = await supabase.from('informational_questions').delete().eq('instance_id', instanceId).eq('question_key', questionKey)
  if (error) throw new Error(error.message)
}

export async function upsertField(instanceId: string, f: FieldDef): Promise<void> {
  const { error } = await supabase.from('fields').upsert({ ...f, instance_id: instanceId }, { onConflict: 'instance_id,field_key' })
  if (error) throw new Error(error.message)
}

export async function upsertModule(instanceId: string, m: ModuleDef): Promise<void> {
  const { error } = await supabase.from('modules').upsert({ ...m, instance_id: instanceId }, { onConflict: 'instance_id,module_key' })
  if (error) throw new Error(error.message)
}

export async function upsertTier(instanceId: string, t: CmTier): Promise<void> {
  const { error } = await supabase.from('cm_tiers').upsert({ ...t, instance_id: instanceId }, { onConflict: 'instance_id,tier_key' })
  if (error) throw new Error(error.message)
}

export async function saveSettings(instanceId: string, s: Settings): Promise<void> {
  const { error } = await supabase.from('settings').update(s).eq('instance_id', instanceId)
  if (error) throw new Error(error.message)
}

/** Tag/untag a field to a module by keys (the RPC resolves UUIDs server-side, scoped to the instance). */
export async function setFieldTag(instanceId: string, moduleKey: string, fieldKey: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_field_tag', {
    p_instance: instanceId,
    p_module_key: moduleKey,
    p_field_key: fieldKey,
    p_on: on,
  })
  if (error) throw new Error(error.message)
}
