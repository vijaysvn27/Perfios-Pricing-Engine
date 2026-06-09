import { useEffect, useMemo, useState } from 'react'
import { calculatePricing, MODULE_KEY } from '../lib/engine'
import type { ConfigSnapshot, EngineResult, FieldDef } from '../lib/engine'
import { loadLiveConfig } from '../lib/supabase'
import { formatINR } from '../lib/format'

export default function Calculator() {
  const [config, setConfig] = useState<ConfigSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [cmTier, setCmTier] = useState<string>('')
  const [result, setResult] = useState<EngineResult | null>(null)

  useEffect(() => {
    loadLiveConfig()
      .then(setConfig)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
  }, [])

  // Quantity questions = union of fields tagged to the selected modules (gating).
  const visibleFields: FieldDef[] = useMemo(() => {
    if (!config) return []
    const fieldByKey = new Map(config.fields.map((f) => [f.field_key, f]))
    const keys = new Set<string>()
    for (const tag of config.module_fields) {
      if (selected.has(tag.module_key) && fieldByKey.has(tag.field_key)) keys.add(tag.field_key)
    }
    return [...keys]
      .map((k) => fieldByKey.get(k)!)
      .filter((f) => f.active)
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [config, selected])

  const cmSelected = selected.has(MODULE_KEY.CM)

  function toggleModule(key: string) {
    setResult(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function setQuantity(fieldKey: string, value: string) {
    setResult(null)
    const n = Math.max(0, Math.trunc(Number(value) || 0))
    setQuantities((prev) => ({ ...prev, [fieldKey]: n }))
  }

  function onCalculate() {
    if (!config) return
    setResult(
      calculatePricing(config, {
        moduleKeys: [...selected],
        quantities,
        cmTier: cmSelected ? cmTier || null : null,
      }),
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Could not load pricing configuration: {loadError}
        </div>
      </div>
    )
  }

  if (!config) {
    return <div className="mx-auto max-w-2xl p-8 text-slate-500">Loading pricing configuration…</div>
  }

  const modules = config.modules.filter((m) => m.active)
  const canCalculate = selected.size > 0 && (!cmSelected || cmTier !== '')

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-perfios-blue">Perfios Pricing Calculator</h1>
        <p className="mt-1 text-sm text-slate-500">
          Select modules, answer the quantity questions, and calculate the base cost.
        </p>
      </header>

      {/* Step 1 — modules */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          1. Choose modules
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {modules.map((m) => {
            const on = selected.has(m.module_key)
            return (
              <button
                key={m.module_key}
                type="button"
                onClick={() => toggleModule(m.module_key)}
                className={
                  'rounded-lg border px-4 py-3 text-left text-sm font-medium transition ' +
                  (on
                    ? 'border-perfios-blue bg-perfios-blue text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-perfios-blue')
                }
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* Step 2 — quantities + CM tier */}
      {(visibleFields.length > 0 || cmSelected) && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            2. Quantities
          </h2>
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            {cmSelected && (
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-700">Consent Manager tier</span>
                <select
                  value={cmTier}
                  onChange={(e) => {
                    setResult(null)
                    setCmTier(e.target.value)
                  }}
                  className="w-48 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-perfios-blue focus:outline-none"
                >
                  <option value="">Select a tier…</option>
                  {config.cm_tiers.map((t) => (
                    <option key={t.tier_key} value={t.tier_key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {visibleFields.map((f) => (
              <label key={f.field_key} className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-700">{f.label}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={quantities[f.field_key] ?? 0}
                  onChange={(e) => setQuantity(f.field_key, e.target.value)}
                  className="w-32 rounded-md border border-slate-300 px-3 py-2 text-right text-sm focus:border-perfios-blue focus:outline-none"
                />
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Step 3 — calculate */}
      <button
        type="button"
        onClick={onCalculate}
        disabled={!canCalculate}
        className="rounded-lg bg-perfios-green px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Calculate
      </button>

      {result && (
        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Year 1</div>
            <div className="mt-1 text-3xl font-bold text-perfios-blue">{formatINR(result.year1)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Year 2</div>
            <div className="mt-1 text-3xl font-bold text-perfios-blue">{formatINR(result.year2)}</div>
          </div>
          <p className="text-xs text-slate-400 sm:col-span-2">
            Base cost only. Year 1 and Year 2 per the published configuration.
          </p>
        </section>
      )}
    </div>
  )
}
