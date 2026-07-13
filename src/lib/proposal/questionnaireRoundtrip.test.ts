// Proves the single-source-of-truth guarantee end to end: the template
// (questionnaireTemplate.ts) drives both the generated workbook
// (questionnaireExport.ts) and the importer's cell map
// (questionnaireImport.ts), so a file downloaded from this app always
// imports back into this app.
import { describe, expect, it } from 'vitest'
import { CLIENT_BLOCKLIST } from './clientSafe'
import { buildQuestionnaireWorkbook } from './questionnaireExport'
import { importQuestionnaireXlsx } from './questionnaireImport'
import {
  PRICING_SECTIONS,
  PRICING_SHEET_NAME,
  RESPONSE_COL,
  SCOPING_SECTIONS,
  SCOPING_SHEET_NAME,
} from './questionnaireTemplate'

describe('template <-> importer row mapping', () => {
  const pricingQuestions = PRICING_SECTIONS.flatMap((s) => s.questions)
  const rowFor = (key: string): number | undefined => pricingQuestions.find((q) => q.import_key === key)?.row

  it('maps each structured import_key to the row the importer expects', () => {
    expect(rowFor('deployment_mode')).toBe(9)
    expect(rowFor('dp_base_y1')).toBe(10)
    expect(rowFor('dp_growth')).toBe(11)
    expect(rowFor('database')).toBe(16)
    expect(rowFor('cloud_connector')).toBe(17)
    expect(rowFor('account')).toBe(18)
    expect(rowFor('vm')).toBe(19)
    expect(rowFor('gdrive_user')).toBe(20)
    expect(rowFor('endpoint_device')).toBe(21)
    expect(rowFor('dspm_dam')).toBe(25)
    expect(rowFor('endpoint')).toBe(26)
  })
})

describe('buildQuestionnaireWorkbook — question placement', () => {
  const wb = buildQuestionnaireWorkbook()
  const pricingWs = wb.getWorksheet(PRICING_SHEET_NAME)!
  const scopingWs = wb.getWorksheet(SCOPING_SHEET_NAME)!

  it('places each pricing question in column C of its declared row and leaves the response column empty', () => {
    for (const section of PRICING_SECTIONS) {
      for (const q of section.questions) {
        expect(pricingWs.getCell(`C${q.row}`).value).toBe(q.question)
        expect(pricingWs.getCell(`${RESPONSE_COL}${q.row}`).value ?? null).toBeNull()
      }
    }
  })

  it('places each scoping question in column C of its declared row and leaves the response column empty', () => {
    for (const section of SCOPING_SECTIONS) {
      for (const q of section.questions) {
        expect(scopingWs.getCell(`C${q.row}`).value).toBe(q.question)
        expect(scopingWs.getCell(`${RESPONSE_COL}${q.row}`).value ?? null).toBeNull()
      }
    }
  })

  it('generates both sheets, on the right names', () => {
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([PRICING_SHEET_NAME, SCOPING_SHEET_NAME])
  })
})

describe('full round-trip: build -> fill -> writeBuffer -> import', () => {
  it('recovers the exact structured inputs an AM would type into the downloaded file', async () => {
    const wb = buildQuestionnaireWorkbook('Acme Appliances Ltd')
    const ws = wb.getWorksheet(PRICING_SHEET_NAME)!

    // Row -> realistic answer, keyed by the template's own rows (not
    // hand-copied literals) so this test breaks loudly if the template ever
    // renumbers a question without updating the importer.
    const pricingQuestions = PRICING_SECTIONS.flatMap((s) => s.questions)
    const answerFor = (importKey: string, value: string): void => {
      const row = pricingQuestions.find((q) => q.import_key === importKey)!.row
      ws.getCell(`${RESPONSE_COL}${row}`).value = value
    }

    answerFor('deployment_mode', 'SaaS')
    answerFor('dp_base_y1', '25 lakh')
    answerFor('dp_growth', '10%')
    answerFor('database', '50 (Oracle, Postgres)')
    answerFor('cloud_connector', 'AWS, Azure')
    answerFor('account', '4')
    answerFor('vm', '50')
    answerFor('gdrive_user', '2000')
    answerFor('endpoint_device', '2000')
    answerFor('dspm_dam', 'DSPM yes DAM no')
    answerFor('endpoint', 'Yes')

    const buffer = await wb.xlsx.writeBuffer()
    const result = await importQuestionnaireXlsx(buffer as unknown as ArrayBuffer)

    expect(result.customer_name).toBe('Acme Appliances Ltd')
    expect(result.inputs.deployment_mode).toBe('saas')
    expect(result.inputs.dp_base_y1).toBe(2_500_000)
    expect(result.inputs.dp_base_y2).toBe(2_750_000)
    expect(result.inputs.estate_quantities).toEqual({
      database: 50,
      cloud_connector: 2,
      account: 4,
      vm: 50,
      gdrive_user: 2000,
      endpoint_device: 2000,
    })
    expect(result.inputs.modules).toEqual({ dspm: true, dam: false, endpoint: true })
    expect(result.warnings).toEqual([])
  })
})

describe('client-safety of the generated workbook', () => {
  it('contains no blocklisted partner term anywhere in either sheet', () => {
    const wb = buildQuestionnaireWorkbook('Acme Appliances Ltd')
    const strings: string[] = []
    wb.eachSheet((ws) => {
      ws.eachRow((row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          if (typeof cell.value === 'string') strings.push(cell.value)
        })
      })
    })
    const blob = strings.join('\n').toLowerCase()
    for (const term of CLIENT_BLOCKLIST) {
      expect(blob.includes(term)).toBe(false)
    }
  })

  it('B4 has no "Channel" fragment on either sheet — partner names are internal-only', () => {
    const wb = buildQuestionnaireWorkbook()
    const pricingWs = wb.getWorksheet(PRICING_SHEET_NAME)!
    const scopingWs = wb.getWorksheet(SCOPING_SHEET_NAME)!
    expect(String(pricingWs.getCell('B4').value ?? '')).not.toMatch(/channel/i)
    expect(String(scopingWs.getCell('B4').value ?? '')).not.toMatch(/channel/i)
  })
})
