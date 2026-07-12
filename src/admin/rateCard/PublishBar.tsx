import { useCallback, useEffect, useState } from 'react'
import {
  listVersions,
  publishDraft,
  RateCardValidationError,
  rollback,
  type RateCardVersionRow,
} from '../../lib/rateCard/repo'
import type { RateCardError } from '../../lib/rateCard/validate'
import { btn, btnGreen, card, th } from '../styles'

interface Props {
  instanceId: string
  /** validateRateCard(draft) — recomputed by the parent on every change. */
  errors: RateCardError[]
  /** False while the rate_cards table is missing: publish is impossible. */
  persisted: boolean
  dirty: boolean
  saving: boolean
  /** Persists the current local draft; throws if the save fails. */
  onSaveDraft: () => Promise<void>
  /** Reloads the parent's draft state from the repo (after rollback). */
  onDraftReloaded: () => Promise<void>
}

/** Publish bar: validation list, save/publish buttons, version history + rollback. */
export default function PublishBar({ instanceId, errors, persisted, dirty, saving, onSaveDraft, onDraftReloaded }: Props) {
  const [versions, setVersions] = useState<RateCardVersionRow[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [rollbackBusy, setRollbackBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const loadVersions = useCallback(async () => {
    if (!persisted) {
      setVersions([])
      return
    }
    try {
      setVersions(await listVersions(instanceId))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }, [instanceId, persisted])

  useEffect(() => {
    void loadVersions()
  }, [loadVersions, refreshKey])

  const clean = errors.length === 0

  async function onPublish() {
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      await onSaveDraft()
      const { version } = await publishDraft(instanceId)
      setMsg(`Published version ${version} — now live for proposals.`)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      if (e instanceof RateCardValidationError) {
        setErr(e.errors.map((x) => `${x.path}: ${x.message}`).join('; '))
      } else {
        setErr(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setBusy(false)
    }
  }

  async function onRollback(version: number) {
    if (!window.confirm(`Re-publish version ${version} as a new version? The current draft will be replaced by that snapshot.`)) return
    setRollbackBusy(version)
    setMsg(null)
    setErr(null)
    try {
      const res = await rollback(instanceId, version)
      setMsg(`Rolled back: version ${version} re-published as version ${res.version}.`)
      setRefreshKey((k) => k + 1)
      await onDraftReloaded()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRollbackBusy(null)
    }
  }

  return (
    <div className={card}>
      <h2 className="mb-2 text-sm font-semibold text-perfios-blue">Validate &amp; publish</h2>

      {clean ? (
        <p className="text-sm text-perfios-green">✓ Draft is valid and ready to publish.</p>
      ) : (
        <ul className="space-y-1">
          {errors.map((e, i) => (
            <li key={`${e.path}-${i}`} className="text-xs text-red-600">
              <span className="font-mono text-red-400">{e.path}</span> — {e.message}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button type="button" className={btn} disabled={!persisted || saving || !dirty} onClick={() => void onSaveDraft().catch(() => undefined)}>
          {saving ? 'Saving…' : dirty ? 'Save draft' : 'Draft saved'}
        </button>
        <button type="button" className={btnGreen} disabled={!clean || !persisted || busy} onClick={() => void onPublish()}>
          {busy ? 'Publishing…' : 'Publish'}
        </button>
      </div>
      {!persisted && (
        <p className="mt-2 text-xs text-amber-600">Publishing needs the rate_cards table (migration 0026).</p>
      )}
      {msg && <p className="mt-2 text-xs text-perfios-green">{msg}</p>}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}

      <h3 className="mb-1 mt-4 border-t border-slate-100 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Version history
      </h3>
      {versions.length === 0 ? (
        <p className="text-xs text-slate-400">
          {persisted ? 'Nothing published yet — proposals use the built-in seed.' : 'Unavailable until migration 0026 is applied.'}
        </p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Version</th>
              <th className={th}>When</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v, i) => (
              <tr key={v.version} className="border-t border-slate-100">
                <td className="px-2 py-1 text-sm">
                  v{v.version}
                  {i === 0 && (
                    <span className="ml-1 rounded bg-perfios-green/15 px-1.5 py-0.5 text-xs font-medium text-perfios-green">LIVE</span>
                  )}
                </td>
                <td className="px-2 py-1 text-xs text-slate-500">{new Date(v.created_at).toLocaleString('en-IN')}</td>
                <td className="px-2 py-1 text-right">
                  {i > 0 && (
                    <button
                      type="button"
                      className={btn}
                      disabled={rollbackBusy !== null}
                      onClick={() => void onRollback(v.version)}
                    >
                      {rollbackBusy === v.version ? 'Rolling…' : 'Rollback'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
