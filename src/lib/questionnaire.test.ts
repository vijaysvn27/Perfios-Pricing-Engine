import { describe, expect, it } from 'vitest'
import * as ExcelJS from 'exceljs'
import { buildQuestionnaireWorkbook, parseQuestionnaireBuffer, orderedSections, CM_TIER_CODE } from './questionnaire'
import type { PublicForm } from './publicApi'

const form: PublicForm = {
  instance_name: 'Test',
  modules: [
    { module_key: 'DSPM', label: 'DSPM', kind: 'composite', pricing_type: 'composite', applies_multiplier: false, active: true },
    { module_key: 'DATA_FLOW', label: 'Data Flow', kind: 'composite', pricing_type: 'composite', applies_multiplier: false, active: true },
    { module_key: 'CM', label: 'Consent Manager', kind: 'saas', pricing_type: 'tier', applies_multiplier: false, active: true },
  ],
  fields: [
    { field_key: 'db', label: 'Databases', sort_order: 10, active: true, section: 'Data sources', section_sort: 1, item_sort: 1 },
    { field_key: 'gdrive_user', label: 'GDrive users', sort_order: 60, active: true, section: 'Data sources', section_sort: 1, item_sort: 2 },
    { field_key: 'vm', label: 'Virtual machines', sort_order: 70, active: true, section: 'Infrastructure', section_sort: 2, item_sort: 1 },
  ],
  module_fields: [
    { module_key: 'DSPM', field_key: 'db' },
    { module_key: 'DSPM', field_key: 'gdrive_user' },
    { module_key: 'DATA_FLOW', field_key: 'db' },
    { module_key: 'DATA_FLOW', field_key: 'vm' },
  ],
  cm_tiers: [
    { tier_key: 'mid', label: 'Mid' },
    { tier_key: 'large', label: 'Large' },
  ],
  informational_questions: [
    { question_key: 'employees', question_text: 'How many employees?', example: '500', why_text: 'Sizing', answer_type: 'number', options: null, section: 'About you', section_sort: 0, item_sort: 1, active: true },
    { question_key: 'has_dpo', question_text: 'Do you have a DPO?', example: null, why_text: null, answer_type: 'yes_no', options: null, section: 'About you', section_sort: 0, item_sort: 2, active: true },
    { question_key: 'inactive_q', question_text: 'Hidden', example: null, why_text: null, answer_type: 'text', options: null, section: 'About you', section_sort: 0, item_sort: 3, active: false },
  ],
  excel_hero: null,
  excel_terms: null,
}

const ANSWER_COL = 4

function setAnswer(ws: ExcelJS.Worksheet, code: string, val: number | string) {
  ws.eachRow((row) => {
    if (String(row.getCell(1).value) === code) row.getCell(ANSWER_COL).value = val
  })
}

function codes(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = []
  ws.eachRow((r) => {
    const c = String(r.getCell(1).value ?? '')
    if (c && c !== 'Field Code') out.push(c)
  })
  return out
}

