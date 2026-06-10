import { describe, expect, it } from 'vitest'
import { calculatePricing } from './engine'
import type { ConfigSnapshot } from './engine'
import { allOnes, seedSnapshot } from './engine/__fixtures__/seedSnapshot'
import { buildClientBreakdown } from './breakdown'

function withSettings(o: Partial<ConfigSnapshot['settings']>): ConfigSnapshot {
  return { ...seedSnapshot, settings: { ...seedSnapshot.settings, ...o } }
}

function sumY1(b: ReturnType<typeof buildClientBreakdown>) {
  return b.lines.reduce((s, l) => s + l.year1, 0)
}
function sumY2(b: ReturnType<typeof buildClientBreakdown>) {
  return b.lines.reduce((s, l) => s + l.year2, 0)
}

describe('buildClientBreakdown invariant: lines sum to engine totals', () => {
  const scenarios: Array<{ name: string; cfg: ConfigSnapshot; modules: string[]; tier?: string }> = [
    { name: 'DSPM only', cfg: seedSnapshot, modules: ['DSPM'] },
    { name: 'DSPM + Data Flow', cfg: seedSnapshot, modules: ['DSPM', 'DATA_FLOW'] },
    { name: 'DAM + Data Flow', cfg: seedSnapshot, modules: ['DAM', 'DATA_FLOW'] },
    { name: 'ROPA standalone', cfg: seedSnapshot, modules: ['ROPA_STANDALONE'] },
    { name: 'CM perpetual', cfg: withSettings({ cm_model: 'perpetual' }), modules: ['CM'], tier: 'mid' },
    { name: 'CM subscription', cfg: withSettings({ cm_model: 'subscription' }), modules: ['CM'], tier: 'mid' },
    { name: 'DSPM + CM perpetual', cfg: withSettings({ cm_model: 'perpetual' }), modules: ['DSPM', 'CM'], tier: 'mid' },
    { name: 'y2 includes deployment', cfg: withSettings({ y2_includes_deployment: true }), modules: ['DSPM'] },
  ]

  for (const s of scenarios) {
    it(s.name, () => {
      const r = calculatePricing(s.cfg, { moduleKeys: s.modules, quantities: allOnes, cmTier: s.tier ?? null })
      const b = buildClientBreakdown(r, s.cfg)
      expect(sumY1(b)).toBe(r.year1)
      expect(sumY2(b)).toBe(r.year2)
      expect(b.lines.every((l) => l.label.length > 0)).toBe(true)
    })
  }
})

describe('buildClientBreakdown line shapes', () => {
  it('DSPM + CM perpetual (Mid): expected client lines and totals', () => {
    const cfg = withSettings({ cm_model: 'perpetual' })
    const r = calculatePricing(cfg, { moduleKeys: ['DSPM', 'CM'], quantities: allOnes, cmTier: 'mid' })
    const b = buildClientBreakdown(r, cfg)
    const byLabel = Object.fromEntries(b.lines.map((l) => [l.label, l]))

    expect(byLabel['Data Privacy Platform & Modules'].year1).toBe(1713800)
    expect(byLabel['Data Privacy Platform & Modules'].year2).toBe(1713800)
    expect(byLabel['Data Privacy Platform & Modules'].includes).toContain('DSPM')
    expect(byLabel['Deployment'].year1).toBe(308484)
    expect(byLabel['Deployment'].year2).toBe(0)
    expect(byLabel['Maintenance (AMC)'].year1).toBe(205656)
    expect(byLabel['Consent Manager License'].year1).toBe(3000000)
    expect(byLabel['Consent Manager License'].year2).toBe(0)
    expect(byLabel['Consent Manager Maintenance (AMC)'].year2).toBe(900000)
    // Implementation fee is 0 -> line hidden.
    expect(byLabel['Consent Manager Implementation']).toBeUndefined()

    expect(b.year1Total).toBe(5227940)
    expect(b.year2Total).toBe(2819456)
  })

  it('CM subscription: License recurs in Year 2, no AMC line', () => {
    const cfg = withSettings({ cm_model: 'subscription' })
    const r = calculatePricing(cfg, { moduleKeys: ['CM'], quantities: allOnes, cmTier: 'mid' })
    const b = buildClientBreakdown(r, cfg)
    const license = b.lines.find((l) => l.label === 'Consent Manager License')!
    expect(license.frequency).toBe('recurring')
    expect(license.year1).toBe(0)
    expect(license.year2).toBe(3000000)
    expect(b.lines.some((l) => l.label === 'Consent Manager Maintenance (AMC)')).toBe(false)
  })

  it('ROPA: single one-time line, Year 2 zero', () => {
    const r = calculatePricing(seedSnapshot, { moduleKeys: ['ROPA_STANDALONE'], quantities: allOnes })
    const b = buildClientBreakdown(r, seedSnapshot)
    expect(b.lines).toHaveLength(1)
    expect(b.lines[0].label).toBe('ROPA Gap Analysis')
    expect(b.lines[0].frequency).toBe('one_time')
    expect(b.lines[0].year1).toBe(1195600)
    expect(b.lines[0].year2).toBe(0)
  })

  it('empty selection: no lines, zero totals', () => {
    const r = calculatePricing(seedSnapshot, { moduleKeys: [], quantities: allOnes })
    const b = buildClientBreakdown(r, seedSnapshot)
    expect(b.lines).toHaveLength(0)
    expect(b.year1Total).toBe(0)
    expect(b.year2Total).toBe(0)
  })
})
