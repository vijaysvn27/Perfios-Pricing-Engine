import { useState } from 'react'
import type { InstanceRow } from '../lib/config/instancesRepo'
import { cloneInstance, regenerateToken, renameInstance } from '../lib/config/instancesRepo'
import { btn, btnGreen, card, th } from './styles'

interface Props {
  instances: InstanceRow[]
  liveVersions: Record<string, number>
  templateId: string | null
  selectedInstanceId: string | null
  onSelect: (id: string) => void
  onChanged: () => void
}

function linkFor(token: string | null): string | null {
  return token ? `${window.location.origin}/#/c/${token}` : null
}

export default function InstancesManager({ instances, liveVersions, templateId, selectedInstanceId, onSelect, onChanged }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

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

  async function onCreate() {
    if (!templateId) return
    const name = window.prompt('New instance name (e.g. partner name):')?.trim()
    if (!name) return
    await run(async () => {
      const id = await cloneInstance(templateId, name)
      onChanged()
      onSelect(id)
    })
  }

  async function onRename(inst: InstanceRow) {
    const name = window.prompt('Rename instance:', inst.name)?.trim()
    if (!name || name === inst.name) return
    await run(async () => {
      await renameInstance(inst.id, name)
      onChanged()
    })
  }

  async function onRegen(inst: InstanceRow) {
    if (!window.confirm(`Regenerate the share link for "${inst.name}"? The old link will stop working.`)) return
    await run(async () => {
      await regenerateToken(inst.id)
      onChanged()
    })
  }

  async function onCopy(inst: InstanceRow) {
    const link = linkFor(inst.share_token)
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(inst.id)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setErr('Could not copy to clipboard — copy it manually: ' + link)
    }
  }

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-perfios-blue">Instances</h2>
        <button type="button" className={btnGreen} disabled={busy || !templateId} onClick={() => void onCreate()}>
          + Create instance
        </button>
      </div>
      {err && <p className="mb-2 text-xs text-red-600">{err}</p>}

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Name</th>
            <th className={th}>Created</th>
            <th className={th}>Live</th>
            <th className={th}>Share link</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {instances.map((inst) => {
            const isSel = inst.id === selectedInstanceId
            return (
              <tr key={inst.id} className={'border-t border-slate-100 ' + (isSel ? 'bg-perfios-blue/5' : '')}>
                <td className="px-2 py-1 text-sm">
                  {inst.name}
                  {inst.is_template && <span className="ml-1 text-xs text-slate-400">(Template)</span>}
                  {isSel && <span className="ml-2 rounded bg-perfios-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-perfios-blue">editing</span>}
                </td>
                <td className="px-2 py-1 text-xs text-slate-500">{new Date(inst.created_at).toLocaleDateString('en-IN')}</td>
                <td className="px-2 py-1 text-sm">{liveVersions[inst.id] ? `v${liveVersions[inst.id]}` : '—'}</td>
                <td className="px-2 py-1 text-xs">
                  {inst.is_template ? (
                    <span className="text-slate-400">not shared</span>
                  ) : inst.share_token ? (
                    <button type="button" className="font-medium text-perfios-blue underline" onClick={() => void onCopy(inst)}>
                      {copied === inst.id ? 'Copied!' : 'Copy link'}
                    </button>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="space-x-1 px-2 py-1 text-right">
                  {!isSel && <button type="button" className={btn} onClick={() => onSelect(inst.id)}>Select</button>}
                  <button type="button" className={btn} disabled={busy} onClick={() => void onRename(inst)}>Rename</button>
                  {!inst.is_template && <button type="button" className={btn} disabled={busy} onClick={() => void onRegen(inst)}>Regen link</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="mt-3 text-xs text-slate-400">
        Select an instance to edit its pricing in the other tabs, then Publish. Share links open the
        no-login calculator (active from Step 5); they return pricing only once that instance has a
        published live version.
      </p>
    </div>
  )
}
