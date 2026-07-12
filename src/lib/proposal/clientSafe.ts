// Client-facing safety: channel and internal metadata are excluded from
// client renders BY TYPE (ClientSafeProposal has no channel field), and a
// blocklist scan backstops every generated string surface (D5 in the spec).
import type { DealInputs, ModeResult } from '../engine2/types'

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

/** Full internal record: what the AM sees and what we persist. */
export interface ProposalRecord {
  id: string
  customer_name: string
  channel: Channel // internal only — stripped by toClientSafe
  internal_notes: string
  validity_days: number
  inputs: DealInputs
  results: ModeResult[] // one entry, or three in compare mode
  discount_shown: boolean
  /** Optional: computed by wizardLogic.buildRecord (has the rate card in
   * scope); absent for records built without a rate card in hand. */
  sizing_lines?: SizingLine[]
}

/** What client render paths receive. No channel, no internal notes — by construction. */
export interface ClientSafeProposal {
  customer_name: string
  validity_days: number
  inputs: DealInputs
  results: ModeResult[]
  discount_shown: boolean
  sizing_lines?: SizingLine[]
}

export function toClientSafe(p: ProposalRecord): ClientSafeProposal {
  return {
    customer_name: p.customer_name,
    validity_days: p.validity_days,
    inputs: p.inputs,
    results: p.results,
    discount_shown: p.discount_shown,
    sizing_lines: p.sizing_lines,
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
