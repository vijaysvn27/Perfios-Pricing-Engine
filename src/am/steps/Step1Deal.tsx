// Step 1 — Deal: customer, channel (internal only), validity, internal notes.
import type { Channel } from '../../lib/proposal/clientSafe'
import type { ProposalDraft } from '../../lib/proposal/proposalsRepo'
import { card, inp, toNum } from '../../admin/styles'

interface Props {
  draft: ProposalDraft
  update: (patch: Partial<ProposalDraft>) => void
}

const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'direct', label: 'Direct' },
  { value: 'aurva', label: 'Aurva' },
  { value: 'techjockey', label: 'TechJockey' },
  { value: 'pwc', label: 'PwC' },
]

const INTERNAL_CAPTION = 'Internal — never shown to client'

export default function Step1Deal({ draft, update }: Props) {
  return (
    <div className={`${card} space-y-4`}>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Customer name</span>
        <input
          value={draft.customer_name}
          onChange={(e) => update({ customer_name: e.target.value })}
          placeholder="e.g. Acme Bank"
          className={`mt-1 w-full ${inp}`}
        />
        <p className="mt-1 text-xs text-slate-400">Appears on the client document and in the export filename.</p>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Channel</span>
        <select
          value={draft.channel}
          onChange={(e) => update({ channel: e.target.value as Channel })}
          className={`mt-1 w-full ${inp}`}
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs font-medium text-amber-600">{INTERNAL_CAPTION}</p>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Validity (days)</span>
        <input
          type="number"
          min={1}
          step={1}
          value={draft.validity_days}
          onChange={(e) => update({ validity_days: Math.max(1, Math.trunc(toNum(e.target.value))) })}
          className={`mt-1 w-32 text-right ${inp}`}
        />
        <p className="mt-1 text-xs text-slate-400">How long the quoted prices hold. Default 60 days.</p>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Internal notes</span>
        <textarea
          rows={3}
          value={draft.internal_notes}
          onChange={(e) => update({ internal_notes: e.target.value })}
          placeholder="Deal context, competitive notes, approvals…"
          className={`mt-1 w-full ${inp}`}
        />
        <p className="mt-1 text-xs font-medium text-amber-600">{INTERNAL_CAPTION}</p>
      </label>
    </div>
  )
}
