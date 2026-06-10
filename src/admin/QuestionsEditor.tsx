import type { FieldDef, InfoAnswerType, InformationalQuestion } from '../lib/engine'
import { btn, btnGreen, card, inp, toNum } from './styles'

interface Props {
  fields: FieldDef[]
  informational: InformationalQuestion[]
  patchField: (key: string, patch: Partial<FieldDef>) => void
  commitField: (key: string) => void
  patchInfo: (key: string, patch: Partial<InformationalQuestion>) => void
  commitInfo: (key: string) => void
  addInfo: (q: InformationalQuestion) => void
  deleteInfo: (key: string) => void
}

const TYPES: InfoAnswerType[] = ['number', 'yes_no', 'text', 'date', 'select']

// "Why this is needed" must stay qualitative — flag (soft) any digit or ₹.
function looksNumeric(s: string | null | undefined): boolean {
  return /[₹]|\d/.test(s ?? '')
}

const bySection = <T extends { section?: string | null; section_sort?: number; item_sort?: number }>(a: T, b: T) =>
  (a.section_sort ?? 0) - (b.section_sort ?? 0) || (a.item_sort ?? 0) - (b.item_sort ?? 0)

const label = 'block text-xs text-slate-500'
const orderRow = 'flex flex-wrap gap-2'