describe('questionnaire round-trip', () => {
  it('restores module selection, priced quantities, and customer name', async () => {
    const wb = buildQuestionnaireWorkbook(form, ['DSPM', 'CM'], { customerName: 'Acme Bank' })
    const ws = wb.getWorksheet('Questionnaire')!
    setAnswer(ws, 'db', 3)
    setAnswer(ws, 'gdrive_user', 25)

    const buf = await wb.xlsx.writeBuffer()
    const parsed = await parseQuestionnaireBuffer(buf as unknown as ArrayBuffer, form)

    expect(parsed.moduleKeys.slice().sort()).toEqual(['CM', 'DSPM'])
    expect(parsed.quantities).toEqual({ db: 3, gdrive_user: 25 })
    expect(parsed.customerName).toBe('Acme Bank')
  })

  it('CM tier is NOT written to the questionnaire (partner-only choice)', async () => {
    const wb = buildQuestionnaireWorkbook(form, ['DSPM', 'CM'], { customerName: 'Acme Bank' })
    const ws = wb.getWorksheet('Questionnaire')!
    expect(codes(ws)).not.toContain(CM_TIER_CODE)
    // No "Consent Manager" section header either.
    let sawCm = false
    ws.eachRow((r) => {
      if (!String(r.getCell(1).value ?? '') && /Consent Manager/.test(String(r.getCell(3).value ?? ''))) sawCm = true
    })
    expect(sawCm).toBe(false)
  })

  it('parser ignores a legacy __cm_tier__ row from an older file', async () => {
    const wb = buildQuestionnaireWorkbook(form, ['DSPM'], {})
    const ws = wb.getWorksheet('Questionnaire')!
    setAnswer(ws, 'db', 4)
    const last = ws.rowCount + 1
    ws.getRow(last).getCell(1).value = CM_TIER_CODE
    ws.getRow(last).getCell(ANSWER_COL).value = 'Large'
    const buf = await wb.xlsx.writeBuffer()
    const parsed = await parseQuestionnaireBuffer(buf as unknown as ArrayBuffer, form)
    expect(parsed.quantities).toEqual({ db: 4 })
    expect((parsed as Record<string, unknown>).cmTier).toBeUndefined()
  })

  it('captures informational answers separately and NEVER in quantities', async () => {
    const wb = buildQuestionnaireWorkbook(form, ['DSPM'], {})
    const ws = wb.getWorksheet('Questionnaire')!
    setAnswer(ws, 'db', 5)
    setAnswer(ws, 'info:employees', 500)
    setAnswer(ws, 'info:has_dpo', 'Yes')

    const buf = await wb.xlsx.writeBuffer()
    const parsed = await parseQuestionnaireBuffer(buf as unknown as ArrayBuffer, form)

    expect(parsed.quantities).toEqual({ db: 5 })
    expect(parsed.quantities.employees).toBeUndefined()
    expect(parsed.quantities.has_dpo).toBeUndefined()
    expect(parsed.informationalAnswers).toEqual({ employees: 500, has_dpo: true })
  })

  it('omits inactive informational questions from the sheet', async () => {
    const wb = buildQuestionnaireWorkbook(form, ['DSPM'], {})
    const ws = wb.getWorksheet('Questionnaire')!
    expect(codes(ws)).not.toContain('info:inactive_q')
    expect(codes(ws)).toContain('info:employees')
  })

  it('ignores section-header rows (no code) on parse', async () => {
    const wb = buildQuestionnaireWorkbook(form, ['DSPM'], {})
    const ws = wb.getWorksheet('Questionnaire')!
    // A section header occupies the Question column but carries no code.
    let sawSectionHeader = false
    ws.eachRow((r) => {
      const code = String(r.getCell(1).value ?? '')
      const q = String(r.getCell(3).value ?? '')
      if (!code && /Data sources|About you/.test(q)) sawSectionHeader = true
    })
    expect(sawSectionHeader).toBe(true)

    setAnswer(ws, 'db', 7)
    const buf = await wb.xlsx.writeBuffer()
    const parsed = await parseQuestionnaireBuffer(buf as unknown as ArrayBuffer, form)
    expect(parsed.quantities).toEqual({ db: 7 })
  })

  it('VM appears only when Data Flow/ROPA is selected (gating via tags)', async () => {
    const wbDspm = buildQuestionnaireWorkbook(form, ['DSPM'], {})
    expect(codes(wbDspm.getWorksheet('Questionnaire')!)).not.toContain('vm')

    const wbDf = buildQuestionnaireWorkbook(form, ['DATA_FLOW'], {})
    const wsF = wbDf.getWorksheet('Questionnaire')!
    setAnswer(wsF, 'vm', 4)
    const buf = await wbDf.xlsx.writeBuffer()
    const parsed = await parseQuestionnaireBuffer(buf as unknown as ArrayBuffer, form)
    expect(parsed.quantities.vm).toBe(4)
  })

  it('ignores unknown/extra rows', async () => {
    const wb = buildQuestionnaireWorkbook(form, ['DSPM'], {})
    const ws = wb.getWorksheet('Questionnaire')!
    const last = ws.rowCount + 1
    ws.getRow(last).getCell(1).value = 'bogus_field'
    ws.getRow(last).getCell(ANSWER_COL).value = 99
    const buf = await wb.xlsx.writeBuffer()
    const parsed = await parseQuestionnaireBuffer(buf as unknown as ArrayBuffer, form)
    expect(parsed.quantities.bogus_field).toBeUndefined()
  })

  it('orderedSections: shared on-screen/Excel grouping (section_sort then item_sort); no CM tier item', () => {
    const secs = orderedSections(form, ['DSPM', 'CM'])
    // Only field + informational sections — the CM tier is never an item here.
    expect(secs.map((s) => s.title)).toEqual(['About you', 'Data sources'])
    expect(secs[0].items.map((i) => i.code)).toEqual(['info:employees', 'info:has_dpo'])
    expect(secs[0].items.map((i) => i.kind)).toEqual(['info', 'info'])
    expect(secs[1].items.map((i) => i.code)).toEqual(['db', 'gdrive_user'])
    expect(secs[1].items.map((i) => i.kind)).toEqual(['field', 'field'])
    expect(secs.flatMap((s) => s.items.map((i) => i.kind))).not.toContain('cm')
    expect(secs.find((s) => s.title === 'Consent Manager')).toBeUndefined()

    // Inactive informational questions are excluded.
    const noCm = orderedSections(form, ['DSPM'])
    expect(noCm.find((s) => s.title === 'About you')).toBeDefined()
    expect(noCm.flatMap((s) => s.items.map((i) => i.code))).not.toContain('info:inactive_q')
  })

  it('rejects a file that is not a Perfios questionnaire', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Sheet1').getCell('A1').value = 'hello'
    const buf = await wb.xlsx.writeBuffer()
    await expect(parseQuestionnaireBuffer(buf as unknown as ArrayBuffer, form)).rejects.toThrow(/not a Perfios questionnaire/)
  })

  it('round-trips pre-filled values (quantities, informational, customer)', async () => {
    const wb = buildQuestionnaireWorkbook(form, ['DSPM', 'CM'], {
      customerName: 'Prefill Co',
      quantities: { db: 12 },
      informationalAnswers: { employees: 42, has_dpo: false },
    })
    const buf = await wb.xlsx.writeBuffer()
    const parsed = await parseQuestionnaireBuffer(buf as unknown as ArrayBuffer, form)
    expect(parsed.quantities).toEqual({ db: 12 })
    expect(parsed.customerName).toBe('Prefill Co')
    expect(parsed.informationalAnswers).toEqual({ employees: 42, has_dpo: false })
  })
})
