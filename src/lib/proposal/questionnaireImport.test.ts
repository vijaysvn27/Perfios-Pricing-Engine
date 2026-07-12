import { describe, expect, it } from 'vitest'
import type { ProposalInputs } from './proposalsRepo'
import {
  interpretQuestionnaire,
  mergeQuestionnaireInputs,
  parseDeploymentMode,
  parseDspmDam,
  parseIndianNumber,
  parseYesNo,
} from './questionnaireImport'

const DEFAULTS: ProposalInputs = {
  deployment_mode: 'onprem',
  dp_base_y1: 0,
  dp_base_y2: 0,
  modules: { dspm: false, dam: false, endpoint: false },
  estate_quantities: {},
  tco_years: 3,
  discount_pct: 0,
  compare_all_modes: false,
  payment_terms: 'terms',
  special_terms: '',
}

describe('parseIndianNumber', () => {
  it('parses "25 lakh"', () => {
    expect(parseIndianNumber('25 lakh')).toBe(2_500_000)
  })

  it('parses "2.5M"', () => {
    expect(parseIndianNumber('2.5M')).toBe(2_500_000)
  })

  it('parses Indian-grouped commas "1,00,000"', () => {
    expect(parseIndianNumber('1,00,000')).toBe(100_000)
  })

  it('parses "0.5 Cr"', () => {
    expect(parseIndianNumber('0.5 Cr')).toBe(5_000_000)
  })

  it('parses "2.5 lakh" with a decimal', () => {
    expect(parseIndianNumber('2.5 lakh')).toBe(250_000)
  })

  it('parses international-grouped commas "2,500,000"', () => {
    expect(parseIndianNumber('2,500,000')).toBe(2_500_000)
  })

  it('parses "50K"', () => {
    expect(parseIndianNumber('50K')).toBe(50_000)
  })

  it('parses a plain number with no unit', () => {
    expect(parseIndianNumber('2500')).toBe(2500)
  })

  it('returns null for garbage', () => {
    expect(parseIndianNumber('garbage')).toBeNull()
  })

  it('returns null for blank/undefined/null', () => {
    expect(parseIndianNumber('')).toBeNull()
    expect(parseIndianNumber(undefined)).toBeNull()
    expect(parseIndianNumber(null)).toBeNull()
  })
})

describe('parseDeploymentMode', () => {
  it('recognises On-Prem variants', () => {
    expect(parseDeploymentMode('On-Prem')).toBe('onprem')
    expect(parseDeploymentMode('OnPrem')).toBe('onprem')
    expect(parseDeploymentMode('On premise')).toBe('onprem')
  })

  it('recognises Hybrid', () => {
    expect(parseDeploymentMode('Hybrid')).toBe('hybrid')
  })

  it('recognises SaaS', () => {
    expect(parseDeploymentMode('SaaS')).toBe('saas')
  })

  it('prefers hybrid even when on-prem words are also present', () => {
    expect(parseDeploymentMode('On-Prem + SaaS hybrid deployment')).toBe('hybrid')
  })

  it('returns null for unrecognised text', () => {
    expect(parseDeploymentMode('not sure yet')).toBeNull()
  })
})

describe('parseYesNo', () => {
  it('parses common yes/no spellings', () => {
    expect(parseYesNo('Yes')).toBe(true)
    expect(parseYesNo('y')).toBe(true)
    expect(parseYesNo('No')).toBe(false)
    expect(parseYesNo('n')).toBe(false)
  })

  it('returns null for anything else', () => {
    expect(parseYesNo('maybe')).toBeNull()
    expect(parseYesNo('')).toBeNull()
  })
})

describe('parseDspmDam', () => {
  it('a bare "Yes" means both yes', () => {
    expect(parseDspmDam('Yes')).toEqual({ dspm: true, dam: true })
  })

  it('a bare "No" means both no', () => {
    expect(parseDspmDam('No')).toEqual({ dspm: false, dam: false })
  })

  it('handles "Yes/No" pairs', () => {
    expect(parseDspmDam('Yes/No')).toEqual({ dspm: true, dam: false })
  })

  it('handles "DSPM yes DAM no" combined answers', () => {
    expect(parseDspmDam('DSPM yes DAM no')).toEqual({ dspm: true, dam: false })
  })

  it('handles labelled answers with punctuation', () => {
    expect(parseDspmDam('DSPM: Yes, DAM: No')).toEqual({ dspm: true, dam: false })
  })

  it('returns nulls for unrecognised text', () => {
    expect(parseDspmDam('not sure')).toEqual({ dspm: null, dam: null })
  })
})

