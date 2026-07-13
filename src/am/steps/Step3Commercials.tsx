// Step 3 — Commercials: the AM PRICING WORKSHEET (owner spec: "an AM tab
// where the AM can see the pricing breakup, make changes to any row/column,
// get the final price, then print it on Word or Excel"). The grid shows the
// engine's priced breakup — one row per included component, one column per
// one-time / year cell — and every cell is directly editable: typing a
// number stores a per-cell override on inputs.pricing_overrides
// (pricingOverrides.ts), which wizardLogic.buildRecord folds into the
// results before any document is built. TCO horizon, the D4 show toggle,
// and the payment / special terms copy live here too.
//
// The legacy single "Discount (%)" field is superseded by the worksheet
// (Apply-%-across covers the old use case cell-by-cell) and is no longer
// rendered. inputs.discount_pct stays in the type and engine2's price()
// still honors it, so OLD records that carry a non-zero discount_pct keep
// pricing exactly as before — they just can't set a NEW one here.
import { useState } from 'react'
import type { ComponentLine, DealInputs, ModeResult } from '../../lib/engine2/types'
import { formatINR } from '../../lib/format'
import {
  applyPctAcross,
  hasOverrides,
  overrideKey,
  type PricingOverrides,
} from '../../lib/proposal/pricingOverrides'
import type { ProposalDraft, ProposalInputs } from '../../lib/proposal/proposalsRepo'
import { card, inp, th, toNum } from '../../admin/styles'
import { pctToFraction } from '../wizardLogic'

interface Props {
  draft: ProposalDraft
  /** The single-mode LIST priced result (pre-override), computed once by
   * ProposalWizard and shared with PricePanel. Null in compare mode. */
  result: ModeResult | null
  update: (patch: Partial<ProposalDraft>) => void
  updateInputs: (patch: Partial<ProposalInputs>) => void
}

const TCO_YEARS: DealInputs['tco_years'][] = [1, 2, 3, 4, 5]

const cellInp =
  'w-28 rounded-md border px-2 py-1 text-right text-sm tabular-nums focus:border-perfios-blue focus:outline-none'

/** A cell's effective (worksheet) value: its valid override, else list. */
function effectiveCell(list: number, override: number | undefined): number {
  return override !== undefined && Number.isFinite(override) && override >= 0 ? override : list
}

interface CellProps {
  list: number
  overrideValue: number | undefined
  onChange: (value: number | undefined) => void
}

/** One editable money cell: override-aware value, amber when negotiated,
 * with a small "list ₹X" hint under a changed cell. Clearing the input
 * removes the override (back to list). */
function WorksheetCell({ list, overrideValue, onChange }: CellProps) {
  const effective = effectiveCell(list, overrideValue)
  const changed = effective !== list
  return (
    <td className="px-2 py-1.5 text-right align-top">
      <input
        type="number"
        min={0}
        value={effective}
        onChange={(e) => {
          const raw = e.target.value
          if (raw.trim() === '') {
            onChange(undefined) // cleared = back to list price
            return
          }
          const n = toNum(raw)
          // Negative input is never a price (applyPricingOverrides ignores
          // it anyway) and typing the list price back = no override.
          onChange(n < 0 || n === list ? undefined : n)
        }}
        className={`${cellInp} ${changed ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`}
      />
      {changed && <div className="mt-0.5 text-right text-[11px] text-amber-600">list {formatINR(list)}</div>}
    </td>
  )
}

