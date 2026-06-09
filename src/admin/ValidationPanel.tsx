import { useState } from 'react'
import type { ConfigSnapshot } from '../lib/engine'
import type { ValidationError } from '../lib/config/types'
import { publish } from '../lib/config/versions'
import { btnGreen, card, inp } from './styles'

interface Props {
  snapshot: ConfigSnapshot
  errors: ValidationError[]
  onPublished: (versionNo: number) => void
}

export default function ValidationPanel({ snapshot, errors, onPublished }: Props) {
  const [publishedBy, setPublishedBy] = useState('admin')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const clean = errors.length === 0

  async function onPublish() {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const v = await publish(snapshot, publishedBy)
      setMsg(`Published version ${v} (now live).`)
      onPublished(v)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={card}>
      <h3 className="mb-2 text-sm font-semibold text-perfios-blue">Validation</h3>
      {clean ? (
        <p className="text-sm text-perfios-green">✓ Draft is valid and ready to publish.</p>
      ) : (
        <ul className="space-y-1">
          {errors.map((e, i) => (
            <li key={`${e.code}-${e.entityKey}-${i}`} className="text-xs text-red-600">
              • {e.message}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          className={`${inp} flex-1`}
          value={publishedBy}
          onChange={(e) => setPublishedBy(e.target.value)}
          placeholder="Published by"
          aria-label="Published by"
        />
        <button type="button" className={btnGreen} disabled={!clean || busy} onClick={onPublish}>
          {busy ? 'Publishing…' : 'Publish'}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-perfios-green">{msg}</p>}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  )
}
