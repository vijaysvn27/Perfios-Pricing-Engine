// "Infrastructure You Provide" annexure data for On-Prem / Hybrid proposals
// (D2 in the revamp design). Source of truth:
// C:\Users\vijay.narayanan\Documents\CM-Demo flow\Consentick_OnPrem_Sizing_AllTiers.xlsx
// sheets 5L / 10L / 25L / 50L / 100L, "PRIMARY SITE" and "COLD DR SITE"
// component tables (rows 9-15 and 19-21 of each sheet).
//
// Deliberately excluded:
//  - the "ALB + S3 + WAF (managed)" row on every sheet — a cloud-managed
//    service, not client-hosted hardware.
//  - every $/mo cost column and the "Grand Total" / subtotal rows — this is
//    a client-facing spec annexure, never our reference cost.
//
// Sheet -> tier mapping matches SaasTier.tier_key in engine2/seed.ts
// (5L -> tier0, 10L -> '10l', 25L -> '25l', 50L -> '50l', 100L -> '100l').
//
// Known upstream inconsistencies in the sizing workbook (flagged, not
// corrected here — see spec §11 "Risks/open items"): the 100L CM Bridge pods
// are smaller than the 50L ones, and the 25L cold-DR Redis replica is larger
// than its own primary-site Redis sentinel. Both are carried through as-is;
// pricing does not depend on individual BOM rows (it keys off tier totals),
// only the annexure display does.

import type { SaasTier } from '../engine2/types'
import { RATE_CARD_SEED } from '../engine2/seed'

export interface BomRow {
  component: string
  site: 'primary' | 'dr'
  nodes: number
  vcpu: number
  ram_gb: number
  storage: string
}

export type OnPremBomTierKey = 'tier0' | '10l' | '25l' | '50l' | '100l'

const NO_DISK = '—' // cache-tier nodes (Redis) carry no persistent disk in the sizing sheet

