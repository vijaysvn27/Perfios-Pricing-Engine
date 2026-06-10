// No-login public API for the instance calculator. The browser NEVER receives the
// rate-bearing snapshot: get_public_form returns a price-stripped structure, and
// price-instance (Edge Function) runs the engine server-side and returns only the
// Year 1/2 totals + the client-safe bucket breakdown.

import { supabase } from './supabase'
import type { ClientBreakdown } from './breakdown'
import type { InformationalQuestion } from './engine/types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://nljbzqcfcyltxroafloe.supabase.co'
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_uwkF6hYsL-F_CAM7jv5byw_VeuAqLES'

export interface PublicModule {
  module_key: string
  label: string
  kind: string
  pricing_type: string
  applies_multiplier: boolean
  active: boolean
}
export interface PublicField {
  field_key: string
  label: string
  sort_order: number
  active: boolean
  // Questionnaire help (Stage 5). Price-stripped & optional — the engine/pricing
  // never read these; they only drive the on-screen + Excel questionnaire copy.
  question_text?: string | null
  example?: string | null
  why_text?: string | null
  section?: string | null
  section_sort?: number
  item_sort?: number
}
/**
 * Informational (non-priced) question returned by get_public_form. Identical shape
 * to the engine's InformationalQuestion — it carries no prices, so the public and
 * full versions coincide. CONTEXT ONLY: never affects pricing.
 */
export type PublicInformationalQuestion = InformationalQuestion
export interface PublicForm {
  instance_name: string
  modules: PublicModule[]
  fields: PublicField[]
  module_fields: { module_key: string; field_key: string }[]
  cm_tiers: { tier_key: string; label: string }[]
  informational_questions: PublicInformationalQuestion[]
  excel_hero: string | null
  excel_terms: string | null
}

export interface PriceResult {
  year1: number
  year2: number
  breakdown: ClientBreakdown
}

export interface PublicSelections {
  moduleKeys: string[]
  quantities: Record<string, number>
  cmTier: string | null
}

/** Price-stripped form to render the questionnaire/inputs (no rates). */
export async function getPublicForm(token: string): Promise<PublicForm | null> {
  const { data, error } = await supabase.rpc('get_public_form', { p_token: token })
  if (error) throw new Error('Could not load this pricing form.')
  return (data as PublicForm | null) ?? null
}

/** Server-side pricing. Returns ONLY totals + client-safe breakdown. */
export async function priceInstance(token: string, selections: PublicSelections): Promise<PriceResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/price-instance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ token, selections }),
  })
  if (!res.ok) throw new Error('Could not calculate pricing for this link.')
  return (await res.json()) as PriceResult
}

export interface StoreQuotePayload {
  selections: PublicSelections
  customerName: string
  /** Stored only (for the admin) — never on the customer's pricing Excel. */
  informationalAnswers: Record<string, string | number | boolean>
}

/**
 * Persist a quote + a `pricing_download` event when the customer downloads the
 * pricing Excel. The Edge Function RECOMPUTES pricing server-side; client prices are
 * never trusted. Best-effort: the download itself must never be blocked by this, so
 * the caller fires it without awaiting success and ignores failures.
 */
export async function storeQuote(token: string, payload: StoreQuotePayload): Promise<void> {
  await fetch(`${SUPABASE_URL}/functions/v1/store-quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ token, ...payload }),
  })
}

/**
 * Log a lightweight client event (currently `questionnaire_download`) via the
 * rate-limited, anon-callable RPC. Best-effort — failures are ignored by the caller.
 */
export async function logQuoteEvent(token: string, eventType: string, customerName: string): Promise<void> {
  const { error } = await supabase.rpc('log_quote_event', {
    p_token: token,
    p_event_type: eventType,
    p_customer_name: customerName || null,
  })
  if (error) throw new Error(error.message)
}
