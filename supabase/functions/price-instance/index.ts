// Edge Function: server-side pricing for the no-login instance calculator.
//
// Security model (Stage 4 / Option B):
// - Reads the full rate-bearing snapshot ONLY here, server-side, via the
//   service-role RPC get_published_config(token). The browser never receives it.
// - Runs the SAME engine code as the app (src/lib/engine) + buildClientBreakdown
//   (src/lib/breakdown). At deploy time those files are bundled alongside this
//   handler (under ./engine and ./breakdown.ts) — the only adjustment is explicit
//   .ts import extensions, which Deno requires and the app already tolerates.
//   They are NOT a re-implementation; redeploy by bundling the current src files.
// - Returns ONLY Year 1/2 + the client-safe bucket breakdown. Never the snapshot,
//   never per-unit data, never breakdown_for_admin_only.
// - Validates selections server-side (numeric >= 0, known field keys only).
// - Invalid/inactive/regenerated tokens -> 404, no rates in any error output.

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

  const { data: snapshot, error } = await admin.rpc('get_published_config', { p_token: token })
  if (error || !snapshot) return json({ error: 'not available' }, 404)

  // deno-lint-ignore no-explicit-any
  const fieldKeys = new Set((snapshot.fields ?? []).map((f: any) => f.field_key))
  // deno-lint-ignore no-explicit-any
  const moduleKeysAll = new Set((snapshot.modules ?? []).map((m: any) => m.module_key))
  // deno-lint-ignore no-explicit-any
  const tierKeys = new Set((snapshot.cm_tiers ?? []).map((t: any) => t.tier_key))

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

  const result = calculatePricing(snapshot, { moduleKeys, quantities, cmTier })
  const breakdown = buildClientBreakdown(result, snapshot)

  return json({ year1: result.year1, year2: result.year2, breakdown })
})
