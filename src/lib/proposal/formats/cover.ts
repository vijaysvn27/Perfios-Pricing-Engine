// Branded cover block (item 3 of the revamp): a deterministic function of the
// customer name, validity, and an as-of date threaded in by the caller — NOT
// computed with Date.now()/Math.random() inside this pure lib module, so the
// same inputs always produce the same reference (and the value is trivially
// testable). Real callers (Step4Present) pass today's date; tests pass a
// fixed string.
import type { ClientSafeProposal } from '../clientSafe'
import type { ProposalCover } from './types'

/**
 * First letter of each whitespace-separated word in the customer name,
 * uppercased, capped at 4 characters. Falls back to "CX" for a blank name so
 * the reference is never malformed while the AM is still typing (Step 1).
 */
export function customerInitials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (letters || 'CX').slice(0, 4)
}

/**
 * Deterministic reference code, e.g. "PER/DPDP/2026/AA" — same customer name
 * + as-of date always yields the same reference (D-item 3: no randomness).
 */
export function buildReference(customerName: string, asOfDate: string): string {
  const year = asOfDate.slice(0, 4) || 'YYYY'
  return `PER/DPDP/${year}/${customerInitials(customerName)}`
}

/** Build the cover block for a render model. `title` is the format's own title
 * (e.g. "Commercial Proposal") so the cover band and the document agree. */
export function buildCover(p: ClientSafeProposal, asOfDate: string, title: string): ProposalCover {
  return {
    logo: true,
    title,
    customer: p.customer_name,
    date_label: asOfDate,
    validity_days: p.validity_days,
    reference: buildReference(p.customer_name, asOfDate),
  }
}
