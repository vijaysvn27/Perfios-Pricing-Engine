// Client-facing safety: channel and internal metadata are excluded from
// client renders BY TYPE (ClientSafeProposal has no channel field), and a
// blocklist scan backstops every generated string surface (D5 in the spec).
import type { DealInputs, ModeResult } from '../engine2/types'
import type { PricingOverrides } from './pricingOverrides'

/** DealInputs plus the one AM-wizard-only field format builders need to read
 * (pricing_overrides — see pricingOverrides.ts). Kept as a local extension
 * rather than importing ProposalInputs from proposalsRepo.ts, which would
 * create a circular type import (proposalsRepo.ts already imports Channel
 * from this file). */
type RecordInputs = DealInputs & { pricing_overrides?: PricingOverrides }

/** Partner / internal names that must never appear in client-facing output. */
export const CLIENT_BLOCKLIST: readonly string[] = [
  'aurva',
  'techjockey',
  'tech jockey',
  'pwc',
]

export type Channel = 'direct' | 'aurva' | 'techjockey' | 'pwc'

/**
 * One row of the transparent "Sizing Estimate" section (Honda "DSPM DAM
 * Sizing" pattern): a selected estate module's non-zero quantity × its
 * effective (override-aware) unit rate. Client-safe by design — Honda showed
 * unit rates transparently to the client, so this is not internal-only data
 * the way `channel`/`internal_notes` are.
 */
export interface SizingLine {
  label: string
  unit: string
  qty: number
  unit_rate_inr: number
  annual_inr: number
}

/**
 * A published, billed-on-actuals usage rate (e.g. OCR processing at
 * ₹1/document) — the rate card's `usage_rates`, carried onto the proposal so
 * formats can render a "Usage-Based Items" table (owner complaint: the
 * ₹1/OCR rate was missing from every proposal). Client-safe by design —
 * this is a published rate card, not internal pricing strategy.
 */
export interface UsageRateLine {
  label: string
  unit: string
  unit_price_inr: number
}

/** Full internal record: what the AM sees and what we persist. */
export interface ProposalRecord {
  id: string
  customer_name: string
  channel: Channel // internal only — stripped by toClientSafe
  internal_notes: string
  validity_days: number
  inputs: RecordInputs
  results: ModeResult[] // one entry, or three in compare mode — NEGOTIATED
  // (post-applyPricingOverrides) when pricing_overrides is present; identical
  // to list_results otherwise. See wizardLogic.buildRecord.
  discount_shown: boolean
  /** Optional: computed by wizardLogic.buildRecord (has the rate card in
   * scope); absent for records built without a rate card in hand. */
  sizing_lines?: SizingLine[]
  /** Optional: populated by wizardLogic.buildRecord from the rate card's
   * usage_rates (e.g. OCR). Absent for records built without a rate card. */
  usage_rates?: UsageRateLine[]
  /**
   * The pre-override ModeResult(s) (engine2's plain price()/priceAllModes()
   * output), parallel to `results` (same order/modes) — set ONLY when
   * pricing_overrides is present, so formats can render a "List vs
   * Negotiated" TOTAL row (see formats/shared.ts's totalRowInputs) without
   * re-pricing. Absent when there is nothing to negotiate: `results` already
   * IS the list in that case.
   */
  list_results?: ModeResult[]
}

/** What client render paths receive. No channel, no internal notes — by construction. */
export interface ClientSafeProposal {
  customer_name: string
  validity_days: number
  inputs: RecordInputs
  results: ModeResult[]
  discount_shown: boolean
  sizing_lines?: SizingLine[]
  usage_rates?: UsageRateLine[]
  list_results?: ModeResult[]
}

export function toClientSafe(p: ProposalRecord): ClientSafeProposal {
  return {
    customer_name: p.customer_name,
    validity_days: p.validity_days,
    inputs: p.inputs,
    results: p.results,
    discount_shown: p.discount_shown,
    sizing_lines: p.sizing_lines,
    usage_rates: p.usage_rates,
    list_results: p.list_results,
  }
}

/**
 * Scan any client-bound payload (render model, workbook cells, PDF text) for
 * blocklisted names. Returns the offending terms; empty array = safe.
 * Every export path must assert scanForBlocklist(...) is empty before write.
 */
export function scanForBlocklist(payload: unknown): string[] {
  const text = JSON.stringify(payload).toLowerCase()
  return CLIENT_BLOCKLIST.filter((term) => text.includes(term))
}
