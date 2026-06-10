// Pure type contracts for the pricing engine.
// The engine's INPUT is a ConfigSnapshot (the live published config, read from
// config_versions.snapshot) plus user Selections. No Supabase types leak in here.

export type Frequency = 'recurring' | 'one_time'
export type ModuleKind = 'composite' | 'saas'
export type CmModel = 'perpetual' | 'subscription'
/**
 * How a module is priced. Additive metadata introduced in Stage 2 — the ENGINE
 * IGNORES it (Stage 1 math unchanged); validation and the admin UI use it.
 * - composite  : contributes fields to the unified composite base
 * - multiplier : ROPA-style, base x multiplier, one-time
 * - tier       : Consent-Manager-style, tier license (no fields) — exempt from
 *                the "module must have >= 1 field" validation rule
 */
export type PricingType = 'composite' | 'multiplier' | 'tier'

/** A priced line item (rate-card row). unit_price_inr is whole integer rupees. */
export interface FieldDef {
  field_key: string
  label: string
  unit_price_inr: number
  frequency: Frequency
  active: boolean
  sort_order: number
}

/**
 * A selectable module.
 * - kind 'composite'            -> contributes to the unified composite base.
 * - kind 'saas' + applies_multiplier -> ROPA-style bucket: base x multiplier, one-time, no amc.
 * - kind 'saas' + module_key 'CM'    -> Consent Manager bucket (tier-based).
 * deployment_pct / amc_pct are nullable per-module overrides reserved for a future
 * stage; the composite bucket reads its rates from settings (decision D1).
 */
export interface ModuleDef {
  module_key: string
  label: string
  kind: ModuleKind
  /** Additive (Stage 2); ignored by the engine. Drives validation + admin UI. */
  pricing_type: PricingType
  deployment_pct: number | null
  amc_pct: number | null
  multiplier: number | null
  applies_multiplier: boolean
  active: boolean
}

/** Tags a field to a module (the union of tags drives both pricing and questionnaire gating). */
export interface ModuleFieldTag {
  module_key: string
  field_key: string
}

export interface CmTier {
  tier_key: string
  label: string
  license_fee_inr: number
  amc_pct: number
  implementation_fee_inr: number
}

export interface Settings {
  currency: string
  /** Composite bucket deployment rate (e.g. 0.18). Single source of truth (D1). */
  deployment_pct: number
  /** Composite bucket amc rate (e.g. 0.12). */
  amc_pct: number
  /** When false (default, the sheet bug-fix), deployment does NOT recur into Year 2. */
  y2_includes_deployment: boolean
  cm_model: CmModel
  rounding: string
  /**
   * Export document copy (Excel hero + terms). Engine IGNORES these — they are
   * presentation content, not pricing. Optional so existing fixtures stay valid.
   */
  excel_hero?: string
  excel_terms?: string
}

/** The full published config the engine consumes. Mirrors config_versions.snapshot. */
export interface ConfigSnapshot {
  fields: FieldDef[]
  modules: ModuleDef[]
  module_fields: ModuleFieldTag[]
  cm_tiers: CmTier[]
  settings: Settings
}

export interface Selections {
  /** module_key list the user picked. */
  moduleKeys: string[]
  /** field_key -> integer quantity. Missing = 0. */
  quantities: Record<string, number>
  /** chosen CM tier_key, when CM is selected. */
  cmTier?: string | null
}

export interface LineItem {
  field_key: string
  label: string
  quantity: number
  unit_price_inr: number
  frequency: Frequency
  line_total: number
}

export type BucketKind = 'composite' | 'ropa' | 'cm'

export interface BucketBreakdown {
  kind: BucketKind
  module_keys: string[]
  lines: LineItem[]
  base_full: number
  base_recurring: number
  deployment: number
  amc: number
  multiplier?: number
  year1: number
  year2: number
  note?: string
}

/**
 * Engine output. `breakdown_for_admin_only` is for tests and the future admin
 * preview ONLY. The calculator UI must surface year1 / year2 and nothing else.
 */
export interface EngineResult {
  year1: number
  year2: number
  breakdown_for_admin_only: {
    buckets: BucketBreakdown[]
  }
}
