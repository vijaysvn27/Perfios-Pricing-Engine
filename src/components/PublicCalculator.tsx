import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  getPublicForm,
  priceInstance,
  type PriceResult,
  type PublicForm,
  type PublicInformationalQuestion,
} from '../lib/publicApi'
import { frequencyLabel } from '../lib/breakdown'
import { formatINR } from '../lib/format'
import { exportBreakdownXlsx } from '../lib/excel'
import { DEFAULT_HERO, DEFAULT_TERMS } from '../lib/exportDefaults'
import {
  generateQuestionnaireXlsx,
  parseQuestionnaireBuffer,
  orderedSections,
  sectionLetter,
  type InfoAnswer,
  type QSectionItem,
} from '../lib/questionnaire'

type InfoAnswers = Record<string, InfoAnswer>

/** Native-tooltip info marker for the "why this is needed" copy. */
function WhyTip({ text }: { text: string }) {
  if (!text) return null
  return (
    <span
      title={text}
      aria-label={text}
      className="cursor-help select-none text-slate-400 transition hover:text-perfios-blue"
    >
      &#9432;
    </span>
  )
}

export default function PublicCalculator({ token }: { token: string }) {
  const [form, setForm] = useState<PublicForm | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [cmTier, setCmTier] = useState<string>('')
  const [infoAnswers, setInfoAnswers] = useState<InfoAnswers>({})
  const [result, setResult] = useState<PriceResult | null>(null)
  const [pricing, setPricing] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)

  const [customerName, setCustomerName] = useState('')
  const [hero, setHero] = useState('')
  const [terms, setTerms] = useState('')
  const [saved, setSaved] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    getPublicForm(token)
      .then((f) => {
        if (!f) {
          setLoadError('This pricing link is not available. It may be inactive or not yet published.')
          return
        }
        setForm(f)
        const stored = localStorage.getItem(`perfios_export_${token}`)
        if (stored) {
          try {
            const o = JSON.parse(stored)
            setHero(o.hero ?? f.excel_hero ?? DEFAULT_HERO)
            setTerms(o.terms ?? f.excel_terms ?? DEFAULT_TERMS)
            return
          } catch {
            /* fall through */
          }
        }
        setHero(f.excel_hero ?? DEFAULT_HERO)
        setTerms(f.excel_terms ?? DEFAULT_TERMS)
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
  }, [token])

  const tierSelected = useMemo(
    () => !!form && form.modules.some((m) => selected.has(m.module_key) && m.pricing_type === 'tier'),
    [form, selected],
  )

  // Unified, sectioned question list shared with the Excel questionnaire so the
  // on-screen order and numbering match the downloaded file exactly.
  const sections = useMemo(() => (form ? orderedSections(form, [...selected]) : []), [form, selected])

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

  // Informational answers are OPTIONAL context — they never affect pricing, so they
  // do NOT clear the result and never gate Calculate/Download.
  function setInfo(key: string, type: PublicInformationalQuestion['answer_type'], value: string) {
    setInfoAnswers((prev) => {
      const next = { ...prev }
      if (value === '') {
        delete next[key]
      } else if (type === 'number') {
        const n = Number(value)
        if (Number.isFinite(n)) next[key] = n
        else delete next[key]
      } else if (type === 'yes_no') {
        next[key] = value === 'Yes'
      } else {
        next[key] = value
      }
      return next
    })
  }

  function infoStr(key: string): string {
    const v = infoAnswers[key]
    if (v === undefined) return ''
    if (typeof v === 'boolean') return v ? 'Yes' : 'No'
    return String(v)
  }

  function onGenerateQuestionnaire() {
    if (!form) return
    void generateQuestionnaireXlsx(form, [...selected], {
      customerName,
      quantities,
      cmTier: tierSelected ? cmTier || null : null,
      informationalAnswers: infoAnswers,
    })
  }

  async function onUploadQuestionnaire(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-uploading the same file
    if (!file || !form) return
    setUploadError(null)
    try {
      const buf = await file.arrayBuffer()
      const parsed = await parseQuestionnaireBuffer(buf, form)
      setSelected(new Set(parsed.moduleKeys))
      setQuantities(parsed.quantities)
      setCmTier(parsed.cmTier ?? '')
      setInfoAnswers(parsed.informationalAnswers)
      if (parsed.customerName) setCustomerName(parsed.customerName)
      setResult(null)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onCalculate() {
    setPricing(true)
    setPriceError(null)
    try {
      // Pricing payload carries ONLY moduleKeys + quantities + cmTier. Informational
      // answers are deliberately excluded — they must never reach the engine.
      const r = await priceInstance(token, {
        moduleKeys: [...selected],
        quantities,
        cmTier: tierSelected ? cmTier || null : null,
      })
      setResult(r)
    } catch (e) {
      setPriceError(e instanceof Error ? e.message : String(e))
    } finally {
      setPricing(false)
    }
  }

  function onSaveLocal() {
    localStorage.setItem(`perfios_export_${token}`, JSON.stringify({ hero, terms }))
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">{loadError}</div>
      </div>
    )
  }
  if (!form) {
    return <div className="mx-auto max-w-2xl p-8 text-slate-500">Loading…</div>
  }

  const modules = form.modules.filter((m) => m.active)
  const canCalculate = selected.size > 0 && (!tierSelected || cmTier !== '')
  const breakdown = result?.breakdown ?? null

  const inputClass =
    'rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-perfios-blue focus:outline-none'

  function renderInput(item: QSectionItem) {
    if (item.kind === 'field' && item.field) {
      return (
        <input
          type="number"
          min={0}
          step={1}
          value={quantities[item.field.field_key] ?? 0}
          onChange={(e) => setQuantity(item.field!.field_key, e.target.value)}
          className={`w-32 text-right ${inputClass}`}
        />
      )
    }
    if (item.kind === 'cm') {
      return (
        <select
          value={cmTier}
          onChange={(e) => {
            setResult(null)
            setCmTier(e.target.value)
          }}
          className={`w-48 ${inputClass}`}
        >
          <option value="">Select a tier…</option>
          {form!.cm_tiers.map((t) => (
            <option key={t.tier_key} value={t.tier_key}>
              {t.label}
            </option>
          ))}
        </select>
      )
    }
    const q = item.info!
    const key = q.question_key
    switch (q.answer_type) {
      case 'number':
        return (
          <input
            type="number"
            inputMode="numeric"
            value={infoStr(key)}
            onChange={(e) => setInfo(key, 'number', e.target.value)}
            placeholder={q.example ?? ''}
            className={`w-32 text-right ${inputClass}`}
          />
        )
      case 'yes_no':
        return (
          <select value={infoStr(key)} onChange={(e) => setInfo(key, 'yes_no', e.target.value)} className={`w-32 ${inputClass}`}>
            <option value="">—</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        )
      case 'select':
        return (
          <select value={infoStr(key)} onChange={(e) => setInfo(key, 'select', e.target.value)} className={`w-48 ${inputClass}`}>
            <option value="">Select…</option>
            {(q.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )
      case 'date':
        return (
          <input type="date" value={infoStr(key)} onChange={(e) => setInfo(key, 'date', e.target.value)} className={`w-44 ${inputClass}`} />
        )
      default:
        return (
          <input
            type="text"
            value={infoStr(key)}
            onChange={(e) => setInfo(key, 'text', e.target.value)}
            placeholder={q.example ?? ''}
            className={`w-56 ${inputClass}`}
          />
        )
    }
  }

  function itemMeta(item: QSectionItem): { label: string; example: string; why: string; optional: boolean } {
    if (item.kind === 'field' && item.field) {
      const f = item.field
      return { label: f.question_text?.trim() || f.label, example: f.example?.trim() ?? '', why: f.why_text?.trim() ?? '', optional: false }
    }
    if (item.kind === 'cm') {
      return { label: 'Consent Manager tier', example: '', why: 'Pick the licensing tier for the Consent Manager module.', optional: false }
    }
    const q = item.info!
    return { label: q.question_text?.trim() || q.question_key, example: q.example?.trim() ?? '', why: q.why_text?.trim() ?? '', optional: true }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-perfios-blue">Perfios Pricing Calculator</h1>
        <p className="mt-1 text-sm text-slate-500">{form.instance_name} · base cost estimate</p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">1. Choose modules</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {modules.map((m) => {
            const on = selected.has(m.module_key)
            return (
              <button
                key={m.module_key}
                type="button"
                onClick={() => toggleModule(m.module_key)}
                className={'rounded-lg border px-4 py-3 text-left text-sm font-medium transition ' + (on ? 'border-perfios-blue bg-perfios-blue text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-perfios-blue')}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </section>

      {selected.size > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Questionnaire (optional)</h2>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
            <button
              type="button"
              onClick={onGenerateQuestionnaire}
              className="rounded-lg border border-perfios-blue px-4 py-2 text-sm font-medium text-perfios-blue transition hover:bg-perfios-blue hover:text-white"
            >
              Download questionnaire
            </button>
            <label className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              Upload filled questionnaire
              <input type="file" accept=".xlsx" className="hidden" onChange={onUploadQuestionnaire} />
            </label>
            <span className="text-xs text-slate-400">Or just answer the questions below.</span>
          </div>
          {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
        </section>
      )}

      {selected.size > 0 && sections.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">2. Tell us about your needs</h2>
          <p className="mb-3 text-xs text-slate-400">
            Approximate / ballpark counts are fine — exact figures aren&apos;t needed. Questions marked “optional” never affect the price.
          </p>
          <div className="space-y-6">
            {sections.map((section, si) => (
              <div key={section.title} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-perfios-blue">
                  {sectionLetter(si)}. {section.title}
                </div>
                <div className="divide-y divide-slate-100">
                  {section.items.map((item, ni) => {
                    const meta = itemMeta(item)
                    return (
                      <div key={item.code} className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
                            <span className="font-medium text-slate-400">{`${sectionLetter(si)}.${ni + 1}`}</span>
                            <span>{meta.label}</span>
                            {meta.optional && <span className="text-xs font-normal text-slate-400">(optional)</span>}
                            <WhyTip text={meta.why} />
                          </div>
                          {meta.example && <div className="mt-0.5 text-xs text-slate-400">e.g. {meta.example}</div>}
                        </div>
                        <div className="shrink-0">{renderInput(item)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => void onCalculate()}
        disabled={!canCalculate || pricing}
        className="rounded-lg bg-perfios-green px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pricing ? 'Calculating…' : 'Calculate'}
      </button>
      {priceError && <p className="mt-2 text-sm text-red-600">{priceError}</p>}

      {breakdown && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Pricing breakdown</h2>
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
          <p className="mt-2 text-xs text-slate-400">Base cost only. Partners add their own margin in the downloaded Excel.</p>

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
              <textarea rows={2} value={hero} onChange={(e) => { setHero(e.target.value); setSaved(false) }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-perfios-blue focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-sm text-slate-600">Terms &amp; Conditions <span className="text-slate-400">(one per line)</span></span>
              <textarea rows={4} value={terms} onChange={(e) => { setTerms(e.target.value); setSaved(false) }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-perfios-blue focus:outline-none" />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void exportBreakdownXlsx(breakdown, { customerName, hero, terms })}
                className="rounded-lg bg-perfios-green px-5 py-2 text-sm font-semibold text-white transition hover:brightness-95"
              >
                Download Excel
              </button>
              <button type="button" onClick={onSaveLocal} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                {saved ? 'Saved ✓' : 'Remember for next time'}
              </button>
              <span className="text-xs text-slate-400">Hero &amp; terms are saved in this browser.</span>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
