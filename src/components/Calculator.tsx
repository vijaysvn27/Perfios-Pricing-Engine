import { useEffect, useMemo, useState } from 'react'
import { calculatePricing, MODULE_KEY } from '../lib/engine'
import type { ConfigSnapshot, EngineResult, FieldDef } from '../lib/engine'
import { loadLiveConfig } from '../lib/supabase'
import { formatINR } from '../lib/format'
import { buildClientBreakdown, frequencyLabel } from '../lib/breakdown'
import { exportBreakdownXlsx } from '../lib/excel'
import { loadMyExportPrefs, saveMyExportPrefs } from '../lib/exportPrefs'
import { DEFAULT_HERO, DEFAULT_TERMS } from '../lib/exportDefaults'

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

  const breakdown = useMemo(
    () => (result && config ? buildClientBreakdown(result, config) : null),
    [result, config],
  )

  // Export document copy: customer name is per-quote; hero/terms pre-fill from the
  // user's saved prefs, else the live config baseline, else the built-in default.
  const [customerName, setCustomerName] = useState('')
  const [hero, setHero] = useState('')
  const [terms, setTerms] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    if (!config) return
    let active = true
    void loadMyExportPrefs().then((prefs) => {
      if (!active) return
      setHero(prefs?.hero || config.settings.excel_hero || DEFAULT_HERO)
      setTerms(prefs?.terms || config.settings.excel_terms || DEFAULT_TERMS)
    })
    return () => {
      active = false
    }
  }, [config])

  async function onSaveDefaults() {
    setSaveState('saving')
    try {
      await saveMyExportPrefs({ hero, terms })
      setSaveState('saved')
    } catch {
      setSaveState('idle')
    }
  }

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

      {breakdown && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pricing breakdown
          </h2>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-semibold">Line</th>
                  <th className="px-4 py-2 font-semibold">Frequency</th>
                  <th className="px-4 py-2 text-right font-semibold">Year 1</th>
                  <th className="px-4 py-2 text-right font-semibold">Year 2</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.lines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <div className="text-slate-700">{l.label}</div>
                      {l.includes && l.includes.length > 0 && (
                        <div className="text-xs text-slate-400">Includes: {l.includes.join(', ')}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{frequencyLabel(l.frequency)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{formatINR(l.year1)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{formatINR(l.year2)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-4 py-2" colSpan={2}>Total</td>
                  <td className="px-4 py-2 text-right tabular-nums text-perfios-blue">{formatINR(breakdown.year1Total)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-perfios-blue">{formatINR(breakdown.year2Total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs text-slate-400">
            Base cost only, per the published configuration. Partners add their own margin in the
            downloaded Excel.
          </p>

          <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-700">Quote document</h3>
            <label className="block">
              <span className="text-sm text-slate-600">Customer name</span>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Acme Bank"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-perfios-blue focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm text-slate-600">Hero text</span>
              <textarea
                rows={2}
                value={hero}
                onChange={(e) => {
                  setHero(e.target.value)
                  setSaveState('idle')
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-perfios-blue focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm text-slate-600">
                Terms &amp; Conditions <span className="text-slate-400">(one per line)</span>
              </span>
              <textarea
                rows={4}
                value={terms}
                onChange={(e) => {
                  setTerms(e.target.value)
                  setSaveState('idle')
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-perfios-blue focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void exportBreakdownXlsx(breakdown, { customerName, hero, terms })}
                disabled={breakdown.lines.length === 0}
                className="rounded-lg bg-perfios-green px-5 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Download Excel
              </button>
              <button
                type="button"
                onClick={() => void onSaveDefaults()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save as my default'}
              </button>
              <span className="text-xs text-slate-400">Hero &amp; terms are remembered for next time.</span>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
