import type { RateCard } from './types'

// Seed = Perfios_CM_Proposal_Builder.xlsx "Rate Card" sheet, verbatim, plus
// BOTH Consentick_OnPrem_Sizing_AllTiers.xlsx Summary cost columns (D1: the
// active basis is a setting, switchable in one click from the admin page).
// Default basis is saas_v3 as of 2026-07-13 (owner direction — see infra_basis
// comment below); onprem_ref remains fully supported and selectable.
export const RATE_CARD_SEED: RateCard = {
  onprem_cm: {
    slabs: [
      { slab_key: 'small', label: 'Small', dp_cap: 500_000, annual_licence_inr: 2_000_000 },
      { slab_key: 'mid', label: 'Mid', dp_cap: 2_500_000, annual_licence_inr: 3_000_000 },
      { slab_key: 'large', label: 'Large', dp_cap: 10_000_000, annual_licence_inr: 5_000_000 },
      { slab_key: 'group', label: 'Group', dp_cap: 999_999_999, annual_licence_inr: 85_000_000 },
    ],
    deployment_pct: 0.18,
    support_pct: 0.3,
  },
  saas_cm: {
    tiers: [
      { tier_key: 'tier0', label: 'Tier 0', user_cap: 500_000, infra_usd_mo_onprem_ref: 1347, infra_usd_mo_saas_v3: 650, overage_inr_per_user: 7 },
      { tier_key: '10l', label: '10L', user_cap: 1_000_000, infra_usd_mo_onprem_ref: 1549, infra_usd_mo_saas_v3: 950, overage_inr_per_user: 4 },
      { tier_key: '25l', label: '25L', user_cap: 2_500_000, infra_usd_mo_onprem_ref: 3671, infra_usd_mo_saas_v3: 1980, overage_inr_per_user: 3 },
      { tier_key: '50l', label: '50L', user_cap: 5_000_000, infra_usd_mo_onprem_ref: 4538, infra_usd_mo_saas_v3: 3089, overage_inr_per_user: 2 },
      { tier_key: '100l', label: '100L', user_cap: 10_000_000, infra_usd_mo_onprem_ref: 7543, infra_usd_mo_saas_v3: 5385, overage_inr_per_user: 2 },
    ],
    // 2026-07-13 (owner direction, supersedes D1's conservative default):
    // "overage is currently built with On-prem pricing and not the SaaS
    // infra charges" — the per-user/overage rate must reflect SaaS hosting
    // economics. saas_v3 at Tier-0 (committed 3,00,000) reprices to ₹7.59/DP,
    // matching the historical ₹7 Tier-0 overage rate. The admin one-click
    // switch back to onprem_ref remains available.
    infra_basis: 'saas_v3',
    fx_inr_per_usd: 83,
    sgna_uplift_pct: 0.2,
    annual_licence_inr: 1_500_000,
    implementation_pct: 0.15,
    y2_floor_pct: 0.3,
  },
  estate: {
    rates: [
      { rate_key: 'database', label: 'Database', unit: 'per database', unit_price_inr: 1_000, provisional: false, bucket: 'shared' },
      { rate_key: 'cloud_connector', label: 'Cloud connector', unit: 'per connector', unit_price_inr: 400_000, provisional: false, bucket: 'shared' },
      { rate_key: 'account', label: 'Account / subscription', unit: 'per account', unit_price_inr: 100_000, provisional: false, bucket: 'shared' },
      { rate_key: 'onprem_connector', label: 'On-prem connector', unit: 'per connector', unit_price_inr: 900_000, provisional: false, bucket: 'shared' },
      { rate_key: 'onprem_dc', label: 'On-prem data centre', unit: 'per DC', unit_price_inr: 300_000, provisional: false, bucket: 'shared' },
      { rate_key: 'gdrive_user', label: 'GDrive / OneDrive user', unit: 'per user', unit_price_inr: 800, provisional: false, bucket: 'dspm' },
      { rate_key: 'vm', label: 'Virtual machine', unit: 'per VM', unit_price_inr: 7_000, provisional: false, bucket: 'dspm' },
      { rate_key: 'sharepoint_site', label: 'SharePoint site', unit: 'per site', unit_price_inr: 12_000, provisional: false, bucket: 'dspm' },
      { rate_key: 'dam_dataset', label: 'DAM structured dataset', unit: 'per dataset', unit_price_inr: 150_000, provisional: false, bucket: 'dam' },
      { rate_key: 'endpoint_device', label: 'Endpoint device', unit: 'per device', unit_price_inr: 1_600, provisional: true, bucket: 'endpoint' },
    ],
    deployment_pct: 0.18,
    amc_pct: 0.12,
  },
}
