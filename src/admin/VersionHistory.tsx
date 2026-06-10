import { useCallback, useEffect, useState } from 'react'
import { listVersions, rollback, type VersionRow } from '../lib/config/versions'
import { btn, card, th } from './styles'

interface Props {
  instanceId: string
  /** Bumped by the parent after a publish so the list refreshes. */
  refreshKey: number
  onRolledBack: () => void
}

export default function VersionHistory({ instanceId, refreshKey, onRolledBack }: Props) {
  const [rows, setRows] = useState<VersionRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await listVersions(instanceId))
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }, [instanceId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  async function onRollback(versionNo: number) {
    setBusy(versionNo)
    try {
      await rollback(instanceId, versionNo)
      await load()
      onRolledBack()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={card}>
      <h2 className="mb-3 text-sm font-semibold text-perfios-blue">Version history</h2>
      {err && <p className="mb-2 text-xs text-red-600">{err}</p>}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Version</th>
            <th className={th}>Published by</th>
            <th className={th}>When</th>
            <th className={th}>Status</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.version_no} className="border-t border-slate-100">
              <td className="px-2 py-1 text-sm">v{r.version_no}</td>
              <td className="px-2 py-1 text-sm text-slate-600">{r.published_by ?? '—'}</td>
              <td className="px-2 py-1 text-xs text-slate-500">{new Date(r.published_at).toLocaleString('en-IN')}</td>
              <td className="px-2 py-1">
                {r.is_live ? (
                  <span className="rounded bg-perfios-green/15 px-2 py-0.5 text-xs font-medium text-perfios-green">LIVE</span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
              <td className="px-2 py-1 text-right">
                {!r.is_live && (
                  <button type="button" className={btn} disabled={busy === r.version_no} onClick={() => onRollback(r.version_no)}>
                    {busy === r.version_no ? 'Rolling…' : 'Make live'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
