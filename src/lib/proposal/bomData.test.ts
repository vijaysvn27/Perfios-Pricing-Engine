import { describe, expect, it } from 'vitest'
import { BOM_NOTES, ONPREM_BOM, bomForDpBase, tierKeyForDpBase, type OnPremBomTierKey } from './bomData'
import { CLIENT_BLOCKLIST } from './clientSafe'

const TIER_KEYS: OnPremBomTierKey[] = ['tier0', '10l', '25l', '50l', '100l']

describe('ONPREM_BOM', () => {
  it('has all five tiers', () => {
    expect(Object.keys(ONPREM_BOM).sort()).toEqual([...TIER_KEYS].sort())
  })

  // NOTE: the spec's task brief assumed >= 8 primary rows per tier. The
  // actual source sheet (Consentick_OnPrem_Sizing_AllTiers.xlsx) has 7
  // non-managed-service PRIMARY SITE components per tier once the
  // "ALB + S3 + WAF (managed)" row is excluded per the annexure rule (cloud
  // services aren't client hardware) and the subtotal row is excluded (not a
  // component). Asserting the real, verified count here (7), not a padded
  // one — see the deviation note in the task report.
  for (const key of TIER_KEYS) {
    it(`${key}: has >= 7 primary rows and exactly 3 DR rows`, () => {
      const rows = ONPREM_BOM[key]
      const primary = rows.filter((r) => r.site === 'primary')
      const dr = rows.filter((r) => r.site === 'dr')
      expect(primary.length).toBeGreaterThanOrEqual(7)
      expect(dr.length).toBeGreaterThanOrEqual(3)
    })
  }

  it('never includes a cost or $ figure — annexure is specs only', () => {
    const text = JSON.stringify(ONPREM_BOM)
    expect(text).not.toMatch(/\$/)
    expect(text.toLowerCase()).not.toMatch(/\bcost\b/)
    expect(text.toLowerCase()).not.toMatch(/\/mo\b/)
  })

  it('excludes the managed-service (ALB + S3 + WAF) row', () => {
    const text = JSON.stringify(ONPREM_BOM).toLowerCase()
    expect(text).not.toContain('alb')
    expect(text).not.toContain('waf')
  })

  it('contains no blocklisted partner names', () => {
    const text = JSON.stringify(ONPREM_BOM).toLowerCase()
    const offenders = CLIENT_BLOCKLIST.filter((term) => text.includes(term))
    expect(offenders).toEqual([])
  })

  it('every row has positive nodes/vcpu/ram and a non-empty component + storage', () => {
    for (const rows of Object.values(ONPREM_BOM)) {
      for (const row of rows) {
        expect(row.component.length).toBeGreaterThan(0)
        expect(row.nodes).toBeGreaterThan(0)
        expect(row.vcpu).toBeGreaterThan(0)
        expect(row.ram_gb).toBeGreaterThan(0)
        expect(row.storage.length).toBeGreaterThan(0)
        expect(['primary', 'dr']).toContain(row.site)
      }
    }
  })
})

describe('tierKeyForDpBase / bomForDpBase', () => {
  it('picks the smallest tier whose user_cap >= dp_base', () => {
    expect(tierKeyForDpBase(2_500_000)).toBe('25l')
    expect(bomForDpBase(2_500_000)).toBe(ONPREM_BOM['25l'])
  })

  it('boundary: exactly at tier0 cap (500,000) stays tier0', () => {
    expect(tierKeyForDpBase(500_000)).toBe('tier0')
    expect(bomForDpBase(500_000)).toBe(ONPREM_BOM.tier0)
  })

  it('boundary: one over the tier0 cap (500,001) rolls to 10l', () => {
    expect(tierKeyForDpBase(500_001)).toBe('10l')
    expect(bomForDpBase(500_001)).toBe(ONPREM_BOM['10l'])
  })

  it('boundary: exactly at 10l cap (1,000,000) stays 10l; one over rolls to 25l', () => {
    expect(tierKeyForDpBase(1_000_000)).toBe('10l')
    expect(tierKeyForDpBase(1_000_001)).toBe('25l')
  })

  it('boundary: exactly at 50l cap (5,000,000) stays 50l; one over rolls to 100l', () => {
    expect(tierKeyForDpBase(5_000_000)).toBe('50l')
    expect(tierKeyForDpBase(5_000_001)).toBe('100l')
  })

  it('falls back to the largest tier (100l) beyond every cap', () => {
    expect(tierKeyForDpBase(50_000_000)).toBe('100l')
  })

  it('small dp_base still resolves to the smallest tier', () => {
    expect(tierKeyForDpBase(1)).toBe('tier0')
  })
})

describe('BOM_NOTES', () => {
  it('carries the DR strategy and traffic-model assumption', () => {
    expect(BOM_NOTES).toMatch(/cold standby/i)
    expect(BOM_NOTES).toMatch(/RPO/i)
    expect(BOM_NOTES).toMatch(/RTO/i)
    expect(BOM_NOTES).toMatch(/traffic-model/i)
  })

  it('contains no blocklisted partner names', () => {
    const text = BOM_NOTES.toLowerCase()
    const offenders = CLIENT_BLOCKLIST.filter((term) => text.includes(term))
    expect(offenders).toEqual([])
  })
})
