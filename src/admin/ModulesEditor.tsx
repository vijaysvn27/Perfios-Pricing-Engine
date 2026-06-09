import type { FieldDef, ModuleDef, ModuleFieldTag } from '../lib/engine'
import { card, inp, toNum } from './styles'

interface Props {
  modules: ModuleDef[]
  fields: FieldDef[]
  module_fields: ModuleFieldTag[]
  patchModule: (key: string, patch: Partial<ModuleDef>) => void
  commitModule: (key: string) => void
  toggleTag: (moduleKey: string, fieldKey: string, on: boolean) => void
}

export default function ModulesEditor({
  modules,
  fields,
  module_fields,
  patchModule,
  commitModule,
  toggleTag,
}: Props) {
  const isTagged = (mk: string, fk: string) =>
    module_fields.some((t) => t.module_key === mk && t.field_key === fk)
  const sortedFields = [...fields].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Deployment % and AMC % are global and live in the Settings tab — they are
        not per-module, so they are intentionally not shown here.
      </p>
      {[...modules]
        .sort((a, b) => a.module_key.localeCompare(b.module_key))
        .map((m) => (
          <div key={m.module_key} className={card}>
            <div className="mb-3 flex items-center gap-3">
              <input
                className={`${inp} flex-1 font-medium`}
                value={m.label}
                onChange={(e) => patchModule(m.module_key, { label: e.target.value })}
                onBlur={() => commitModule(m.module_key)}
              />
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-500">
                {m.module_key}
              </span>
              <span className="rounded bg-perfios-blue/10 px-2 py-0.5 text-xs font-medium text-perfios-blue">
                {m.pricing_type}
              </span>
            </div>

            {m.pricing_type === 'multiplier' && (
              <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
                Multiplier
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  className={`${inp} w-24 text-right`}
                  value={m.multiplier ?? 0}
                  onChange={(e) => patchModule(m.module_key, { multiplier: toNum(e.target.value) })}
                  onBlur={() => commitModule(m.module_key)}
                />
              </label>
            )}

            {m.pricing_type === 'tier' ? (
              <p className="text-sm text-slate-500">
                Priced by Consent Manager tiers — see the CM Tiers and Settings tabs. No field tags.
              </p>
            ) : (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Included fields
                </div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {sortedFields.map((f) => (
                    <label key={f.field_key} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={isTagged(m.module_key, f.field_key)}
                        onChange={(e) => toggleTag(m.module_key, f.field_key, e.target.checked)}
                        disabled={!f.active}
                      />
                      <span className={f.active ? '' : 'text-slate-300 line-through'}>{f.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
    </div>
  )
}
