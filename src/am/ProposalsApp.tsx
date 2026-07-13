// Top-level AM surface: proposal list (open / duplicate / delete / new) and
// the 4-step wizard. Routing entry point — the coordinator wires this into
// App.tsx with the instance id for the AM's instance.
import { useCallback, useEffect, useState } from 'react'
import {
  duplicateProposal,
  listProposals,
  newProposalId,
  removeProposal,
  type ProposalRow,
} from '../lib/proposal/proposalsRepo'
import { mergeQuestionnaireInputs, type QuestionnaireImportResult } from '../lib/proposal/questionnaireImport'
import { downloadQuestionnaireXlsx } from '../lib/proposal/questionnaireExport'
import { formatINR } from '../lib/format'
import { btn, btnGreen, card, th } from '../admin/styles'
import ProposalWizard from './ProposalWizard'
import QuestionnaireImportButton from './QuestionnaireImportButton'
import { MODE_LABELS, defaultInputs, emptyTotals } from './wizardLogic'

interface Props {
  instanceId: string
}

type View = { kind: 'list' } | { kind: 'wizard'; initial: ProposalRow | null; initialStep?: number }

function modeLabel(row: ProposalRow): string {
  if (row.inputs.compare_all_modes) return 'Compare'
  return MODE_LABELS[row.inputs.deployment_mode]
}

function tcoLabel(row: ProposalRow): string {
  const t = row.totals
  if (!t || t.tco_years === 0) return '—'
  const net = t.net_total_tco_inr < t.total_tco_inr
  return `${formatINR(net ? t.net_total_tco_inr : t.total_tco_inr)} (${t.tco_years}-yr${net ? ', net' : ''})`
}

export default function ProposalsApp({ instanceId }: Props) {
  const [rows, setRows] = useState<ProposalRow[]>([])
  const [persisted, setPersisted] = useState(true)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<View>({ kind: 'list' })
  // Account name for the questionnaire download (owner 2026-07-13: the
  // questionnaire must be traceable to the account it was sent to) — stamps
  // "Prepared for: {account}" in the workbook and names the download file
  // "{account}_Perfios_DPDP_Questionnaire.xlsx"; Download stays disabled
  // until this is non-empty.
  const [qAccountName, setQAccountName] = useState('')

  const reload = useCallback(async () => {
    try {
      const res = await listProposals(instanceId)
      setRows(res.rows)
      setPersisted(res.persisted)
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [instanceId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setErr(null)
    try {
      await fn()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Same "new proposal" path as the button below, except the draft starts
   * from the questionnaire's parsed answers (merged over the usual defaults)
   * instead of blank. Nothing is persisted yet — the AM still reviews and
   * saves from inside the wizard, same as any other new proposal.
   */
  function handleQuestionnaireImported(result: QuestionnaireImportResult) {
    const validityDays = 60
    const now = new Date().toISOString()
    const row: ProposalRow = {
      id: newProposalId(),
      instance_id: instanceId,
      customer_name: result.customer_name ?? '',
      channel: 'direct',
      internal_notes: result.notes.join('\n'),
      validity_days: validityDays,
      inputs: mergeQuestionnaireInputs(defaultInputs(validityDays), result.inputs),
      rate_card_version: 0,
      totals: emptyTotals(),
      discount_shown: true,
      created_at: now,
      updated_at: now,
    }
    // Land on Scope (step 1) so the AM reviews the imported values first.
    setView({ kind: 'wizard', initial: row, initialStep: 1 })
  }

  if (view.kind === 'wizard') {
    return (
      <ProposalWizard
        instanceId={instanceId}
        initial={view.initial}
        initialStep={view.initialStep}
        onBack={() => {
          setView({ kind: 'list' })
          void reload()
        }}
        onSaved={(p) => setPersisted(p)}
      />
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-perfios-blue">Proposals</h1>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={qAccountName}
            onChange={(e) => setQAccountName(e.target.value)}
            placeholder="Account name"
            className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-perfios-blue focus:outline-none"
          />
          <button
            type="button"
            className={btn}
            disabled={busy || qAccountName.trim() === ''}
            onClick={() =>
              void run(async () => {
                await downloadQuestionnaireXlsx(qAccountName.trim())
              })
            }
          >
            Download questionnaire
          </button>
          <QuestionnaireImportButton onImported={handleQuestionnaireImported} disabled={busy} />
          <button type="button" className={btnGreen} onClick={() => setView({ kind: 'wizard', initial: null })}>
            + New Proposal
          </button>
        </div>
      </div>
      <p className="mb-4 text-right text-xs text-slate-500">
        Enter the account name to download the questionnaire — it stamps &ldquo;Prepared for&rdquo; and names the
        file, and always reflects the current template that imports back automatically.
      </p>

      {!persisted && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Proposals table not migrated — proposals are saved locally in this browser only.
        </div>
      )}
      {err && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className={card}>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            No proposals yet. Click &ldquo;+ New Proposal&rdquo; to build the first one.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Customer</th>
                <th className={th}>Mode</th>
                <th className={th}>TCO</th>
                <th className={th}>Updated</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-700">{row.customer_name || '(unnamed)'}</td>
                  <td className="px-2 py-2 text-slate-600">{modeLabel(row)}</td>
                  <td className="px-2 py-2 tabular-nums text-slate-700">{tcoLabel(row)}</td>
                  <td className="px-2 py-2 text-slate-500">{new Date(row.updated_at).toLocaleDateString()}</td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className={btn}
                        disabled={busy}
                        onClick={() => setView({ kind: 'wizard', initial: row })}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await duplicateProposal(instanceId, row.id)
                            await reload()
                          })
                        }
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Delete the proposal for "${row.customer_name || 'this customer'}"?`)) return
                          void run(async () => {
                            await removeProposal(instanceId, row.id)
                            await reload()
                          })
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
