// Shared Tailwind class strings for the admin forms.
export const inp =
  'rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-perfios-blue focus:outline-none'
export const btn =
  'rounded-md bg-perfios-blue px-3 py-1.5 text-sm font-medium text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40'
export const btnGreen =
  'rounded-md bg-perfios-green px-3 py-1.5 text-sm font-medium text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40'
export const card = 'rounded-lg border border-slate-200 bg-white p-4'
export const th = 'px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-slate-400'

/** Parse an input value to a non-negative number, never NaN (empty -> 0). */
export function toNum(v: string): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
