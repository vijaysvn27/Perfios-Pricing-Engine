// Edge Function: persist a quote + a `pricing_download` event when the customer
// downloads the pricing Excel from the no-login calculator.
//
// Security model (Stage 5 Step 6 — mirrors price-instance):
// - Service role ONLY. Reads the full rate-bearing snapshot server-side via
//   get_published_config(token); the browser never receives it.
// - RECOMPUTES pricing with the SAME engine code as the app (src/lib/engine) +
//   buildClientBreakdown (src/lib/breakdown), bundled here exactly as for
//   price-instance. Client-supplied prices are NEVER trusted or stored — only the
//   server-recomputed year1/year2 + client-safe breakdown are persisted.
// - Validates selections server-side (numeric >= 0, known field/module/tier keys).
// - CAPS & sanitises the anon-supplied informational answers: known question_keys
//   only, bounded key count / value length / total size. Informational answers are
//   STORED ONLY here (for the admin) — they never appear on the customer's Excel.
// - Token-gated (share_token) + rate-limited 30/min/IP via hit_rate_limit.
//   Invalid/inactive token -> 404; no rates in any error output.
// - Writes go through the service-role client, bypassing RLS; the persistence
//   tables expose no anon read/write policy.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { calculatePricing } from './engine/index.ts'
import { buildClientBreakdown } from './breakdown.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

// Bounds for the anon-supplied informational answers (stored only).
const MAX_INFO_KEYS = 100
const MAX_INFO_VALUE_LEN = 1000
const MAX_INFO_JSON_BYTES = 8192
const MAX_NAME_LEN = 200

type InfoValue = string | number | boolean

/** Keep only known question_keys; coerce/bound values; cap count and total size. */
function sanitizeInfo(raw: unknown, knownKeys: Set<string>): Record<string, InfoValue> {
  const out: Record<string, InfoValue> = {}
  if (!raw || typeof raw !== 'object') return out
  let bytes = 2 // for "{}"
  let count = 0
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!knownKeys.has(k)) continue
    if (count >= MAX_INFO_KEYS) break
    let val: InfoValue
    if (typeof v === 'number' && Number.isFinite(v)) val = v
    else if (typeof v === 'boolean') val = v
    else if (typeof v === 'string') val = v.slice(0, MAX_INFO_VALUE_LEN)
    else continue
    const entryBytes = JSON.stringify(k).length + JSON.stringify(val).length + 2
    if (bytes + entryBytes > MAX_INFO_JSON_BYTES) break
    out[k] = val
    bytes += entryBytes
    count += 1
  }
  return out
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // deno-lint-ignore no-explicit-any
  let payload: any
  try { payload = await req.json() } catch { return json({ error: 'invalid request' }, 400) }

  const token = typeof payload?.token === 'string' ? payload.token : ''
  const sel = (payload && typeof payload.selections === 'object' && payload.selections) || {}
  if (!token) return json({ error: 'invalid request' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Rate limit: 30 requests / 60s per client IP (fail-open on RPC error).
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const { data: allowed } = await admin.rpc('hit_rate_limit', { p_bucket: `quote:${ip}`, p_max: 30, p_window_seconds: 60 })
  if (allowed === false) return json({ error: 'rate limit exceeded' }, 429)

  // Resolve the instance (service role bypasses RLS). Unknown/inactive token -> 404.
  const { data: inst } = await admin
    .from('instances')
    .select('id')
    .eq('share_token', token)
    .eq('active', true)
    .maybeSingle()
  if (!inst) return json({ error: 'not available' }, 404)
  const instanceId = inst.id as string

  const { data: snapshot, error } = await admin.rpc('get_published_config', { p_token: token })
  if (error || !snapshot) return json({ error: 'not available' }, 404)

  // deno-lint-ignore no-explicit-any
  const fieldKeys = new Set((snapshot.fields ?? []).map((f: any) => f.field_key))
  // deno-lint-ignore no-explicit-any
  const moduleKeysAll = new Set((snapshot.modules ?? []).map((m: any) => m.module_key))
  // deno-lint-ignore no-explicit-any
  const tierKeys = new Set((snapshot.cm_tiers ?? []).map((t: any) => t.tier_key))
  // deno-lint-ignore no-explicit-any
  const infoKeys = new Set((snapshot.informational_questions ?? []).map((q: any) => q.question_key))

  const moduleKeys = Array.isArray(sel.moduleKeys)
    ? sel.moduleKeys.filter((k: unknown) => typeof k === 'string' && moduleKeysAll.has(k))
    : []

  const quantities: Record<string, number> = {}
  const rawQ = (sel.quantities && typeof sel.quantities === 'object') ? sel.quantities : {}
  for (const [k, v] of Object.entries(rawQ)) {
    if (!fieldKeys.has(k)) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return json({ error: 'invalid quantity' }, 400)
    quantities[k] = Math.trunc(v)
  }

  const cmTier = (typeof sel.cmTier === 'string' && tierKeys.has(sel.cmTier)) ? sel.cmTier : null

  // Server-recomputed pricing — the ONLY prices we persist.
  const result = calculatePricing(snapshot, { moduleKeys, quantities, cmTier })
  const breakdown = buildClientBreakdown(result, snapshot)

  const info = sanitizeInfo(payload?.informationalAnswers, infoKeys)
  const name = typeof payload?.customerName === 'string'
    ? payload.customerName.trim().slice(0, MAX_NAME_LEN)
    : ''

  let customerId: string | null = null
  if (name) {
    const { data: cust } = await admin
      .from('customers')
      .upsert({ instance_id: instanceId, name }, { onConflict: 'instance_id,name' })
      .select('id')
      .single()
    customerId = cust?.id ?? null
  }

  const { data: quote, error: qErr } = await admin
    .from('quotes')
    .insert({
      instance_id: instanceId,
      customer_id: customerId,
      customer_name: name || null,
      module_keys: moduleKeys,
      quantities,
      cm_tier: cmTier,
      year1: result.year1,
      year2: result.year2,
      breakdown,
      informational_answers: info,
      status: 'created',
    })
    .select('id')
    .single()
  if (qErr || !quote) return json({ error: 'could not store quote' }, 500)

  await admin.from('quote_events').insert({
    instance_id: instanceId,
    customer_id: customerId,
    customer_name: name || null,
    event_type: 'pricing_download',
    quote_id: quote.id,
  })

  return json({ ok: true, quoteId: quote.id })
})