export default function QuestionsEditor({
  fields, informational, patchField, commitField, patchInfo, commitInfo, addInfo, deleteInfo,
}: Props) {
  const sortedFields = [...fields].sort((a, b) => bySection(a, b) || a.sort_order - b.sort_order)
  const sortedInfo = [...informational].sort(bySection)

  function onAddInfo() {
    const key = window.prompt('Question key (stable id, e.g. existing_dpo):')?.trim()
    if (!key) return
    if (informational.some((q) => q.question_key === key)) {
      window.alert('That question key already exists.')
      return
    }
    addInfo({
      question_key: key, question_text: '', example: '', why_text: '', answer_type: 'text',
      options: null, section: '', section_sort: 0, item_sort: 0, active: true,
    })
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">
        Priced questions are bound to fields (add/remove them in the <strong>Fields</strong> tab) — edit
        their customer-facing help here. Informational questions are <strong>context only</strong> and
        never affect price. Keep “Why this is needed” qualitative (no prices or numbers).
      </p>

      {/* Priced questions (field help) */}
      <div className={card}>
        <h3 className="mb-3 text-sm font-semibold text-perfios-blue">Priced questions (bound to fields)</h3>
        <div className="space-y-4">
          {sortedFields.map((f) => (
            <div key={f.field_key} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">{f.field_key}</span>
                {!f.active && <span className="text-xs text-amber-600">inactive</span>}
              </div>
              <label className={label}>Question (customer-facing)
                <input className={`${inp} w-full`} placeholder={f.label} value={f.question_text ?? ''}
                  onChange={(e) => patchField(f.field_key, { question_text: e.target.value })} onBlur={() => commitField(f.field_key)} />
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={label}>Inline example (e.g. 25)
                  <input className={`${inp} w-full`} value={f.example ?? ''}
                    onChange={(e) => patchField(f.field_key, { example: e.target.value })} onBlur={() => commitField(f.field_key)} />
                </label>
                <label className={label}>Section
                  <input className={`${inp} w-full`} value={f.section ?? ''}
                    onChange={(e) => patchField(f.field_key, { section: e.target.value })} onBlur={() => commitField(f.field_key)} />
                </label>
              </div>
              <label className={`${label} mt-2`}>Why this is needed (qualitative)
                <input className={`${inp} w-full`} value={f.why_text ?? ''}
                  onChange={(e) => patchField(f.field_key, { why_text: e.target.value })} onBlur={() => commitField(f.field_key)} />
              </label>
              {looksNumeric(f.why_text) && <p className="mt-1 text-xs text-amber-600">⚠ “Why” should be qualitative — avoid prices/numbers.</p>}
              <div className={`${orderRow} mt-2`}>
                <label className={label}>Section order
                  <input type="number" className={`${inp} w-24`} value={f.section_sort ?? 0}
                    onChange={(e) => patchField(f.field_key, { section_sort: toNum(e.target.value) })} onBlur={() => commitField(f.field_key)} />
                </label>
                <label className={label}>Item order
                  <input type="number" className={`${inp} w-24`} value={f.item_sort ?? 0}
                    onChange={(e) => patchField(f.field_key, { item_sort: toNum(e.target.value) })} onBlur={() => commitField(f.field_key)} />
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Informational questions */}
      <div className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-perfios-blue">Informational questions (context only)</h3>
          <button type="button" className={btnGreen} onClick={onAddInfo}>+ Add question</button>
        </div>
        {sortedInfo.length === 0 && <p className="text-xs text-slate-400">None yet. These never affect price.</p>}
        <div className="space-y-4">
          {sortedInfo.map((q) => (
            <div key={q.question_key} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">{q.question_key}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" checked={q.active} onChange={(e) => { patchInfo(q.question_key, { active: e.target.checked }); setTimeout(() => commitInfo(q.question_key), 0) }} />
                    active
                  </label>
                  <button type="button" className={btn} onClick={() => { if (window.confirm(`Delete informational question "${q.question_key}"?`)) deleteInfo(q.question_key) }}>Delete</button>
                </div>
              </div>
              <label className={label}>Question
                <input className={`${inp} w-full`} value={q.question_text}
                  onChange={(e) => patchInfo(q.question_key, { question_text: e.target.value })} onBlur={() => commitInfo(q.question_key)} />
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={label}>Answer type
                  <select className={`${inp} w-full`} value={q.answer_type}
                    onChange={(e) => { patchInfo(q.question_key, { answer_type: e.target.value as InfoAnswerType }); setTimeout(() => commitInfo(q.question_key), 0) }}>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className={label}>Inline example
                  <input className={`${inp} w-full`} value={q.example ?? ''}
                    onChange={(e) => patchInfo(q.question_key, { example: e.target.value })} onBlur={() => commitInfo(q.question_key)} />
                </label>
              </div>
              {q.answer_type === 'select' && (
                <label className={`${label} mt-2`}>Options (comma-separated)
                  <input className={`${inp} w-full`} value={(q.options ?? []).join(', ')}
                    onChange={(e) => patchInfo(q.question_key, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} onBlur={() => commitInfo(q.question_key)} />
                </label>
              )}
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={label}>Section
                  <input className={`${inp} w-full`} value={q.section ?? ''}
                    onChange={(e) => patchInfo(q.question_key, { section: e.target.value })} onBlur={() => commitInfo(q.question_key)} />
                </label>
                <label className={label}>Why this is needed (qualitative)
                  <input className={`${inp} w-full`} value={q.why_text ?? ''}
                    onChange={(e) => patchInfo(q.question_key, { why_text: e.target.value })} onBlur={() => commitInfo(q.question_key)} />
                </label>
              </div>
              {looksNumeric(q.why_text) && <p className="mt-1 text-xs text-amber-600">⚠ “Why” should be qualitative — avoid prices/numbers.</p>}
              <div className={`${orderRow} mt-2`}>
                <label className={label}>Section order
                  <input type="number" className={`${inp} w-24`} value={q.section_sort}
                    onChange={(e) => patchInfo(q.question_key, { section_sort: toNum(e.target.value) })} onBlur={() => commitInfo(q.question_key)} />
                </label>
                <label className={label}>Item order
                  <input type="number" className={`${inp} w-24`} value={q.item_sort}
                    onChange={(e) => patchInfo(q.question_key, { item_sort: toNum(e.target.value) })} onBlur={() => commitInfo(q.question_key)} />
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
