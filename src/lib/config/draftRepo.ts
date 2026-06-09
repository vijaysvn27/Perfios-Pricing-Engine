import { supabase } from '../supabase'
import type { CmTier, FieldDef, ModuleDef, ModuleFieldTag, Settings } from '../engine'
import type { DraftState } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Read the full draft working set (the five normalized tables) into memory. */
export async function loadDraft(): Promise<DraftState> {
  const [fields, modules, mf, tiers, settings] = await Promise.all([
    supabase.from('fields').select('field_key,label,unit_price_inr,frequency,active,sort_order'),
    supabase.from('modules').select('module_key,label,kind,pricing_type,deployment_pct,amc_pct,multiplier,applies_multiplier,active'),
    supabase.from('module_fields').select('modules(module_key),fields(field_key)'),
    supabase.from('cm_tiers').select('tier_key,label,license_fee_inr,amc_pct,implementation_fee_inr'),
    supabase.from('settings').select('currency,deployment_pct,amc_pct,y2_includes_deployment,cm_model,rounding').eq('id', true).single(),
  ])
  const err = fields.error || modules.error || mf.error || tiers.error || settings.error
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
  }
}

export async function upsertField(f: FieldDef): Promise<void> {
  const { error } = await supabase.from('fields').upsert(f, { onConflict: 'field_key' })
  if (error) throw new Error(error.message)
}

export async function upsertModule(m: ModuleDef): Promise<void> {
  const { error } = await supabase.from('modules').upsert(m, { onConflict: 'module_key' })
  if (error) throw new Error(error.message)
}

export async function upsertTier(t: CmTier): Promise<void> {
  const { error } = await supabase.from('cm_tiers').upsert(t, { onConflict: 'tier_key' })
  if (error) throw new Error(error.message)
}

export async function saveSettings(s: Settings): Promise<void> {
  const { error } = await supabase.from('settings').update(s).eq('id', true)
  if (error) throw new Error(error.message)
}

/** Tag/untag a field to a module by keys (the RPC resolves UUIDs server-side). */
export async function setFieldTag(moduleKey: string, fieldKey: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_field_tag', {
    p_module_key: moduleKey,
    p_field_key: fieldKey,
    p_on: on,
  })
  if (error) throw new Error(error.message)
}