const TIER0_5L: BomRow[] = [
  { component: 'K8s control plane', site: 'primary', nodes: 3, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' },
  { component: 'CM API pods', site: 'primary', nodes: 2, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' },
  { component: 'CM Bridge pods', site: 'primary', nodes: 2, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' },
  { component: 'Nginx / ingress HA', site: 'primary', nodes: 2, vcpu: 2, ram_gb: 4, storage: '30 GB SSD' },
  { component: 'MySQL primary + standby', site: 'primary', nodes: 2, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' },
  { component: 'MongoDB PSS replica set', site: 'primary', nodes: 3, vcpu: 2, ram_gb: 16, storage: '250 GB NVMe' },
  { component: 'Redis sentinel (3-node)', site: 'primary', nodes: 3, vcpu: 1, ram_gb: 6, storage: NO_DISK },
  { component: 'MySQL async replica (cold)', site: 'dr', nodes: 1, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' },
  { component: 'MongoDB hidden replica (cold)', site: 'dr', nodes: 1, vcpu: 2, ram_gb: 16, storage: '250 GB NVMe' },
  { component: 'Redis replica (cold)', site: 'dr', nodes: 1, vcpu: 1, ram_gb: 6, storage: NO_DISK },
]

const TIER_10L: BomRow[] = [
  { component: 'K8s control plane', site: 'primary', nodes: 3, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' },
  { component: 'CM API pods', site: 'primary', nodes: 2, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' },
  { component: 'CM Bridge pods', site: 'primary', nodes: 2, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' },
  { component: 'Nginx / ingress HA', site: 'primary', nodes: 2, vcpu: 2, ram_gb: 4, storage: '30 GB SSD' },
  { component: 'MySQL primary + standby', site: 'primary', nodes: 2, vcpu: 2, ram_gb: 8, storage: '200 GB SSD' },
  { component: 'MongoDB PSS replica set', site: 'primary', nodes: 3, vcpu: 2, ram_gb: 16, storage: '500 GB NVMe' },
  { component: 'Redis sentinel (3-node)', site: 'primary', nodes: 3, vcpu: 2, ram_gb: 13, storage: NO_DISK },
  { component: 'MySQL async replica (cold)', site: 'dr', nodes: 1, vcpu: 2, ram_gb: 8, storage: '200 GB SSD' },
  { component: 'MongoDB hidden replica (cold)', site: 'dr', nodes: 1, vcpu: 2, ram_gb: 16, storage: '500 GB NVMe' },
  { component: 'Redis replica (cold)', site: 'dr', nodes: 1, vcpu: 2, ram_gb: 13, storage: NO_DISK },
]

const TIER_25L: BomRow[] = [
  { component: 'K8s control plane', site: 'primary', nodes: 3, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' },
  { component: 'CM API pods', site: 'primary', nodes: 2, vcpu: 4, ram_gb: 16, storage: '100 GB SSD' },
  { component: 'CM Bridge pods', site: 'primary', nodes: 2, vcpu: 4, ram_gb: 16, storage: '100 GB SSD' },
  { component: 'Nginx / ingress HA', site: 'primary', nodes: 2, vcpu: 2, ram_gb: 8, storage: '30 GB SSD' },
  { component: 'MySQL primary + standby', site: 'primary', nodes: 2, vcpu: 8, ram_gb: 32, storage: '1 TB NVMe' },
  { component: 'MongoDB PSS replica set', site: 'primary', nodes: 3, vcpu: 8, ram_gb: 64, storage: '2 TB NVMe' },
  { component: 'Redis sentinel (3-node)', site: 'primary', nodes: 3, vcpu: 2, ram_gb: 16, storage: NO_DISK },
  { component: 'MySQL async replica (cold)', site: 'dr', nodes: 1, vcpu: 8, ram_gb: 32, storage: '1 TB NVMe' },
  { component: 'MongoDB hidden replica (cold)', site: 'dr', nodes: 1, vcpu: 8, ram_gb: 64, storage: '2 TB NVMe' },
  // Sizing-sheet inconsistency (spec §11): this DR Redis node is larger than
  // the primary-site Redis sentinel above. Carried through as-is.
  { component: 'Redis replica (cold)', site: 'dr', nodes: 1, vcpu: 4, ram_gb: 32, storage: NO_DISK },
]

const TIER_50L: BomRow[] = [
  { component: 'K8s control plane', site: 'primary', nodes: 3, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' },
  { component: 'CM API pods', site: 'primary', nodes: 2, vcpu: 8, ram_gb: 32, storage: '100 GB SSD' },
  { component: 'CM Bridge pods', site: 'primary', nodes: 2, vcpu: 8, ram_gb: 32, storage: '100 GB SSD' },
  { component: 'Nginx / ingress HA', site: 'primary', nodes: 2, vcpu: 2, ram_gb: 8, storage: '30 GB SSD' },
  { component: 'MySQL primary + standby', site: 'primary', nodes: 2, vcpu: 8, ram_gb: 32, storage: '1 TB NVMe' },
  { component: 'MongoDB PSS replica set', site: 'primary', nodes: 3, vcpu: 8, ram_gb: 64, storage: '2 TB NVMe' },
  { component: 'Redis sentinel (3-node)', site: 'primary', nodes: 3, vcpu: 4, ram_gb: 32, storage: NO_DISK },
  { component: 'MySQL async replica (cold)', site: 'dr', nodes: 1, vcpu: 8, ram_gb: 32, storage: '1 TB NVMe' },
  { component: 'MongoDB hidden replica (cold)', site: 'dr', nodes: 1, vcpu: 8, ram_gb: 64, storage: '2 TB NVMe' },
  { component: 'Redis replica (cold)', site: 'dr', nodes: 1, vcpu: 4, ram_gb: 32, storage: NO_DISK },
]

const TIER_100L: BomRow[] = [
  { component: 'K8s control plane', site: 'primary', nodes: 3, vcpu: 2, ram_gb: 8, storage: '100 GB SSD' },
  { component: 'CM API pods', site: 'primary', nodes: 2, vcpu: 8, ram_gb: 32, storage: '100 GB SSD' },
  // Sizing-sheet inconsistency (spec §11): these Bridge pods are smaller than
  // the 50L tier's. Carried through as-is.
  { component: 'CM Bridge pods', site: 'primary', nodes: 3, vcpu: 4, ram_gb: 16, storage: '100 GB SSD' },
  { component: 'Nginx / ingress HA', site: 'primary', nodes: 2, vcpu: 4, ram_gb: 16, storage: '30 GB SSD' },
  { component: 'MySQL primary + standby', site: 'primary', nodes: 2, vcpu: 16, ram_gb: 64, storage: '2 TB NVMe' },
  { component: 'MongoDB PSS replica set', site: 'primary', nodes: 3, vcpu: 16, ram_gb: 128, storage: '4 TB NVMe' },
  { component: 'Redis sentinel (3-node)', site: 'primary', nodes: 3, vcpu: 8, ram_gb: 64, storage: NO_DISK },
  { component: 'MySQL async replica (cold)', site: 'dr', nodes: 1, vcpu: 16, ram_gb: 64, storage: '2 TB NVMe' },
  { component: 'MongoDB hidden replica (cold)', site: 'dr', nodes: 1, vcpu: 16, ram_gb: 128, storage: '4 TB NVMe' },
  { component: 'Redis replica (cold)', site: 'dr', nodes: 1, vcpu: 8, ram_gb: 64, storage: NO_DISK },
]

export const ONPREM_BOM: Record<OnPremBomTierKey, BomRow[]> = {
  tier0: TIER0_5L,
  '10l': TIER_10L,
  '25l': TIER_25L,
  '50l': TIER_50L,
  '100l': TIER_100L,
}

/** DR strategy + traffic-model assumption, carried verbatim (in substance)
 * from every sheet's header rows 3 and 5 — identical across all five tiers. */
export const BOM_NOTES =
  'DR strategy: Cold standby — data replication only, no active compute at the DR site. ' +
  'RPO < 15 min | RTO ~1–2 hr. ' +
  'Traffic-model assumption: sized at 30% MAU, 20% peak-day concentration, 2.5× burst multiplier over average TPS.'

/**
 * The On-Prem slab -> tier mapping for annexures: the smallest SaaS/On-Prem
 * tier whose user_cap is >= the deal's DP base (same "first cap that fits"
 * rule used for on-prem CM slabs and SaaS CM tiers in engine2). Falls back to
 * the largest tier (the catch-all) if dp_base exceeds every cap.
 */
export function tierKeyForDpBase(dpBase: number): OnPremBomTierKey {
  const tiers: SaasTier[] = RATE_CARD_SEED.saas_cm.tiers
  const match = tiers.find((t) => dpBase <= t.user_cap)
  const key = (match ?? tiers[tiers.length - 1]).tier_key
  return key as OnPremBomTierKey
}

/** BOM rows for the tier that matches a deal's DP base. */
export function bomForDpBase(dpBase: number): BomRow[] {
  return ONPREM_BOM[tierKeyForDpBase(dpBase)]
}
