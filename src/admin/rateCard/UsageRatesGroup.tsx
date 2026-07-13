import type { RateCard, UsageRate } from '../../lib/engine2/types'
import { card, inp, th, toNum } from '../styles'
import type { UpdateCard } from './helpers'

interface Props {
  usageRates: RateCard['usage_rates']
  update: UpdateCard
}

/**
 * Usage-based items (Honda "Usage-based Items" pattern) — billed on actuals,
 * outside the TCO (e.g. OCR processing at ₹1/document). Values only: no
 * add/delete here, consistent with the rest of the rate-card page's
 * philosophy (numbers only, never structure).
 */
export default function UsageRatesGroup({ usageRates, update }: Props) {
  const patchRate = (index: number, patch: Partial<UsageRate>) =>
    update((c) => ({
      ...c,
      usage_rates: c.usage_rates.map((ur, i) => (i === index ? { ...ur, ...patch } : ur)),
    }))

  return (
    <section className={card}>
      <h2 className="text-sm font-semibold text-perfios-blue">Usage-based items</h2>
      <p className="mb-3 mt-1 text-xs text-slate-400">
        Billed on actuals, outside the TCO — the engine never totals these into a committed price; proposals list
        them as a rate card (e.g. OCR processing for scanned / physical consent capture).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>Label</th>
              <th className={th}>Unit</th>
              <th className={th}>Price (₹)</th>
            </tr>
          </thead>
          <tbody>
            {usageRates.map((ur, i) => (
              <tr key={ur.rate_key} className="border-t border-slate-100 align-top">
                <td className="px-2 py-1.5">
                  <input
                    className={`${inp} w-64`}
                    value={ur.label}
                    onChange={(e) => patchRate(i, { label: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    className={`${inp} w-32`}
                    value={ur.unit}
                    onChange={(e) => patchRate(i, { unit: e.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={`${inp} w-24 text-right`}
                    value={ur.unit_price_inr}
                    onChange={(e) => patchRate(i, { unit_price_inr: toNum(e.target.value) })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
