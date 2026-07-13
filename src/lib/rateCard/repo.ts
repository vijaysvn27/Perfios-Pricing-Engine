// Data access for the rate_cards table (supabase/migrations/0026_rate_cards.sql).
// One draft row (status='draft', version=0) plus an append-only history of
// published rows (status='published', version>=1) per instance — same
// draft/publish/rollback philosophy as src/lib/config/versions.ts, but
// table-query based (0026 defines no RPCs, unlike config_versions' RPC set).
//
// The migration may not be applied yet on every environment. Every read path
// here degrades to RATE_CARD_SEED (source: 'seed' / persisted: false) instead
// of throwing when the table is missing — the app must work read-only from
// the seed until 0026 lands. Only real data errors (not "table missing")
// throw.

import { supabase } from '../supabase'
import { RATE_CARD_SEED } from '../engine2/seed'
import type { RateCard } from '../engine2/types'
import { validateRateCard, type RateCardError } from './validate'

const TABLE = 'rate_cards'
const DRAFT_VERSION = 0

export type RateCardSource = 'supabase' | 'seed'

export interface PublishedRateCard {
  card: RateCard
  version: number
  source: RateCardSource
}

export interface DraftRateCard {
  card: RateCard
  persisted: boolean
}

export interface SaveDraftResult {
  persisted: boolean
}

export interface RateCardVersionRow {
  version: number
  created_at: string
  created_by: string | null
}

/** Thrown by publishDraft when the draft fails validateRateCard. Nothing is published. */
export class RateCardValidationError extends Error {
  readonly errors: RateCardError[]
  constructor(errors: RateCardError[]) {
    super(`Rate card is invalid: ${errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`)
    this.name = 'RateCardValidationError'
    this.errors = errors
  }
}

/**
 * True when a Postgrest/Postgres error means "the rate_cards table/migration
 * isn't there yet" — 42P01 is Postgres' "relation does not exist"; PGRST205
 * is PostgREST's schema-cache miss (thrown before the query reaches Postgres
 * when the table isn't in its cache, e.g. right after a fresh deploy).
 * Pure and exported so it's unit-testable without a live Supabase connection.
 */
export function isMissingTable(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  return typeof error.message === 'string' && error.message.includes('PGRST205')
}

/**
 * Pure: the next published version number after the current max (1 if none
 * published yet). Exported so the version-picking logic is unit-testable
 * without a live Supabase connection.
 */
export function nextVersionAfter(maxPublishedVersion: number | null | undefined): number {
  return (maxPublishedVersion ?? 0) + 1
}

/**
 * Snapshots saved by OLDER deploys can lack fields added since (usage_rates,
 * per-tier included_dp, ...). Normalize every snapshot loaded from Supabase
 * against the seed's shape so the app never crashes on an old-shape row:
 * missing top-level groups fall back to the seed's, and each tier is layered
 * over its seed counterpart (matched by tier_key) or given a 60%-of-cap
 * included_dp default. Exported for tests.
 */
export function normalizeRateCard(raw: unknown): RateCard {
  const partial = (raw ?? {}) as Partial<RateCard>
  const seed = RATE_CARD_SEED
  const saas = { ...seed.saas_cm, ...(partial.saas_cm ?? {}) }
  saas.tiers = (saas.tiers ?? seed.saas_cm.tiers).map((t) => {
    const seedTier = seed.saas_cm.tiers.find((s) => s.tier_key === t.tier_key)
    return {
      ...(seedTier ?? {}),
      ...t,
      included_dp:
        typeof t.included_dp === 'number' && t.included_dp > 0
          ? t.included_dp
          : (seedTier?.included_dp ?? Math.round(t.user_cap * 0.6)),
    }
  })
  return {
    onprem_cm: { ...seed.onprem_cm, ...(partial.onprem_cm ?? {}) },
    saas_cm: saas,
    estate: { ...seed.estate, ...(partial.estate ?? {}) },
    usage_rates: partial.usage_rates ?? seed.usage_rates,
  }
}

/**
 * Latest published rate card for an instance. Falls back to RATE_CARD_SEED
 * (version 0, source 'seed') if the table doesn't exist yet or nothing has
 * been published. Never throws for a missing table.
 */
