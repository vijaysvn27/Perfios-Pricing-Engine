// The deterministic, side-effect-free pricing engine.
//
// Architecture (decision D4): up to three INDEPENDENT buckets are computed and
// summed. The "shared field counted once" rule applies WITHIN the composite
// bucket only (via the union of tagged fields), never across buckets.
//
//   composite : DSPM / DATA_FLOW / DAM  -> union base -> deployment + amc
//   ropa      : ROPA_STANDALONE         -> base x multiplier, one-time, Year 2 = 0
//   cm        : CM                       -> tier license + implementation
//
// All money is integer rupees; percentages go through applyRatio (half-up).

import type {
  BucketBreakdown,
  ConfigSnapshot,
  EngineResult,
  FieldDef,
  LineItem,
  ModuleDef,
  Selections,
} from './types'
import { applyRatio } from './money'

/** Stable module keys the engine recognises for special handling. */
export const MODULE_KEY = {
  CM: 'CM',
  ROPA_STANDALONE: 'ROPA_STANDALONE',
} as const

function fieldMap(config: ConfigSnapshot): Map<string, FieldDef> {
  const m = new Map<string, FieldDef>()
  for (const f of config.fields) if (f.active) m.set(f.field_key, f)
  return m
}

/** Union of active field_keys tagged to the given modules, in rate-card sort order. */
function unionFieldKeys(config: ConfigSnapshot, moduleKeys: string[]): string[] {
  const fields = fieldMap(config)
  const wanted = new Set(moduleKeys)
  const seen = new Set<string>()
  for (const tag of config.module_fields) {
    if (wanted.has(tag.module_key) && fields.has(tag.field_key)) seen.add(tag.field_key)
  }
  return [...seen].sort((a, b) => {
    const fa = fields.get(a)!
    const fb = fields.get(b)!
    return fa.sort_order - fb.sort_order || fa.field_key.localeCompare(fb.field_key)
  })
}

function buildLines(
  config: ConfigSnapshot,
  fieldKeys: string[],
  quantities: Record<string, number>,
): LineItem[] {
  const fields = fieldMap(config)
  return fieldKeys.map((key) => {
    const f = fields.get(key)!
    const quantity = Math.max(0, Math.trunc(quantities[key] ?? 0))
    return {
      field_key: f.field_key,
      label: f.label,
      quantity,
      unit_price_inr: f.unit_price_inr,
      frequency: f.frequency,
      line_total: quantity * f.unit_price_inr,
    }
  })
}

function computeComposite(
  config: ConfigSnapshot,
  modules: ModuleDef[],
  quantities: Record<string, number>,
): BucketBreakdown {
  const { settings } = config
  const moduleKeys = modules.map((m) => m.module_key)
  const lines = buildLines(config, unionFieldKeys(config, moduleKeys), quantities)

  const baseFull = lines.reduce((s, l) => s + l.line_total, 0)
  // D3: one-time fields are part of Year 1 but must NOT recur into Year 2, and
  // generate no recurring maintenance. amc is therefore computed on the recurring base.
  const baseRecurring = lines
    .filter((l) => l.frequency === 'recurring')
    .reduce((s, l) => s + l.line_total, 0)

  const deployment = applyRatio(baseFull, settings.deployment_pct, settings.rounding)
  const amc = applyRatio(baseRecurring, settings.amc_pct, settings.rounding)

  const year1 = baseFull + deployment + amc
  const year2 = baseRecurring + amc + (settings.y2_includes_deployment ? deployment : 0)

  return {
    kind: 'composite',
    module_keys: moduleKeys,
    lines,
    base_full: baseFull,
    base_recurring: baseRecurring,
    deployment,
    amc,
    year1,
    year2,
  }
}

function computeRopa(
  config: ConfigSnapshot,
  module: ModuleDef,
  quantities: Record<string, number>,
): BucketBreakdown {
  const lines = buildLines(config, unionFieldKeys(config, [module.module_key]), quantities)
  const baseFull = lines.reduce((s, l) => s + l.line_total, 0)
  const multiplier = module.applies_multiplier ? (module.multiplier ?? 1) : 1
  const total = applyRatio(baseFull, multiplier, config.settings.rounding)

  return {
    kind: 'ropa',
    module_keys: [module.module_key],
    lines,
    base_full: baseFull,
    base_recurring: 0, // ROPA is one-time; nothing recurs
    deployment: 0,
    amc: 0,
    multiplier,
    year1: total,
    year2: 0,
    note: 'one-time; no amc; Year 2 = 0',
  }
}

function computeCm(config: ConfigSnapshot, tierKey: string): BucketBreakdown | null {
  const tier = config.cm_tiers.find((t) => t.tier_key === tierKey)
  if (!tier) return null
  const { settings } = config
  const license = tier.license_fee_inr
  const impl = tier.implementation_fee_inr
  const amc = applyRatio(license, tier.amc_pct, settings.rounding)

  let year1: number
  let year2: number
  if (settings.cm_model === 'perpetual') {
    year1 = license + impl
    year2 = amc
  } else {
    // subscription: Year 1 is implementation only; license recurs from Year 2.
    year1 = impl
    year2 = license
  }

  return {
    kind: 'cm',
    module_keys: [MODULE_KEY.CM],
    lines: [],
    base_full: license,
    base_recurring: license,
    deployment: 0,
    amc,
    year1,
    year2,
    note: `tier=${tier.tier_key}; model=${settings.cm_model}`,
  }
}

/**
 * Compute Year 1 and Year 2 base cost (integer rupees) for a set of selections
 * against a published config snapshot. Pure and deterministic.
 */
export function calculatePricing(
  config: ConfigSnapshot,
  selections: Selections,
): EngineResult {
  const chosen = new Set(selections.moduleKeys)
  const selected = config.modules.filter((m) => m.active && chosen.has(m.module_key))

  const composite = selected.filter((m) => m.kind === 'composite')
  const ropaModules = selected.filter(
    (m) => m.kind === 'saas' && m.applies_multiplier && m.module_key !== MODULE_KEY.CM,
  )
  const cmSelected = selected.some((m) => m.module_key === MODULE_KEY.CM)

  const buckets: BucketBreakdown[] = []

  if (composite.length > 0) {
    buckets.push(computeComposite(config, composite, selections.quantities))
  }
  for (const mod of ropaModules) {
    buckets.push(computeRopa(config, mod, selections.quantities))
  }
  if (cmSelected && selections.cmTier) {
    const cm = computeCm(config, selections.cmTier)
    if (cm) buckets.push(cm)
  }

  const year1 = buckets.reduce((s, b) => s + b.year1, 0)
  const year2 = buckets.reduce((s, b) => s + b.year2, 0)

  return { year1, year2, breakdown_for_admin_only: { buckets } }
}
