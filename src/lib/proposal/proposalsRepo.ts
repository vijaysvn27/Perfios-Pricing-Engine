// Persistence for AM proposals (table `proposals`, migration 0026). Same
// graceful-degradation philosophy as src/lib/rateCard/repo.ts: if the table
// is missing (Postgres 42P01 / PostgREST PGRST205 — the migration may not be
// applied on every environment yet), every operation falls back to
// localStorage (key `perfios_proposals_<instanceId>`) and flags the result
// `persisted: false` so the UI can show a "saved locally only" banner.
// Only real data errors throw; "table missing" never does.
//
// The pure local-store helpers (readLocal/upsertLocal/duplicateLocal/
// removeLocal) take a StorageLike so they are unit-testable in a node
// environment with a stubbed storage object (see src/am/wizard.test.ts).

import { supabase } from '../supabase'
import { isMissingTable } from '../rateCard/repo'
import type { DealInputs } from '../engine2/types'
import type { Channel } from './clientSafe'

const TABLE = 'proposals'

const COLUMNS =
  'id,instance_id,customer_name,channel,internal_notes,validity_days,inputs,rate_card_version,totals,discount_shown,created_at,updated_at'

/** Everything the wizard captures, persisted in the `inputs` jsonb column.
 * Extends the engine's DealInputs so it can be fed straight to price(). */
export interface ProposalInputs extends DealInputs {
  compare_all_modes: boolean
  payment_terms: string // newline-separated bullets, prefilled from the spec copy
  special_terms: string
}

/** Summary numbers snapshot (the `totals` jsonb column) — for the list view
 * and for spotting drift when repricing against a newer rate card. */
export interface ProposalTotals {
  tco_years: number
  total_year1_inr: number
  total_recurring_inr: number
  total_tco_inr: number
  net_total_year1_inr: number
  net_total_tco_inr: number
}

/** What callers save. Timestamps are assigned by the store. */
export interface ProposalDraft {
  id: string
  instance_id: string
  customer_name: string
  channel: Channel // INTERNAL ONLY — never rendered client-side (D5)
  internal_notes: string
  validity_days: number
  inputs: ProposalInputs
  rate_card_version: number
  totals: ProposalTotals
  discount_shown: boolean
}

export interface ProposalRow extends ProposalDraft {
  created_at: string
  updated_at: string
}

export interface ListProposalsResult {
  rows: ProposalRow[]
  persisted: boolean
}

export interface GetProposalResult {
  row: ProposalRow | null
  persisted: boolean
}

export interface SaveProposalResult {
  row: ProposalRow
  persisted: boolean
}

// ---------------------------------------------------------------------------
// Local (browser) fallback store — pure helpers over an injectable storage.
// ---------------------------------------------------------------------------

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function localStorageKey(instanceId: string): string {
  return `perfios_proposals_${instanceId}`
}

function nowIso(): string {
  return new Date().toISOString()
}

export function newProposalId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function readLocal(store: StorageLike, instanceId: string): ProposalRow[] {
  const raw = store.getItem(localStorageKey(instanceId))
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ProposalRow[]) : []
  } catch {
    return []
  }
}

function writeLocal(store: StorageLike, instanceId: string, rows: ProposalRow[]): void {
  store.setItem(localStorageKey(instanceId), JSON.stringify(rows))
}

/** Insert-or-update by id. Keeps created_at on update; always bumps updated_at. */
export function upsertLocal(store: StorageLike, draft: ProposalDraft, now: string = nowIso()): ProposalRow {
  const rows = readLocal(store, draft.instance_id)
  const existing = rows.find((r) => r.id === draft.id)
  const row: ProposalRow = { ...draft, created_at: existing?.created_at ?? now, updated_at: now }
  writeLocal(store, draft.instance_id, [row, ...rows.filter((r) => r.id !== draft.id)])
  return row
}

export function duplicateLocal(
  store: StorageLike,
  instanceId: string,
  id: string,
  newId: string,
  now: string = nowIso(),
): ProposalRow | null {
  const rows = readLocal(store, instanceId)
  const src = rows.find((r) => r.id === id)
  if (!src) return null
  const copy: ProposalRow = {
    ...src,
    id: newId,
    customer_name: `${src.customer_name} (copy)`,
    created_at: now,
    updated_at: now,
  }
  writeLocal(store, instanceId, [copy, ...rows])
  return copy
}

