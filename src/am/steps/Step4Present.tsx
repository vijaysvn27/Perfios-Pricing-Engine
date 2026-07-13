// Step 4 — Present & Export. The render path ONLY ever receives
// toClientSafe(record) (D5: channel/internal fields absent at the type
// level); scanForBlocklist re-checks the final model — including AM-typed
// payment/special/narrative terms — before any export leaves the browser.
import { useMemo, useState } from 'react'
import logoUrl from '../../assets/perfios-logo.png'
import type { RateCard } from '../../lib/engine2/types'
import { scanForBlocklist, toClientSafe } from '../../lib/proposal/clientSafe'
import { buildFormat, type FormatKind } from '../../lib/proposal/formats'
import { exportProposalXlsx } from '../../lib/proposal/excelExport'
import { exportProposalDocx } from '../../lib/proposal/wordExport'
import { bomForDpBase, BOM_NOTES } from '../../lib/proposal/bomData'
import { buildNarrative } from '../../lib/proposal/narrative'
import type { ProposalDraft } from '../../lib/proposal/proposalsRepo'
import { btn, card, inp } from '../../admin/styles'
import RenderModelView from '../RenderModelView'
import { applyCommercialCopy, applyNarrativeCopy, buildRecord, includeBom, proposalFilename } from '../wizardLogic'

interface Props {
  draft: ProposalDraft
  rateCard: RateCard
  /** Persists narrative overrides onto the draft so they survive step changes and saves. */
  updateInputs: (patch: Partial<ProposalDraft['inputs']>) => void
  /** Persist the proposal (also invoked automatically before every export). */
  onSave: () => Promise<void>
  saving: boolean
}

const FORMATS: { kind: FormatKind; label: string; hint: string }[] = [
  { kind: 'module_wise', label: 'Module-wise', hint: 'One line per module, Year 1..N + TCO.' },
  { kind: 'saas_style', label: 'SaaS-style', hint: 'Committed base + per-user rate + implementation framing.' },
  { kind: 'perfios', label: 'Perfios format', hint: 'Client Proposal layout (comparison layout in compare mode).' },
]

/** Fetch the bundled logo as raw bytes for the Excel/Word exports' embedded
 * image. Falls back to undefined (the wordmark) if the asset can't be loaded. */
async function fetchLogoBuffer(): Promise<ArrayBuffer | undefined> {
  try {
    const res = await fetch(logoUrl)
    return await res.arrayBuffer()
  } catch {
    return undefined
  }
}

export default function Step4Present({ draft, rateCard, updateInputs, onSave, saving }: Props) {
  const [format, setFormat] = useState<FormatKind>('perfios')
  const [exportError, setExportError] = useState<string | null>(null)
  // Narrative overrides (item 4): '' means "use the scope-aware generated
  // default" — same blank-means-keep-default convention as payment/special
  // terms (applyCommercialCopy). Persisted on the draft inputs so they
  // survive step navigation, reloads, and saves.
  const execOverride = draft.inputs.executive_summary_override ?? ''
  const solutionOverride = draft.inputs.solution_overview_override ?? ''

  const compare = draft.inputs.compare_all_modes
  // Only the Perfios format has a side-by-side comparison layout.
  const effectiveFormat: FormatKind = compare ? 'perfios' : format
  // Stable within the session; deterministic date threading (no Date.now()
  // inside the pure format builders — see formats/cover.ts).
  const asOfDate = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const clientSafe = useMemo(() => toClientSafe(buildRecord(draft, rateCard)), [draft, rateCard])
  const narrativeDefaults = useMemo(() => buildNarrative(clientSafe), [clientSafe])

  const model = useMemo(() => {
    const built = buildFormat(effectiveFormat, clientSafe, asOfDate)
    const withCommercial = applyCommercialCopy(built, draft.inputs.payment_terms, draft.inputs.special_terms)
    return applyNarrativeCopy(withCommercial, {
      executive_summary: execOverride,
      solution_overview: solutionOverride,
    })
  }, [clientSafe, effectiveFormat, asOfDate, draft.inputs.payment_terms, draft.inputs.special_terms, execOverride, solutionOverride])

  const offenders = useMemo(() => scanForBlocklist(model), [model])

  async function guardAndSave(): Promise<boolean> {
    setExportError(null)
    if (offenders.length > 0) {
      setExportError(`Blocked partner terms in the client document: ${offenders.join(', ')}. Remove them before exporting.`)
      return false
    }
    try {
      await onSave()
      return true
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
      return false
    }
  }

  async function onExportExcel() {
    if (!(await guardAndSave())) return
    const bom = includeBom(draft.inputs.deployment_mode, draft.inputs.modules)
      ? bomForDpBase(draft.inputs.dp_base_y1)
      : undefined
    try {
      const logo = await fetchLogoBuffer()
      await exportProposalXlsx(model, { bom, logo, filename: proposalFilename(draft.customer_name) })
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onExportWord() {
    if (!(await guardAndSave())) return
    const bom = includeBom(draft.inputs.deployment_mode, draft.inputs.modules)
      ? bomForDpBase(draft.inputs.dp_base_y1)
      : undefined
    try {
      const logo = await fetchLogoBuffer()
      await exportProposalDocx(model, {
        bom,
        bomNotes: BOM_NOTES,
        logo,
        customer: draft.customer_name,
        filename: proposalFilename(draft.customer_name).replace(/\.xlsx$/, '.docx'),
      })
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    }
  }

  const hasCustomer = draft.customer_name.trim().length > 0

  return (
    <div className="space-y-4">
      <div className={card}>
        <span className="text-sm font-medium text-slate-700">Presentation format</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {FORMATS.map((f) => {
            const active = effectiveFormat === f.kind
            const disabled = compare && f.kind !== 'perfios'
            return (
              <button
                key={f.kind}
                type="button"
                disabled={disabled}
                onClick={() => setFormat(f.kind)}
                title={f.hint}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  active
                    ? 'border-perfios-blue bg-perfios-blue text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-perfios-blue'
                } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
        {compare && (
          <p className="mt-2 text-xs text-slate-400">
            Compare mode uses the Perfios comparison layout (Option A / B / C side by side).
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={btn} disabled={saving} onClick={() => void guardAndSave()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className={btn} disabled={saving || !hasCustomer} onClick={() => void onExportExcel()}>
            Download Excel
          </button>
          <button type="button" className={btn} disabled={saving || !hasCustomer} onClick={() => void onExportWord()}>
            Download Word
          </button>
          {!hasCustomer && (
            <span className="text-xs text-amber-600">Enter a customer name (Step 1) to export.</span>
          )}
        </div>
        {exportError && <p className="mt-2 text-xs text-red-600">{exportError}</p>}
      </div>

      <div className={`${card} space-y-4`}>
        <p className="text-sm font-medium text-slate-700">Template narrative</p>
        <p className="text-xs text-slate-400">
          Prefilled from your scope (customer, deployment mode, DP base, selected modules). Edit only if you
          want different wording — blank reverts to the generated copy.
        </p>
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Executive Summary</span>
          <textarea
            rows={4}
            value={execOverride || narrativeDefaults.executive_summary}
            onChange={(e) => updateInputs({ executive_summary_override: e.target.value })}
            className={`mt-1 w-full ${inp}`}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Solution Overview</span>
          <textarea
            rows={4}
            value={solutionOverride || narrativeDefaults.solution_overview}
            onChange={(e) => updateInputs({ solution_overview_override: e.target.value })}
            className={`mt-1 w-full ${inp}`}
          />
        </label>
      </div>

      <div className={card}>
        <RenderModelView model={model} />
      </div>
    </div>
  )
}