describe('interpretQuestionnaire — realistic filled map', () => {
  const filled: Record<string, string> = {
    B4: 'Prepared for: Acme Appliances Ltd Channel: Direct Date: 2026-07-01',
    D9: 'On-Prem',
    D10: '25 lakh',
    D11: '10%',
    D12: 'CRM, ERP, HRMS (3 systems)',
    D16: '5 databases (MySQL, Oracle)',
    D17: 'AWS, Azure',
    D18: '4',
    D19: '12',
    D20: '300',
    D21: '150',
    D25: 'Yes/Yes',
    D26: 'Yes',
    D27: 'None currently',
    D28: 'Salesforce, Workday',
    D29: 'Perfios direct',
  }

  const result = interpretQuestionnaire(filled)

  it('extracts the customer name from B4', () => {
    expect(result.customer_name).toBe('Acme Appliances Ltd')
  })

  it('maps deployment mode, dp base, and growth', () => {
    expect(result.inputs.deployment_mode).toBe('onprem')
    expect(result.inputs.dp_base_y1).toBe(2_500_000)
    expect(result.inputs.dp_base_y2).toBe(2_750_000) // +10%
  })

  it('maps modules from Q11/Q12', () => {
    expect(result.inputs.modules).toEqual({ dspm: true, dam: true, endpoint: true })
  })

  it('maps estate quantities from Q5-Q10', () => {
    expect(result.inputs.estate_quantities).toEqual({
      database: 5,
      cloud_connector: 2,
      account: 4,
      vm: 12,
      gdrive_user: 300,
      endpoint_device: 150,
    })
  })

  it('keeps Q4/Q13/Q14/Q15 as notes, not inputs', () => {
    expect(result.notes.some((n) => n.includes('CRM, ERP, HRMS'))).toBe(true)
    expect(result.notes.some((n) => n.includes('None currently'))).toBe(true)
    expect(result.notes.some((n) => n.includes('Salesforce, Workday'))).toBe(true)
    expect(result.notes.some((n) => n.includes('Perfios direct'))).toBe(true)
  })

  it('has no warnings when every answer parses cleanly', () => {
    expect(result.warnings).toEqual([])
  })
})

describe('interpretQuestionnaire — all-blank map', () => {
  const result = interpretQuestionnaire({})

  it('never throws and returns safe defaults', () => {
    expect(result.customer_name).toBeNull()
    expect(result.inputs.deployment_mode).toBeUndefined()
    expect(result.inputs.dp_base_y1).toBeUndefined()
    expect(result.inputs.dp_base_y2).toBeUndefined()
    expect(result.inputs.modules).toEqual({ dspm: false, dam: false, endpoint: false })
    expect(result.inputs.estate_quantities).toEqual({
      database: 0,
      cloud_connector: 0,
      account: 0,
      vm: 0,
      gdrive_user: 0,
      endpoint_device: 0,
    })
  })

  it('warns about every blank answer', () => {
    expect(result.warnings.some((w) => /deployment mode was blank/.test(w))).toBe(true)
    expect(result.warnings.some((w) => /Year-1 data principal base was blank/.test(w))).toBe(true)
    expect(result.warnings.some((w) => /DSPM\/DAM scope was blank/.test(w))).toBe(true)
    expect(result.warnings.some((w) => /Endpoint Discovery\/DLP scope was blank/.test(w))).toBe(true)
    expect(result.warnings.some((w) => /Blank in questionnaire — defaulted to 0/.test(w))).toBe(true)
  })

  it('produces no notes when nothing was even filled in', () => {
    expect(result.notes).toEqual([])
  })
})

describe('mergeQuestionnaireInputs', () => {
  it('keeps defaults for anything the questionnaire did not set', () => {
    const merged = mergeQuestionnaireInputs(DEFAULTS, {})
    expect(merged).toEqual(DEFAULTS)
  })

  it('overrides only the fields present in the parsed partial', () => {
    const merged = mergeQuestionnaireInputs(DEFAULTS, {
      deployment_mode: 'hybrid',
      dp_base_y1: 500_000,
      modules: { dspm: true, dam: false, endpoint: false },
    })
    expect(merged.deployment_mode).toBe('hybrid')
    expect(merged.dp_base_y1).toBe(500_000)
    expect(merged.dp_base_y2).toBe(0) // untouched, still the default
    expect(merged.modules).toEqual({ dspm: true, dam: false, endpoint: false })
    expect(merged.tco_years).toBe(3) // untouched wizard default
    expect(merged.payment_terms).toBe('terms') // untouched wizard default
  })
})

describe('interpretQuestionnaire — messy/unparseable answers degrade safely', () => {
  const messy: Record<string, string> = {
    D9: 'not sure',
    D10: 'a lot of customers',
    D17: 'several clouds',
    D25: 'kind of',
  }
  const result = interpretQuestionnaire(messy)

  it('never throws', () => {
    expect(result).toBeTruthy()
  })

  it('falls back to defaults and records warnings + notes for unparseable answers', () => {
    expect(result.inputs.deployment_mode).toBeUndefined()
    expect(result.inputs.dp_base_y1).toBeUndefined()
    expect(result.inputs.estate_quantities?.cloud_connector).toBe(0)
    expect(result.inputs.modules).toEqual({ dspm: false, dam: false, endpoint: false })
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.notes.some((n) => n.includes('not sure'))).toBe(true)
  })
})
