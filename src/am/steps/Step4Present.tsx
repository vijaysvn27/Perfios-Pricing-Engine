// Step 4 — Present & Export. The render path ONLY ever receives
// toClientSafe(record) (D5: channel/internal fields absent at the type
// level); scanForBlocklist re-checks the final model — including AM-typed
// payment/special terms — before any export leaves the browser.
import { useMemo, useState } from 'react'
import type { RateCard } from '../../lib/engine2/types'
import { scanForBlocklist, toClientSafe } from '../../lib/proposal/clientSafe'
import { buildFormat, type FormatKind } from '../../lib/proposal/formats'
import { exportProposalXlsx } from '../../lib/proposal/excelExport'
import { bomForDpBase } from '../../lib/proposal/bomData'
import type { ProposalDraft } from '../../lib/proposal/proposalsRepo'
import { btn, card } from '../../admin/styles'
import RenderModelView from '../RenderModelView'
import { applyCommercialCopy, buildRecord, includeBom, proposalFilename } from '../wizardLogic'

interface Props {
  draft: ProposalDraft
  rateCard: RateCard
  /** Persist the proposal (also invoked automatically before every export). */
  onSave: () => Promise<void>
  saving: boolean
}

const FORMATS: { kind: FormatKind; label: string; hint: string }[] = [
  { kind: 'module_wise', label: 'Module-wise', hint: 'One line per module, Year 1..N + TCO.' },
  { kind: 'saas_style', label: 'SaaS-style', hint: 'Platform fee + implementation + overage framing.' },
  { kind: 'perfios', label: 'Perfios format', hint: 'Client Proposal layout (comparison layout in compare mode).' },
]

// Print only the preview: hide everything, then reveal the .print-root
// subtree and pin it to the page origin so nav/steps/panel never print.
const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  .print-root, .print-root * { visibility: visible; }
  .print-root { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; border: none; }
}
`

export default function Step4Present({ draft, rateCard, onSave, saving }: Props) {
  const [format, setFormat] = useState<FormatKind>('perfios')
  const [exportError, setExportError] = useState<string | null>(null)

  const compare = draft.inputs.compare_all_modes
  // Only the Perfios format has a side-by-side comparison layout.
  const effectiveFormat: FormatKind = compare ? 'perfios' : format

  const model = useMemo(() => {
    const record = buildRecord(draft, rateCard)
    const built = buildFormat(effectiveFormat, toClientSafe(record))
    return applyCommercialCopy(built, draft.inputs.payment_terms, draft.inputs.special_terms)
  }, [draft, rateCard, effectiveFormat])

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
      await exportProposalXlsx(model, { bom, filename: proposalFilename(draft.customer_name) })
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    }
  }

  async function onPrint() {
    if (!(await guardAndSave())) return
    window.print()
  }

  const hasCustomer = draft.customer_name.trim().length > 0

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>

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
          <button type="button" className={btn} disabled={saving || !hasCustomer} onClick={() => void onPrint()}>
            Print / PDF
          </button>
          {!hasCustomer && (
            <span className="text-xs text-amber-600">Enter a customer name (Step 1) to export.</span>
          )}
        </div>
        {exportError && <p className="mt-2 text-xs text-red-600">{exportError}</p>}
      </div>

      <div className={`print-root ${card}`}>
        <RenderModelView model={model} />
      </div>
    </div>
  )
}
