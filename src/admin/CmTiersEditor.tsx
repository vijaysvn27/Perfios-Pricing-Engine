import { useState } from 'react'
import type { CmTier } from '../lib/engine'
import { btn, inp, th, toNum } from './styles'

interface Props {
  cm_tiers: CmTier[]
  patchTier: (key: string, patch: Partial<CmTier>) => void
  commitTier: (key: string) => void
  addTier: (t: CmTier) => void
}

export default function CmTiersEditor({ cm_tiers, patchTier, commitTier, addTier }: Props) {
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const keys = new Set(cm_tiers.map((t) => t.tier_key))
  const canAdd = newKey.trim() !== '' && newLabel.trim() !== '' && !keys.has(newKey.trim())

  return (
    <div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Key</th>
            <th className={th}>Label</th>
            <th className={th}>License fee (₹)</th>
            <th className={th}>AMC %</th>
            <th className={th}>Implementation fee (₹)</th>
          </tr>
        </thead>
        <tbody>
          {[...cm_tiers]
            .sort((a, b) => a.license_fee_inr - b.license_fee_inr)
            .map((t) => (
              <tr key={t.tier_key} className="border-t border-slate-100">
                <td className="px-2 py-1 font-mono text-xs text-slate-500">{t.tier_key}</td>
                <td className="px-2 py-1">
                  <input className={inp} value={t.label} onChange={(e) => patchTier(t.tier_key, { label: e.target.value })} onBlur={() => commitTier(t.tier_key)} />
                </td>
                <td className="px-2 py-1">
                  <input type="number" min={0} step={1} className={`${inp} w-36 text-right`} value={t.license_fee_inr}
                    onChange={(e) => patchTier(t.tier_key, { license_fee_inr: toNum(e.target.value) })} onBlur={() => commitTier(t.tier_key)} />
                </td>
                <td className="px-2 py-1">
                  <input type="number" min={0} step={0.01} className={`${inp} w-20 text-right`} value={t.amc_pct}
                    onChange={(e) => patchTier(t.tier_key, { amc_pct: toNum(e.target.value) })} onBlur={() => commitTier(t.tier_key)} />
                </td>
                <td className="px-2 py-1">
                  <input type="number" min={0} step={1} className={`${inp} w-36 text-right`} value={t.implementation_fee_inr}
                    onChange={(e) => patchTier(t.tier_key, { implementation_fee_inr: toNum(e.target.value) })} onBlur={() => commitTier(t.tier_key)} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="mt-4 flex items-end gap-2 border-t border-slate-100 pt-4">
        <label className="flex flex-col text-xs text-slate-500">
          New tier key
          <input className={`${inp} font-mono`} value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="enterprise" />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Label
          <input className={inp} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Enterprise" />
        </label>
        <button
          type="button"
          className={btn}
          disabled={!canAdd}
          onClick={() => {
            addTier({ tier_key: newKey.trim(), label: newLabel.trim(), license_fee_inr: 0, amc_pct: 0.3, implementation_fee_inr: 0 })
            setNewKey('')
            setNewLabel('')
          }}
        >
          Add tier
        </button>
      </div>
    </div>
  )
}
