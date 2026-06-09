// A ConfigSnapshot built from the SAME values seeded into Supabase (seed.sql /
// config_versions v1). Tests run against this so the engine is exercised on the
// real published rate card. If the seed changes, change both together.

import type { ConfigSnapshot } from '../types'

export const seedSnapshot: ConfigSnapshot = {
  fields: [
    { field_key: 'db', label: 'Databases (SQL/Oracle/S3/file/BLOB)', unit_price_inr: 1000, frequency: 'recurring', active: true, sort_order: 10 },
    { field_key: 'cloud_connector', label: 'AWS/Azure cloud connector', unit_price_inr: 400000, frequency: 'recurring', active: true, sort_order: 20 },
    { field_key: 'account', label: 'Account / subscription', unit_price_inr: 100000, frequency: 'recurring', active: true, sort_order: 30 },
    { field_key: 'onprem_connector', label: 'On-prem connector', unit_price_inr: 900000, frequency: 'recurring', active: true, sort_order: 40 },
    { field_key: 'data_centre', label: 'On-prem data centre', unit_price_inr: 300000, frequency: 'recurring', active: true, sort_order: 50 },
    { field_key: 'gdrive_user', label: 'GDrive/OneDrive user', unit_price_inr: 800, frequency: 'recurring', active: true, sort_order: 60 },
    { field_key: 'vm', label: 'Virtual machine', unit_price_inr: 7000, frequency: 'recurring', active: true, sort_order: 70 },
    { field_key: 'sharepoint_site', label: 'SharePoint site', unit_price_inr: 12000, frequency: 'recurring', active: true, sort_order: 80 },
    { field_key: 'dam_dataset', label: 'DAM structured dataset', unit_price_inr: 150000, frequency: 'recurring', active: true, sort_order: 90 },
  ],
  modules: [
    { module_key: 'DSPM', label: 'DSPM', kind: 'composite', deployment_pct: null, amc_pct: null, multiplier: null, applies_multiplier: false, active: true },
    { module_key: 'DATA_FLOW', label: 'Data Flow (incl. ROPA)', kind: 'composite', deployment_pct: null, amc_pct: null, multiplier: null, applies_multiplier: false, active: true },
    { module_key: 'DAM', label: 'DAM', kind: 'composite', deployment_pct: null, amc_pct: null, multiplier: null, applies_multiplier: false, active: true },
    { module_key: 'ROPA_STANDALONE', label: 'ROPA only (SaaS gap analysis)', kind: 'saas', deployment_pct: null, amc_pct: null, multiplier: 0.7, applies_multiplier: true, active: true },
    { module_key: 'CM', label: 'Consent Manager', kind: 'saas', deployment_pct: null, amc_pct: null, multiplier: null, applies_multiplier: false, active: true },
  ],
  module_fields: [
    // SHARED PLATFORM tagged to every composite module + ROPA -> union counts it once.
    ...['DSPM', 'DATA_FLOW', 'DAM', 'ROPA_STANDALONE'].flatMap((m) =>
      ['db', 'cloud_connector', 'account', 'onprem_connector', 'data_centre'].map((f) => ({ module_key: m, field_key: f })),
    ),
    { module_key: 'DSPM', field_key: 'gdrive_user' },
    { module_key: 'DSPM', field_key: 'sharepoint_site' },
    { module_key: 'DATA_FLOW', field_key: 'vm' },
    { module_key: 'ROPA_STANDALONE', field_key: 'vm' },
    { module_key: 'DAM', field_key: 'dam_dataset' },
  ],
  cm_tiers: [
    { tier_key: 'small', label: 'Small', license_fee_inr: 2000000, amc_pct: 0.3, implementation_fee_inr: 0 },
    { tier_key: 'mid', label: 'Mid', license_fee_inr: 3000000, amc_pct: 0.3, implementation_fee_inr: 0 },
    { tier_key: 'large', label: 'Large', license_fee_inr: 5000000, amc_pct: 0.3, implementation_fee_inr: 0 },
    { tier_key: 'group', label: 'Group', license_fee_inr: 85000000, amc_pct: 0.3, implementation_fee_inr: 0 },
  ],
  settings: {
    currency: 'INR',
    deployment_pct: 0.18,
    amc_pct: 0.12,
    y2_includes_deployment: false,
    cm_model: 'perpetual',
    rounding: 'half_up',
  },
}

/** Quantity helper: 1 of every field in the rate card. */
export const allOnes: Record<string, number> = Object.fromEntries(
  seedSnapshot.fields.map((f): [string, number] => [f.field_key, 1]),
)
