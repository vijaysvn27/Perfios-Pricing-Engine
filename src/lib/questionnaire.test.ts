import { describe, expect, it } from 'vitest'
import * as ExcelJS from 'exceljs'
import { buildQuestionnaireWorkbook, parseQuestionnaireBuffer, CM_TIER_CODE } from './questionnaire'
import type { PublicForm } from './publicApi'

const form: PublicForm = {
  instance_name: 'Test',
  modules: [
    { module_key: 'DSPM', label: 'DSPM', kind: 'composite', pricing_type: 'composite', applies_multiplier: false, active: true },
    { module_key: 'DATA_FLOW', label: 'Data Flow', kind: 'composite', pricing_type: 'composite', applies_multiplier: false, active: true },
    { module_key: 'CM', label: 'Consent Manager', kind: 'saas', pricing_type: 'tier', applies_multiplier: false, active: true },
  ],
  fields: [
    { field_key: 'db', label: 'Databases', sort_order: 10, active: true },
    { field_key: 'gdrive_user', label: 'GDrive users', sort_order: 60, active: true },
    { field_key: 'vm', label: 'Virtual machines', sort_order: 70, active: true },
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
  excel_hero: null,
  excel_terms: null,
}

function setAnswer(ws: ExcelJS.Worksheet, code: string, val: number | string) {
  ws.eachRow((row) => {
    if (String(row.getCell(1).value) === code) row.getCell(3).value = val
  })
}

describe('questionnaire round-trip', () => {
  it('restores module selection, quantities, CM tier, and customer name', async () => {
    const wb = buildQuestionnaireWorkbook(form, ['DSPM', 'CM'], { customerName: 'Acme Bank' })
    const ws = wb.getWorksheet('Questionnaire')!
    setAnswer(ws, 'db', 3)
    setAnswer(ws, 'gdrive_user', 25)
    setAnswer(ws, CM_TIER_CODE, 'Mid')

    const buf = await wb.xlsx.writeBuffer()
    const parsed = await parseQuestionnaireBuffer(buf as unknown as ArrayBuffer, form)

    expect(parsed.moduleKeys.slice().sort()).toEqual(['CM', 'DSPM'])
    expect(parsed.quantities).toEqual({ db: 3, gdrive_user: 25 })
    expect(parsed.cmTier).toBe('mid')
    expect(parsed.customerName).toBe('Acme Bank')
  })

  it('VM appears only when Data Flow/ROPA is selected (gating via tags)', async () => {
    // DSPM only -> no vm row -> filling vm is impossible; parse yields no vm.
    const wbDspm = buildQuestionnaireWorkbook(form, ['DSPM'], {})
    const wsD = wbDspm.getWorksheet('Questionnaire')!
    const codes: string[] = []
    wsD.eachRow((r) => { const c = String(r.getCell(1).value ?? ''); if (c && c !== 'Field Code') codes.push(c) })
    expect(codes).not.toContain('vm')

    // Data Flow -> vm row present
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
    ws.getRow(last).getCell(3).value = 99
    const buf = await wb.xlsx.writeBuffer()
    const parsed = await parseQuestionnaireBuffer(buf as unknown as ArrayBuffer, form)
    expect(parsed.quantities.bogus_field).toBeUndefined()
  })

  it('rejects a file that is not a Perfios questionnaire', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Sheet1').getCell('A1').value = 'hello'
    const buf = await wb.xlsx.writeBuffer()
    await expect(parseQuestionnaireBuffer(buf as unknown as ArrayBuffer, form)).rejects.toThrow(/not a Perfios questionnaire/)
  })
})
