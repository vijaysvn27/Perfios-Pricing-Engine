// Top-level AM surface: proposal list (open / duplicate / delete / new) and
// the 4-step wizard. Routing entry point — the coordinator wires this into
// App.tsx with the instance id for the AM's instance.
import { useCallback, useEffect, useState } from 'react'
import {
  duplicateProposal,
  listProposals,
  removeProposal,
  type ProposalRow,
} from '../lib/proposal/proposalsRepo'
import { formatINR } from '../lib/format'
import { btn, btnGreen, card, th } from '../admin/styles'
import ProposalWizard from './ProposalWizard'
import { MODE_LABELS } from './wizardLogic'

interface Props {
  instanceId: string
}

type View = { kind: 'list' } | { kind: 'wizard'; initial: ProposalRow | null }

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

  if (view.kind === 'wizard') {
    return (
      <ProposalWizard
        instanceId={instanceId}
        initial={view.initial}
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-perfios-blue">Proposals</h1>
        <button type="button" className={btnGreen} onClick={() => setView({ kind: 'wizard', initial: null })}>
          + New Proposal
        </button>
      </div>

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
