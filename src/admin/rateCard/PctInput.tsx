import { inp, toNum } from '../styles'
import { inputToPct, pctToInput } from './helpers'

interface Props {
  /** Stored value: a 0..1 fraction (e.g. 0.18). */
  value: number
  /** Receives the new stored fraction (e.g. 0.18) — never the raw percent. */
  onChange: (fraction: number) => void
  className?: string
}

/**
 * Shared percent input for the admin Rate Card page (owner: "when you say
 * deployment/implementation in %, the input should not be in decimal").
 * Displays and accepts whole-percent numbers (18, 30, 20, 15, 12) with a "%"
 * suffix; converts to/from the stored 0..1 fraction at the input boundary via
 * pctToInput / inputToPct (rounded to 4 decimal places on the fraction, so
 * round-tripping never produces 0.18000000000000002-style artifacts).
 */
export default function PctInput({ value, onChange, className }: Props) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        className={`${inp} w-24 text-right ${className ?? ''}`}
        value={pctToInput(value)}
        onChange={(e) => onChange(inputToPct(toNum(e.target.value)))}
      />
      <span className="text-xs text-slate-400">%</span>
    </span>
  )
}