export async function loadPublishedRateCard(instanceId: string): Promise<PublishedRateCard> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('version,snapshot')
    .eq('instance_id', instanceId)
    .eq('status', 'published')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) return { card: RATE_CARD_SEED, version: 0, source: 'seed' }
    throw new Error(`loadPublishedRateCard failed: ${error.message}`)
  }
  if (!data) return { card: RATE_CARD_SEED, version: 0, source: 'seed' }
  return { card: normalizeRateCard(data.snapshot), version: data.version, source: 'supabase' }
}

/**
 * The draft row's snapshot, creating a draft from the latest published card
 * (or the seed) if none exists yet. If the table is missing, returns an
 * in-memory draft flagged `persisted: false` instead of throwing.
 */
export async function loadDraft(instanceId: string): Promise<DraftRateCard> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('snapshot')
    .eq('instance_id', instanceId)
    .eq('status', 'draft')
    .eq('version', DRAFT_VERSION)
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) {
      const published = await loadPublishedRateCard(instanceId)
      return { card: published.card, persisted: false }
    }
    throw new Error(`loadDraft failed: ${error.message}`)
  }
  if (data) return { card: normalizeRateCard(data.snapshot), persisted: true }

  // No draft row yet: seed one from the latest published card (or the seed)
  // and try to persist it so subsequent edits have somewhere to land.
  const published = await loadPublishedRateCard(instanceId)
  const saved = await saveDraft(instanceId, published.card)
  return { card: published.card, persisted: saved.persisted }
}

/** Upsert the draft row. Skips silently (`persisted: false`) if the table is missing. */
export async function saveDraft(instanceId: string, card: RateCard): Promise<SaveDraftResult> {
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { instance_id: instanceId, status: 'draft', version: DRAFT_VERSION, snapshot: card },
      { onConflict: 'instance_id,status,version' },
    )

  if (error) {
    if (isMissingTable(error)) return { persisted: false }
    throw new Error(`saveDraft failed: ${error.message}`)
  }
  return { persisted: true }
}

/**
 * Validate the current draft and publish it as a new version
 * (max(published.version)+1). Throws RateCardValidationError — carrying the
 * validateRateCard errors — and publishes nothing if the draft is invalid.
 * Resets the draft row to mirror the freshly published snapshot afterwards.
 */
export async function publishDraft(instanceId: string): Promise<{ version: number }> {
  const draft = await loadDraft(instanceId)
  const errors = validateRateCard(draft.card)
  if (errors.length > 0) throw new RateCardValidationError(errors)

  const { data: maxRow, error: maxErr } = await supabase
    .from(TABLE)
    .select('version')
    .eq('instance_id', instanceId)
    .eq('status', 'published')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxErr) throw new Error(`publishDraft failed: ${maxErr.message}`)

  const version = nextVersionAfter(maxRow?.version)

  const { data: auth } = await supabase.auth.getUser()
  const { error: insertErr } = await supabase.from(TABLE).insert({
    instance_id: instanceId,
    status: 'published',
    version,
    snapshot: draft.card,
    created_by: auth.user?.id ?? null,
  })
  if (insertErr) throw new Error(`publishDraft failed: ${insertErr.message}`)

  // Draft always starts fresh from the latest live version (mirrors
  // config/versions.ts' reset-on-publish philosophy) — history stays
  // append-only, the draft row is just a working copy.
  await saveDraft(instanceId, draft.card)

  return { version }
}

/** All published versions for an instance, newest first. */
export async function listVersions(instanceId: string): Promise<RateCardVersionRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('version,created_at,created_by')
    .eq('instance_id', instanceId)
    .eq('status', 'published')
    .order('version', { ascending: false })
  if (error) throw new Error(`listVersions failed: ${error.message}`)
  return (data ?? []) as RateCardVersionRow[]
}

/**
 * Re-publish an old snapshot as a brand-new version. History is append-only
 * (mirrors config/versions.ts rollback semantics: rollback never rewrites or
 * deletes prior rows) — it stages the old snapshot as the draft, then runs
 * it through the normal publish path (so it's re-validated too).
 */
export async function rollback(instanceId: string, version: number): Promise<{ version: number }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('snapshot')
    .eq('instance_id', instanceId)
    .eq('status', 'published')
    .eq('version', version)
    .maybeSingle()
  if (error) throw new Error(`rollback failed: ${error.message}`)
  if (!data) throw new Error(`rollback failed: version ${version} not found`)

  await saveDraft(instanceId, normalizeRateCard(data.snapshot))
  return publishDraft(instanceId)
}
