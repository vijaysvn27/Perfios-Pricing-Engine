import { useMemo, useState } from 'react'
import { calculatePricing, MODULE_KEY } from '../lib/engine'
import type { ConfigSnapshot } from '../lib/engine'
import { formatINR } from '../lib/format'
import { card, inp } from './styles'

interface Props {
  snapshot: ConfigSnapshot
}

/** Admin-only live preview: runs the engine on the DRAFT snapshot with a sample
 *  selection so rate/tag/settings edits are visible before publishing. */
export default function PreviewPanel({ snapshot }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [cmTier, setCmTier] = useState('')
  const [showBreakdown, setShowBreakdown] = useState(false)

  const cmSelected = selected.has(MODULE_KEY.CM)

  const visibleFields = useMemo(() => {
    const byKey = new Map(snapshot.fields.map((f) => [f.field_key, f]))
    const keys = new Set<string>()
    for (const t of snapshot.module_fields) {
      if (selected.has(t.module_key) && byKey.has(t.field_key)) keys.add(t.field_key)
    }
    return [...keys].map((k) => byKey.get(k)!).filter((f) => f.active).sort((a, b) => a.sort_order - b.sort_order)
  }, [snapshot, selected])

  const result = useMemo(
    () =>
      calculatePricing(snapshot, {
        moduleKeys: [...selected],
        quantities,
        cmTier: cmSelected ? cmTier || null : null,
      }),
    [snapshot, selected, quantities, cmTier, cmSelected],
  )

  function toggle(key: string) {
    setSelected((p) => {
      const n = new Set(p)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  return (
    <div className={card}>
      <h3 className="mb-2 text-sm font-semibold text-perfios-blue">Live preview</h3>

      <div className="mb-2 flex flex-wrap gap-1">
        {snapshot.modules.filter((m) => m.active).map((m) => (
          <button
            key={m.module_key}
            type="button"
            onClick={() => toggle(m.module_key)}
            className={
              'rounded px-2 py-1 text-xs ' +
              (selected.has(m.module_key) ? 'bg-perfios-blue text-white' : 'bg-slate-100 text-slate-600')
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {cmSelected && (
        <select className={`${inp} mb-2 w-full`} value={cmTier} onChange={(e) => setCmTier(e.target.value)}>
          <option value="">CM tier…</option>
          {snapshot.cm_tiers.map((t) => (
            <option key={t.tier_key} value={t.tier_key}>{t.label}</option>
          ))}
        </select>
      )}

      {visibleFields.map((f) => (
        <label key={f.field_key} className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-600">
          {f.label}
          <input
            type="number" min={0} step={1} className={`${inp} w-20 text-right`}
            value={quantities[f.field_key] ?? 0}
            onChange={(e) => setQuantities((q) => ({ ...q, [f.field_key]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))}
          />
        </label>
      ))}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded bg-slate-50 p-2">
          <div className="text-[10px] uppercase text-slate-400">Year 1</div>
          <div className="text-lg font-bold text-perfios-blue">{formatINR(result.year1)}</div>
        </div>
        <div className="rounded bg-slate-50 p-2">
          <div className="text-[10px] uppercase text-slate-400">Year 2</div>
          <div className="text-lg font-bold text-perfios-blue">{formatINR(result.year2)}</div>
        </div>
      </div>

      <button type="button" className="mt-2 text-xs text-slate-400 underline" onClick={() => setShowBreakdown((s) => !s)}>
        {showBreakdown ? 'Hide' : 'Show'} breakdown (admin only)
      </button>
      {showBreakdown && (
        <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-100">
          {JSON.stringify(result.breakdown_for_admin_only, null, 2)}
        </pre>
      )}
    </div>
  )
}
