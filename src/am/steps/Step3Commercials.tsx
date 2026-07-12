// Step 3 — Commercials: TCO horizon, discount (entered as %, stored as a
// 0..1 fraction on inputs.discount_pct), the D4 show-discount toggle, and
// the payment / special terms copy that lands on the client document.
import type { DealInputs } from '../../lib/engine2/types'
import type { ProposalDraft, ProposalInputs } from '../../lib/proposal/proposalsRepo'
import { card, inp, toNum } from '../../admin/styles'
import { fractionToPct, pctToFraction } from '../wizardLogic'

interface Props {
  draft: ProposalDraft
  update: (patch: Partial<ProposalDraft>) => void
  updateInputs: (patch: Partial<ProposalInputs>) => void
}

const TCO_YEARS: DealInputs['tco_years'][] = [1, 2, 3, 4, 5]

export default function Step3Commercials({ draft, update, updateInputs }: Props) {
  const { inputs } = draft
  return (
    <div className="space-y-4">
      <div className={`${card} space-y-4`}>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">TCO horizon (years)</span>
          <p className="text-xs text-slate-400">How many years the proposal totals cover.</p>
          <select
            value={inputs.tco_years}
            onChange={(e) => updateInputs({ tco_years: Number(e.target.value) as DealInputs['tco_years'] })}
            className={`mt-1 w-32 ${inp}`}
          >
            {TCO_YEARS.map((y) => (
              <option key={y} value={y}>
                {y} {y === 1 ? 'year' : 'years'}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Discount (%)</span>
          <p className="text-xs text-slate-400">
            Applied uniformly to every line. List and net are both kept internally.
          </p>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={fractionToPct(inputs.discount_pct)}
            onChange={(e) => updateInputs({ discount_pct: pctToFraction(toNum(e.target.value)) })}
            className={`mt-1 w-32 text-right ${inp}`}
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.discount_shown}
            onChange={(e) => update({ discount_shown: e.target.checked })}
          />
          Show list price and discount on client document
          <span className="text-xs text-slate-400">— off = net figures only.</span>
        </label>
      </div>

      <div className={`${card} space-y-4`}>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Payment terms</span>
          <p className="text-xs text-slate-400">One bullet per line. Rendered on the client document.</p>
          <textarea
            rows={4}
            value={inputs.payment_terms}
            onChange={(e) => updateInputs({ payment_terms: e.target.value })}
            className={`mt-1 w-full ${inp}`}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Special terms</span>
          <p className="text-xs text-slate-400">
            Optional. One bullet per line — added as a &ldquo;Special Terms&rdquo; section on the client document.
          </p>
          <textarea
            rows={3}
            value={inputs.special_terms}
            onChange={(e) => updateInputs({ special_terms: e.target.value })}
            className={`mt-1 w-full ${inp}`}
          />
        </label>
      </div>
    </div>
  )
}