export default function Step3Commercials({ draft, result, update, updateInputs }: Props) {
  const { inputs } = draft
  const overrides = inputs.pricing_overrides
  const [pctInput, setPctInput] = useState('')

  const setOverride = (component: ComponentLine['component_key'], cell: 'one_time' | number, value: number | undefined) => {
    const key = overrideKey(component, cell)
    const next: PricingOverrides = { ...(overrides ?? {}) }
    if (value === undefined) delete next[key]
    else next[key] = value
    updateInputs({ pricing_overrides: Object.keys(next).length > 0 ? next : undefined })
  }

  const applyPct = () => {
    if (!result) return
    const pct = pctToFraction(toNum(pctInput))
    updateInputs({ pricing_overrides: applyPctAcross(result, pct) })
  }

  const resetToList = () => {
    if (!hasOverrides(overrides)) return
    if (window.confirm('Reset every cell to the list price? All negotiated values on this worksheet will be cleared.')) {
      updateInputs({ pricing_overrides: undefined })
    }
  }

  const included = result?.lines.filter((l) => l.included) ?? []
  const years = result?.total_years_inr.length ?? inputs.tco_years

  // Effective (override-aware) numbers for the read-only computed cells: a
  // row's TCO and the TOTAL row. Display-only re-derivation — the numbers
  // that land on documents are computed by applyPricingOverrides in
  // wizardLogic.buildRecord, and PricePanel shows the same via the shared
  // helper; this grid mirrors that arithmetic cell-for-cell.
  const effYear = (l: ComponentLine, i: number): number =>
    effectiveCell(l.years_inr[i], overrides?.[overrideKey(l.component_key, i)])
  const effOneTime = (l: ComponentLine): number =>
    effectiveCell(l.one_time_inr, overrides?.[overrideKey(l.component_key, 'one_time')])
  const effTco = (l: ComponentLine): number => l.years_inr.reduce((acc, _, i) => acc + effYear(l, i), 0)
  const totalYear = (i: number): number => included.reduce((acc, l) => acc + effYear(l, i), 0)
  const totalOneTime = included.reduce((acc, l) => acc + effOneTime(l), 0)
  const totalTco = included.reduce((acc, l) => acc + effTco(l), 0)
  const listTco = included.reduce((acc, l) => acc + l.tco_inr, 0)

  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-perfios-blue">Commercials — Pricing Worksheet</h2>
          {result && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-slate-600">
                Apply % across
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={pctInput}
                  onChange={(e) => setPctInput(e.target.value)}
                  placeholder="%"
                  className={`w-16 text-right ${inp}`}
                />
              </label>
              <button
                type="button"
                onClick={applyPct}
                className="rounded-md border border-perfios-blue px-2 py-1 text-xs font-medium text-perfios-blue hover:bg-slate-50"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={resetToList}
                disabled={!hasOverrides(overrides)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reset to list prices
              </button>
            </div>
          )}
        </div>

        {!result ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            Worksheet applies to single-mode proposals — switch off Compare to negotiate line items.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-400">
              Every price cell is editable — type a negotiated figure and the totals, the live price panel, and the
              exported Word/Excel documents all follow. Amber cells differ from list.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className={th}>Component</th>
                    <th className={`${th} text-right`}>One-time</th>
                    {Array.from({ length: years }, (_, i) => (
                      <th key={i} className={`${th} text-right`}>
                        Year {i + 1}
                      </th>
                    ))}
                    <th className={`${th} text-right`}>{years}-yr TCO</th>
                  </tr>
                </thead>
                <tbody>
                  {included.map((l) => (
                    <tr key={l.component_key} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-1.5 text-slate-700">{l.label}</td>
                      <WorksheetCell
                        list={l.one_time_inr}
                        overrideValue={overrides?.[overrideKey(l.component_key, 'one_time')]}
                        onChange={(v) => setOverride(l.component_key, 'one_time', v)}
                      />
                      {l.years_inr.map((listValue, i) => (
                        <WorksheetCell
                          key={i}
                          list={listValue}
                          overrideValue={overrides?.[overrideKey(l.component_key, i)]}
                          onChange={(v) => setOverride(l.component_key, i, v)}
                        />
                      ))}
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{formatINR(effTco(l))}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-2 py-1.5 text-slate-700">TOTAL</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-800">{formatINR(totalOneTime)}</td>
                    {Array.from({ length: years }, (_, i) => (
                      <td key={i} className="px-2 py-1.5 text-right tabular-nums text-slate-800">
                        {formatINR(totalYear(i))}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right tabular-nums text-perfios-blue">{formatINR(totalTco)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {hasOverrides(overrides) && (
              <p className="text-xs text-slate-400">
                Negotiated {years}-yr TCO {formatINR(totalTco)} — list {formatINR(listTco)}.
              </p>
            )}
          </>
        )}
      </div>

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

        {/* The legacy single "Discount (%)" input used to render here. It is
            superseded by the per-cell worksheet above (Apply-%-across covers
            the uniform case) and is intentionally NOT rendered any more.
            inputs.discount_pct remains in the persisted type and engine2's
            price() still applies it, so pre-worksheet records that carry a
            non-zero discount_pct keep their exact pricing behavior. */}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.discount_shown}
            onChange={(e) => update({ discount_shown: e.target.checked })}
          />
          Show list price vs negotiated on the client document
          <span className="text-xs text-slate-400">— off = negotiated figures only.</span>
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
