import { describe, expect, it } from 'vitest'
import { validateDraft } from './validateDraft'
import { seedSnapshot } from '../engine/__fixtures__/seedSnapshot'
import type { DraftState } from './types'

const base = (): DraftState => ({
  fields: structuredClone(seedSnapshot.fields),
  modules: structuredClone(seedSnapshot.modules),
  module_fields: structuredClone(seedSnapshot.module_fields),
  cm_tiers: structuredClone(seedSnapshot.cm_tiers),
  settings: structuredClone(seedSnapshot.settings),
  informational_questions: [],
})

const codes = (d: DraftState) => validateDraft(d).map((e) => e.code)

describe('validateDraft', () => {
  it('passes for the seed draft', () => {
    expect(validateDraft(base())).toEqual([])
  })

  it('flags a composite module with zero fields', () => {
    const d = base()
    d.module_fields = d.module_fields.filter((t) => t.module_key !== 'DSPM')
    expect(validateDraft(d).some((e) => e.code === 'module_no_fields' && e.entityKey === 'DSPM')).toBe(true)
  })

  it('exempts tier modules (CM) from the zero-fields rule', () => {
    expect(validateDraft(base()).some((e) => e.code === 'module_no_fields' && e.entityKey === 'CM')).toBe(false)
  })

  it('flags a tag pointing to an inactive field', () => {
    const d = base()
    d.fields = d.fields.map((f) => (f.field_key === 'vm' ? { ...f, active: false } : f))
    expect(codes(d)).toContain('tag_inactive_field')
  })

  it('flags a negative percentage in settings', () => {
    const d = base()
    d.settings = { ...d.settings, amc_pct: -0.1 }
    expect(codes(d)).toContain('pct_negative')
  })

  it('flags a cm_tier missing a license fee', () => {
    const d = base()
    d.cm_tiers = d.cm_tiers.map((t) => (t.tier_key === 'mid' ? { ...t, license_fee_inr: NaN } : t))
    expect(codes(d)).toContain('cm_tier_no_license')
  })

  it('flags a multiplier module with no multiplier', () => {
    const d = base()
    d.modules = d.modules.map((m) => (m.module_key === 'ROPA_STANDALONE' ? { ...m, multiplier: null } : m))
    expect(codes(d)).toContain('multiplier_missing')
  })

  it('flags a non-integer unit price', () => {
    const d = base()
    d.fields = d.fields.map((f) => (f.field_key === 'vm' ? { ...f, unit_price_inr: 7000.5 } : f))
    expect(codes(d)).toContain('unit_price_invalid')
  })
})
