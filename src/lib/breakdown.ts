// Client-safe breakdown: converts the engine's bucket-level breakdown into a
// table of cost-type lines. NEVER exposes fields or per-unit rates — it reads only
// bucket-level numbers (base / deployment / amc / license / impl), never the
// per-field `lines`. Pure and deterministic; no engine math is performed here.

import type { ConfigSnapshot, EngineResult } from './engine'

export type ClientFrequency = 'one_time' | 'recurring'

export interface ClientLine {
  label: string
  /** Module names included in a combined line (composite base only). */
  includes?: string[]
  frequency: ClientFrequency
  year1: number
  year2: number
}

export interface ClientBreakdown {
  lines: ClientLine[]
  year1Total: number
  year2Total: number
}

export function frequencyLabel(f: ClientFrequency): string {
  return f === 'one_time' ? 'One-time' : 'Recurring (per year)'
}

/**
 * Build the client-safe breakdown from the engine result + the live config.
 * Invariant: the visible lines' Year 1 values sum to result.year1 (same for
 * Year 2). Lines that are zero in BOTH years are omitted.
 */
export function buildClientBreakdown(
  result: EngineResult,
  config: ConfigSnapshot,
): ClientBreakdown {
  const moduleLabel = new Map(config.modules.map((m) => [m.module_key, m.label]))
  const { y2_includes_deployment, cm_model } = config.settings
  const lines: ClientLine[] = []

  for (const b of result.breakdown_for_admin_only.buckets) {
    if (b.kind === 'composite') {
      lines.push({
        label: 'Data Privacy Platform & Modules',
        includes: b.module_keys.map((k) => moduleLabel.get(k) ?? k),
        frequency: 'recurring',
        year1: b.base_full,
        year2: b.base_recurring,
      })
      lines.push({
        label: 'Deployment',
        frequency: 'one_time',
        year1: b.deployment,
        year2: y2_includes_deployment ? b.deployment : 0,
      })
      lines.push({
        label: 'Maintenance (AMC)',
        frequency: 'recurring',
        year1: b.amc,
        year2: b.amc,
      })
    } else if (b.kind === 'ropa') {
      lines.push({
        label: 'ROPA Gap Analysis',
        frequency: 'one_time',
        year1: b.year1,
        year2: 0,
      })
    } else if (b.kind === 'cm') {
      const license = b.base_full
      const amc = b.amc
      if (cm_model === 'perpetual') {
        lines.push({ label: 'Consent Manager License', frequency: 'one_time', year1: license, year2: 0 })
        lines.push({ label: 'Consent Manager Implementation', frequency: 'one_time', year1: b.year1 - license, year2: 0 })
        lines.push({ label: 'Consent Manager Maintenance (AMC)', frequency: 'recurring', year1: 0, year2: amc })
      } else {
        // subscription: implementation up front (Year 1), license recurs from Year 2.
        lines.push({ label: 'Consent Manager License', frequency: 'recurring', year1: 0, year2: license })
        lines.push({ label: 'Consent Manager Implementation', frequency: 'one_time', year1: b.year1, year2: 0 })
      }
    }
  }

  // Hide lines that are zero in both years (decision 1).
  const visible = lines.filter((l) => l.year1 !== 0 || l.year2 !== 0)

  return { lines: visible, year1Total: result.year1, year2Total: result.year2 }
}
