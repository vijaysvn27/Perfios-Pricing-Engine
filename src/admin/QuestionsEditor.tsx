import { useState } from 'react'
import type { FieldDef, InfoAnswerType, InformationalQuestion } from '../lib/engine'
import { btn, btnGreen, inp } from './styles'

/** A, B, …, Z, AA … for section index 0, 1, 2 … (mirrors lib/questionnaire, kept
 *  local so the admin bundle doesn't pull in the ExcelJS-bearing module). */
function sectionLetter(idx: number): string {
  let s = ''
  let n = idx + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

interface Props {
  fields: FieldDef[]
  informational: InformationalQuestion[]
  patchField: (key: string, patch: Partial<FieldDef>) => void
  commitField: (key: string) => void
  patchInfo: (key: string, patch: Partial<InformationalQuestion>) => void
  commitInfo: (key: string) => void
  addInfo: (q: InformationalQuestion) => void
  deleteInfo: (key: string) => void
  /** Persist a section/order reshuffle (full next arrays + changed keys). */
  reorderQuestions: (
    nextFields: FieldDef[],
    nextInfos: InformationalQuestion[],
    changedFieldKeys: string[],
    changedInfoKeys: string[],
  ) => void
}

const TYPES: InfoAnswerType[] = ['number', 'yes_no', 'text', 'date', 'select']
const NEW_SECTION = '__new__'

// "Why this is needed" must stay qualitative — flag (soft) any digit or ₹.
const looksNumeric = (s: string | null | undefined) => /[₹]|\d/.test(s ?? '')

const label = 'block text-xs text-slate-500'

type Row =
  | { key: string; kind: 'field'; field: FieldDef }
  | { key: string; kind: 'info'; info: InformationalQuestion }

const rowSection = (r: Row) => ((r.kind === 'field' ? r.field.section : r.info.section) ?? '').trim()
const rowSectionSort = (r: Row) => (r.kind === 'field' ? r.field.section_sort : r.info.section_sort) ?? 0
const rowItemSort = (r: Row) => (r.kind === 'field' ? r.field.item_sort : r.info.item_sort) ?? 0

interface LayoutSection {
  name: string
  keys: string[]
}

export default function QuestionsEditor({
  fields, informational, patchField, commitField, patchInfo, commitInfo, addInfo, deleteInfo, reorderQuestions,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // ---- derive the unified, ordered, sectioned model from the draft ----------
  const rows: Row[] = [
    ...fields.map((f) => ({ key: f.field_key, kind: 'field' as const, field: f })),
    ...informational.map((q) => ({ key: q.question_key, kind: 'info' as const, info: q })),
  ]
  const minSort = new Map<string, number>()
  for (const r of rows) {
    const s = rowSection(r)
    const cur = minSort.get(s)
    if (cur === undefined || rowSectionSort(r) < cur) minSort.set(s, rowSectionSort(r))
  }
  const sectionNames = [...minSort.keys()].sort((a, b) => (minSort.get(a)! - minSort.get(b)!) || a.localeCompare(b))
  const sections = sectionNames.map((name) => ({
    name,
    rows: rows
      .filter((r) => rowSection(r) === name)
      .sort((a, b) => rowItemSort(a) - rowItemSort(b) || (a.kind === 'field' ? 0 : 1) - (b.kind === 'field' ? 0 : 1) || a.key.localeCompare(b.key)),
  }))
  const layout: LayoutSection[] = sections.map((s) => ({ name: s.name, keys: s.rows.map((r) => r.key) }))
  const clone = (): LayoutSection[] => layout.map((s) => ({ name: s.name, keys: [...s.keys] }))

  // ---- persist a desired layout (assigns section / section_sort / item_sort) -
  function applyLayout(next: LayoutSection[]) {
    const nextFields = fields.map((f) => ({ ...f }))
    const nextInfos = informational.map((q) => ({ ...q }))
    const fBy = new Map(nextFields.map((f) => [f.field_key, f]))
    const qBy = new Map(nextInfos.map((q) => [q.question_key, q]))
    const cf: string[] = []
    const ci: string[] = []
    next.forEach((sec, si) => {
      sec.keys.forEach((key, ni) => {
        const f = fBy.get(key)
        if (f) {
          if (f.section !== sec.name || f.section_sort !== si || f.item_sort !== ni) cf.push(key)
          f.section = sec.name
          f.section_sort = si
          f.item_sort = ni
          return
        }
        const q = qBy.get(key)
        if (q) {
          if (q.section !== sec.name || q.section_sort !== si || q.item_sort !== ni) ci.push(key)
          q.section = sec.name
          q.section_sort = si
          q.item_sort = ni
        }
      })
    })
    if (cf.length || ci.length) reorderQuestions(nextFields, nextInfos, cf, ci)
  }

  function moveSection(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= layout.length) return
    const L = clone()
    ;[L[i], L[j]] = [L[j], L[i]]
    applyLayout(L)
  }
  function moveRow(secIdx: number, ri: number, dir: -1 | 1) {
    const L = clone()
    const keys = L[secIdx].keys
    const j = ri + dir
    if (j < 0 || j >= keys.length) return
    ;[keys[ri], keys[j]] = [keys[j], keys[ri]]
    applyLayout(L)
  }
  function moveRowToSection(key: string, target: string) {
    const name = target.trim()
    const L = clone()
    for (const s of L) {
      const i = s.keys.indexOf(key)
      if (i >= 0) { s.keys.splice(i, 1); break }
    }
    let t = L.find((s) => s.name === name)
    if (!t) { t = { name, keys: [] }; L.push(t) }
    t.keys.push(key)
    applyLayout(L.filter((s) => s.keys.length > 0))
  }
  function renameSection(oldName: string, raw: string) {
    const newName = raw.trim()
    if (!newName || newName === oldName) return
    const L = clone()
    const src = L.find((s) => s.name === oldName)
    if (!src) return
    const dst = L.find((s) => s.name === newName)
    if (dst) { dst.keys.push(...src.keys); applyLayout(L.filter((s) => s !== src)) }
    else { src.name = newName; applyLayout(L) }
  }

  function addInfoToSection(sectionName: string) {
    const key = window.prompt('Question key (stable id, e.g. existing_dpo):')?.trim()
    if (!key) return
    if (fields.some((f) => f.field_key === key) || informational.some((q) => q.question_key === key)) {
      window.alert('That key already exists.')
      return
    }
    const si = sections.findIndex((s) => s.name === sectionName)
    addInfo({
      question_key: key, question_text: '', example: '', why_text: '', answer_type: 'text', options: null,
      section: sectionName, section_sort: si >= 0 ? si : sections.length, item_sort: si >= 0 ? sections[si].rows.length : 0, active: true,
    })
  }
  function onNewSection() {
    const name = window.prompt('New section name:')?.trim()
    if (!name) return
    if (sections.some((s) => s.name === name)) { window.alert('A section with that name already exists.'); return }
    addInfoToSection(name)
  }

  // Plain render helpers (called inline, NOT mounted as components) so text inputs
  // elsewhere never lose focus on re-render.
  const sectionPicker = (value: string, onPick: (s: string) => void) => (
    <select
      className={`${inp} max-w-[12rem]`}
      value={value}
      onChange={(e) => {
        const v = e.target.value
        if (v === NEW_SECTION) {
          const name = window.prompt('Move to new section — name:')?.trim()
          if (name) onPick(name)
        } else if (v !== value) onPick(v)
      }}
    >
      {sections.map((s) => <option key={s.name} value={s.name}>{s.name || 'Ungrouped'}</option>)}
      <option value={NEW_SECTION}>+ New section…</option>
    </select>
  )

  const arrows = (upDisabled: boolean, downDisabled: boolean, onUp: () => void, onDown: () => void) => {
    const a = 'rounded border border-slate-300 px-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30'
    return (
      <span className="inline-flex gap-1">
        <button type="button" className={a} disabled={upDisabled} onClick={onUp} title="Move up">↑</button>
        <button type="button" className={a} disabled={downDisabled} onClick={onDown} title="Move down">↓</button>
      </span>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-slate-500">
          Questions are grouped into <strong>sections</strong> (A, B …) and numbered like they appear in the
          questionnaire (A.1, A.2 …). Reorder with the ↑/↓ arrows; move a question with its <strong>Section</strong>{' '}
          picker. Priced questions come from the <strong>Fields</strong> tab (add/remove them there) — here you edit their
          customer-facing help. Keep “Why this is needed” qualitative (no prices or numbers).
        </p>
        <button type="button" className={btnGreen} onClick={onNewSection}>+ New section</button>
      </div>

      {sections.length === 0 && <p className="text-xs text-slate-400">No questions yet. Add priced questions in the Fields tab, or create a section here.</p>}

      <div className="space-y-4">
        {sections.map((sec, si) => {
          const letter = sectionLetter(si)
          const isCollapsed = !!collapsed[sec.name]
          return (
            <div key={sec.name} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              {/* Section header */}
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                <button
                  type="button"
                  className="text-slate-500 hover:text-perfios-blue"
                  onClick={() => setCollapsed((c) => ({ ...c, [sec.name]: !isCollapsed }))}
                  title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  {isCollapsed ? '▸' : '▾'}
                </button>
                <span className="text-sm font-semibold text-perfios-blue">{letter}.</span>
                <input
                  key={sec.name}
                  defaultValue={sec.name}
                  placeholder="Ungrouped"
                  className={`${inp} w-56 font-medium`}
                  onBlur={(e) => renameSection(sec.name, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
                <span className="text-xs text-slate-400">{sec.rows.length} question{sec.rows.length === 1 ? '' : 's'}</span>
                <span className="ml-auto flex items-center gap-2">
                  <button type="button" className={btn} onClick={() => addInfoToSection(sec.name)}>+ Add question</button>
                  {arrows(si === 0, si === sections.length - 1, () => moveSection(si, -1), () => moveSection(si, 1))}
                </span>
              </div>

              {!isCollapsed && (
                <div className="divide-y divide-slate-100">
                  {sec.rows.map((r, ni) => (
                    <div key={r.key} className="px-3 py-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-400">{letter}.{ni + 1}</span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">{r.key}</span>
                        {r.kind === 'field'
                          ? !r.field.active && <span className="text-xs text-amber-600">inactive</span>
                          : (
                            <label className="flex items-center gap-1 text-xs text-slate-500">
                              <input type="checkbox" checked={r.info.active} onChange={(e) => { patchInfo(r.key, { active: e.target.checked }); setTimeout(() => commitInfo(r.key), 0) }} />
                              active
                            </label>
                          )}
                        <span className="text-xs text-slate-400">{r.kind === 'field' ? 'priced' : 'informational'}</span>
                        <span className="ml-auto flex items-center gap-2">
                          {sectionPicker(sec.name, (s) => moveRowToSection(r.key, s))}
                          {arrows(ni === 0, ni === sec.rows.length - 1, () => moveRow(si, ni, -1), () => moveRow(si, ni, 1))}
                          {r.kind === 'info' && (
                            <button type="button" className={btn} onClick={() => { if (window.confirm(`Delete informational question "${r.key}"?`)) deleteInfo(r.key) }}>Delete</button>
                          )}
                        </span>
                      </div>

                      {r.kind === 'field' ? (
                        <FieldBody f={r.field} patchField={patchField} commitField={commitField} />
                      ) : (
                        <InfoBody q={r.info} patchInfo={patchInfo} commitInfo={commitInfo} />
                      )}
                    </div>
                  ))}
                  {sec.rows.length === 0 && <p className="px-3 py-3 text-xs text-slate-400">Empty section.</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FieldBody({ f, patchField, commitField }: { f: FieldDef; patchField: Props['patchField']; commitField: Props['commitField'] }) {
  return (
    <div className="space-y-2">
      <label className={label}>Question (customer-facing)
        <input className={`${inp} w-full`} placeholder={f.label} value={f.question_text ?? ''}
          onChange={(e) => patchField(f.field_key, { question_text: e.target.value })} onBlur={() => commitField(f.field_key)} />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={label}>Inline example (e.g. 25)
          <input className={`${inp} w-full`} value={f.example ?? ''}
            onChange={(e) => patchField(f.field_key, { example: e.target.value })} onBlur={() => commitField(f.field_key)} />
        </label>
        <label className={label}>Why this is needed (qualitative)
          <input className={`${inp} w-full`} value={f.why_text ?? ''}
            onChange={(e) => patchField(f.field_key, { why_text: e.target.value })} onBlur={() => commitField(f.field_key)} />
        </label>
      </div>
      {looksNumeric(f.why_text) && <p className="text-xs text-amber-600">⚠ “Why” should be qualitative — avoid prices/numbers.</p>}
    </div>
  )
}

function InfoBody({ q, patchInfo, commitInfo }: { q: InformationalQuestion; patchInfo: Props['patchInfo']; commitInfo: Props['commitInfo'] }) {
  return (
    <div className="space-y-2">
      <label className={label}>Question
        <input className={`${inp} w-full`} value={q.question_text}
          onChange={(e) => patchInfo(q.question_key, { question_text: e.target.value })} onBlur={() => commitInfo(q.question_key)} />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
        <label className={label}>Options (comma-separated)
          <input className={`${inp} w-full`} value={(q.options ?? []).join(', ')}
            onChange={(e) => patchInfo(q.question_key, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} onBlur={() => commitInfo(q.question_key)} />
        </label>
      )}
      <label className={label}>Why this is needed (qualitative)
        <input className={`${inp} w-full`} value={q.why_text ?? ''}
          onChange={(e) => patchInfo(q.question_key, { why_text: e.target.value })} onBlur={() => commitInfo(q.question_key)} />
      </label>
      {looksNumeric(q.why_text) && <p className="text-xs text-amber-600">⚠ “Why” should be qualitative — avoid prices/numbers.</p>}
    </div>
  )
}