export function removeLocal(store: StorageLike, instanceId: string, id: string): void {
  const rows = readLocal(store, instanceId)
  writeLocal(store, instanceId, rows.filter((r) => r.id !== id))
}

function browserStore(): StorageLike {
  return globalThis.localStorage
}

// ---------------------------------------------------------------------------
// Supabase-backed API (with the local fallback wired in).
// ---------------------------------------------------------------------------

/** All proposals for an instance, newest first. */
export async function listProposals(instanceId: string): Promise<ListProposalsResult> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('instance_id', instanceId)
    .order('updated_at', { ascending: false })

  if (error) {
    if (isMissingTable(error)) return { rows: readLocal(browserStore(), instanceId), persisted: false }
    throw new Error(`listProposals failed: ${error.message}`)
  }
  return { rows: (data ?? []) as ProposalRow[], persisted: true }
}

export async function getProposal(instanceId: string, id: string): Promise<GetProposalResult> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('instance_id', instanceId)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) {
      const row = readLocal(browserStore(), instanceId).find((r) => r.id === id) ?? null
      return { row, persisted: false }
    }
    throw new Error(`getProposal failed: ${error.message}`)
  }
  return { row: (data as ProposalRow | null) ?? null, persisted: true }
}

/**
 * Insert or update by id. Update-first (so an existing row's created_by is
 * never clobbered); inserts stamp created_by from the current session.
 */
export async function saveProposal(draft: ProposalDraft): Promise<SaveProposalResult> {
  const now = nowIso()
  const fields = {
    customer_name: draft.customer_name,
    channel: draft.channel,
    internal_notes: draft.internal_notes,
    validity_days: draft.validity_days,
    inputs: draft.inputs,
    rate_card_version: draft.rate_card_version,
    totals: draft.totals,
    discount_shown: draft.discount_shown,
    updated_at: now,
  }

  const { data: updated, error: updErr } = await supabase
    .from(TABLE)
    .update(fields)
    .eq('id', draft.id)
    .select('created_at')

  if (updErr) {
    if (isMissingTable(updErr)) return { row: upsertLocal(browserStore(), draft, now), persisted: false }
    throw new Error(`saveProposal failed: ${updErr.message}`)
  }
  if (updated && updated.length > 0) {
    return { row: { ...draft, created_at: (updated[0] as { created_at: string }).created_at, updated_at: now }, persisted: true }
  }

  const { data: auth } = await supabase.auth.getUser()
  const { error: insErr } = await supabase.from(TABLE).insert({
    id: draft.id,
    instance_id: draft.instance_id,
    ...fields,
    created_by: auth.user?.id ?? null,
    created_at: now,
  })
  if (insErr) {
    if (isMissingTable(insErr)) return { row: upsertLocal(browserStore(), draft, now), persisted: false }
    throw new Error(`saveProposal failed: ${insErr.message}`)
  }
  return { row: { ...draft, created_at: now, updated_at: now }, persisted: true }
}

/** Copy an existing proposal under a fresh id ("<customer> (copy)"). */
export async function duplicateProposal(instanceId: string, id: string): Promise<GetProposalResult> {
  const got = await getProposal(instanceId, id)
  if (!got.row) return { row: null, persisted: got.persisted }
  const draft: ProposalDraft = {
    ...got.row,
    id: newProposalId(),
    customer_name: `${got.row.customer_name} (copy)`,
  }
  const saved = await saveProposal(draft)
  return { row: saved.row, persisted: saved.persisted }
}

export async function removeProposal(instanceId: string, id: string): Promise<{ persisted: boolean }> {
  const { error } = await supabase.from(TABLE).delete().eq('instance_id', instanceId).eq('id', id)
  if (error) {
    if (isMissingTable(error)) {
      removeLocal(browserStore(), instanceId, id)
      return { persisted: false }
    }
    throw new Error(`removeProposal failed: ${error.message}`)
  }
  return { persisted: true }
}
