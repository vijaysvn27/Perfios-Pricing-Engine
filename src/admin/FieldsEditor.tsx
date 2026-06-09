import { useState } from 'react'
import type { FieldDef, Frequency } from '../lib/engine'
import { btn, inp, th, toNum } from './styles'

interface Props {
  fields: FieldDef[]
  patchField: (key: string, patch: Partial<FieldDef>) => void
  commitField: (key: string) => void
  addField: (f: FieldDef) => void
}

export default function FieldsEditor({ fields, patchField, commitField, addField }: Props) {
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const existingKeys = new Set(fields.map((f) => f.field_key))
  const canAdd = newKey.trim() !== '' && newLabel.trim() !== '' && !existingKeys.has(newKey.trim())

  return (
    <div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Key</th>
            <th className={th}>Label</th>
            <th className={th}>Unit price (₹)</th>
            <th className={th}>Frequency</th>
            <th className={th}>Sort</th>
            <th className={th}>Active</th>
          </tr>
        </thead>
        <tbody>
          {[...fields]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((f) => (
              <tr key={f.field_key} className="border-t border-slate-100">
                <td className="px-2 py-1 font-mono text-xs text-slate-500">{f.field_key}</td>
                <td className="px-2 py-1">
                  <input
                    className={inp}
                    value={f.label}
                    onChange={(e) => patchField(f.field_key, { label: e.target.value })}
                    onBlur={() => commitField(f.field_key)}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`${inp} w-32 text-right`}
                    value={f.unit_price_inr}
                    onChange={(e) => patchField(f.field_key, { unit_price_inr: toNum(e.target.value) })}
                    onBlur={() => commitField(f.field_key)}
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    className={inp}
                    value={f.frequency}
                    onChange={(e) => {
                      patchField(f.field_key, { frequency: e.target.value as Frequency })
                      // discrete change → persist immediately (defer to next tick so state is set)
                      setTimeout(() => commitField(f.field_key), 0)
                    }}
                  >
                    <option value="recurring">recurring</option>
                    <option value="one_time">one_time</option>
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    step={1}
                    className={`${inp} w-16 text-right`}
                    value={f.sort_order}
                    onChange={(e) => patchField(f.field_key, { sort_order: toNum(e.target.value) })}
                    onBlur={() => commitField(f.field_key)}
                  />
                </td>
                <td className="px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={f.active}
                    onChange={(e) => {
                      patchField(f.field_key, { active: e.target.checked })
                      setTimeout(() => commitField(f.field_key), 0)
                    }}
                  />
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="mt-4 flex items-end gap-2 border-t border-slate-100 pt-4">
        <label className="flex flex-col text-xs text-slate-500">
          New field key
          <input className={`${inp} font-mono`} value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="e.g. api_calls" />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Label
          <input className={inp} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="API calls" />
        </label>
        <button
          type="button"
          className={btn}
          disabled={!canAdd}
          onClick={() => {
            addField({
              field_key: newKey.trim(),
              label: newLabel.trim(),
              unit_price_inr: 0,
              frequency: 'recurring',
              active: true,
              sort_order: (fields.reduce((m, f) => Math.max(m, f.sort_order), 0) || 0) + 10,
            })
            setNewKey('')
            setNewLabel('')
          }}
        >
          Add field
        </button>
      </div>
    </div>
  )
}
