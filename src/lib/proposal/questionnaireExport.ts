// Generates the "Perfios_DPDP_Questionnaire.xlsx" workbook an AM downloads
// and sends to a client. Both sheets (Pricing Questionnaire, Scoping
// Questions) are built entirely from questionnaireTemplate.ts — the same
// data the importer's cell map derives from — so the file we hand out can
// never drift from the file questionnaireImport.ts knows how to read back.
//
// Styling follows excelExport.ts's established conventions (ExcelJS, same
// banner-blue palette) plus the blue-input/yellow-highlight convention this
// codebase already uses to mark an editable cell (see admin editors):
// response cells get fill #FFF2CC with blue #0000FF text.
import * as ExcelJS from 'exceljs'
import { scanForBlocklist } from './clientSafe'
import {
  GUIDANCE_ROW,
  PREPARED_FOR_ROW,
  PRICING_SECTIONS,
  PRICING_SHEET,
  PRICING_SHEET_NAME,
  RESPONSE_COL,
  SCOPING_SECTIONS,
  SCOPING_SHEET,
  SCOPING_SHEET_NAME,
  TITLE_ROW,
  type QuestionSection,
  type SheetMeta,
} from './questionnaireTemplate'

const BANNER_BLUE = 'FF1C58A7'
const SUBHEADER_TINT = 'FFEAF1FB'
const SUBHEADER_TEXT = 'FF1C58A7'
const RESPONSE_FILL = 'FFFFF2CC'
const RESPONSE_FONT = 'FF0000FF'
const NOTE_GREY = 'FF5B6472'
const WHITE = 'FFFFFFFF'
const FONT_NAME = 'Calibri'

export const QUESTIONNAIRE_FILENAME = 'Perfios_DPDP_Questionnaire.xlsx'

/**
 * `<account>_Perfios_DPDP_Questionnaire.xlsx`, safe for a filesystem — the
 * download is account-named (owner 2026-07-13: the questionnaire must be
 * traceable to the account it was sent to). Falls back to the plain
 * QUESTIONNAIRE_FILENAME when no account name is given (e.g. programmatic
 * callers / tests that don't stamp one). Mirrors wizardLogic.proposalFilename's
 * sanitization, kept duplicated rather than shared since lib code must not
 * import from src/am.
 */
export function questionnaireFilename(customerName?: string): string {
  const trimmed = customerName?.trim()
  if (!trimmed) return QUESTIONNAIRE_FILENAME
  const cleaned = trimmed.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')
  return `${cleaned || 'Client'}_Perfios_DPDP_Questionnaire.xlsx`
}

function colLetterToIndex(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0) + 1
}

// Column layout derives from RESPONSE_COL ('D'): No sits two columns left of
// Response (B), Question one column left (C), Why one column right (E).
const RESPONSE_COL_INDEX = colLetterToIndex(RESPONSE_COL)
const NO_COL_INDEX = RESPONSE_COL_INDEX - 2
const QUESTION_COL_INDEX = RESPONSE_COL_INDEX - 1
const WHY_COL_INDEX = RESPONSE_COL_INDEX + 1

/** Fills the "____..." placeholder in a SheetMeta.prepared_for_template with
 * a real customer name when one is supplied; otherwise the blank template
 * line is left as-is for the AM to hand-fill. */
function preparedForLine(template: string, customerName?: string): string {
  const trimmed = customerName?.trim()
  if (!trimmed) return template
  return template.replace(/_+/, trimmed)
}

function band(ws: ExcelJS.Worksheet, row: number): ExcelJS.Cell {
  ws.mergeCells(row, NO_COL_INDEX, row, WHY_COL_INDEX)
  return ws.getCell(row, NO_COL_INDEX)
}

function writeSheet(wb: ExcelJS.Workbook, name: string, meta: SheetMeta, sections: QuestionSection[], customerName?: string): void {
  const ws = wb.addWorksheet(name)
  ws.columns = [
    {},
    { width: 6 }, // B — No, narrow
    { width: 62 }, // C — Question, wide
    { width: 30 }, // D — Response, medium
    { width: 74 }, // E — Why, widest
  ]

  const banner = band(ws, 2)
  banner.value = 'PERFIOS'
  banner.font = { name: FONT_NAME, bold: true, size: 14, color: { argb: WHITE } }
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANNER_BLUE } }
  banner.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(2).height = 26

  const title = band(ws, TITLE_ROW)
  title.value = meta.title
  title.font = { name: FONT_NAME, bold: true, size: 13, color: { argb: WHITE } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANNER_BLUE } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(TITLE_ROW).height = 22

  const prepared = band(ws, PREPARED_FOR_ROW)
  prepared.value = preparedForLine(meta.prepared_for_template, customerName)
  prepared.font = { name: FONT_NAME, bold: true, size: 11, color: { argb: SUBHEADER_TEXT } }
  prepared.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  const guidance = band(ws, GUIDANCE_ROW)
  guidance.value = meta.guidance
  guidance.font = { name: FONT_NAME, italic: true, size: 10, color: { argb: NOTE_GREY } }
  guidance.alignment = { wrapText: true, vertical: 'top', horizontal: 'left', indent: 1 }
  ws.getRow(GUIDANCE_ROW).height = 28

  for (const section of sections) {
    const header = band(ws, section.header_row)
    header.value = section.title
    header.font = { name: FONT_NAME, bold: true, size: 11, color: { argb: SUBHEADER_TEXT } }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBHEADER_TINT } }
    header.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

    const columnHeaderRow = section.header_row + 1
    meta.column_headers.forEach((label, i) => {
      const c = ws.getCell(columnHeaderRow, NO_COL_INDEX + i)
      c.value = label
      c.font = { name: FONT_NAME, bold: true, color: { argb: WHITE } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANNER_BLUE } }
      c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left' }
    })

    for (const q of section.questions) {
      const noCell = ws.getCell(q.row, NO_COL_INDEX)
      noCell.value = q.no
      noCell.font = { name: FONT_NAME }
      noCell.alignment = { horizontal: 'center', vertical: 'top' }

      const questionCell = ws.getCell(q.row, QUESTION_COL_INDEX)
      questionCell.value = q.question
      questionCell.font = { name: FONT_NAME }
      questionCell.alignment = { wrapText: true, vertical: 'top' }

      // Response cell: intentionally left blank, styled as the editable
      // blue-input/yellow-highlight convention.
      const responseCell = ws.getCell(q.row, RESPONSE_COL_INDEX)
      responseCell.font = { name: FONT_NAME, color: { argb: RESPONSE_FONT } }
      responseCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RESPONSE_FILL } }
      responseCell.alignment = { wrapText: true, vertical: 'top' }

      const whyCell = ws.getCell(q.row, WHY_COL_INDEX)
      whyCell.value = q.why
      whyCell.font = { name: FONT_NAME, size: 9, color: { argb: NOTE_GREY } }
      whyCell.alignment = { wrapText: true, vertical: 'top' }
    }
  }

  const note = band(ws, meta.note_row)
  note.value = meta.note
  note.font = { name: FONT_NAME, italic: true, size: 9, color: { argb: NOTE_GREY } }
  note.alignment = { wrapText: true, vertical: 'top', horizontal: 'left', indent: 1 }
}

/** Scans the template content (plain, JSON-serializable — safe to stringify,
 * unlike the ExcelJS workbook itself) for blocklisted partner terms before a
 * single cell is written. Guards against the template ever regressing to
 * include a partner name (e.g. a re-added "Channel:" fragment). */
function assertClientSafe(customerName?: string): void {
  const offenders = scanForBlocklist({
    PRICING_SHEET,
    SCOPING_SHEET,
    PRICING_SECTIONS,
    SCOPING_SECTIONS,
    customerName: customerName ?? '',
  })
  if (offenders.length > 0) {
    throw new Error(
      `Blocked partner terms found in questionnaire content, refusing to write: ${offenders.join(', ')}`,
    )
  }
}

/** Builds the two-sheet questionnaire workbook in memory (no DOM). Pure and
 * testable — separated from the browser download step below, same pattern
 * as excelExport.ts's buildWorkbook. */
export function buildQuestionnaireWorkbook(customerName?: string): ExcelJS.Workbook {
  assertClientSafe(customerName)

  const wb = new ExcelJS.Workbook()
  writeSheet(wb, PRICING_SHEET_NAME, PRICING_SHEET, PRICING_SECTIONS, customerName)
  writeSheet(wb, SCOPING_SHEET_NAME, SCOPING_SHEET, SCOPING_SECTIONS, customerName)
  return wb
}

/** Builds the workbook and triggers a browser download, named so the
 * importer's sheet-name lookup always finds it again unmodified. */
export async function downloadQuestionnaireXlsx(customerName?: string): Promise<void> {
  const wb = buildQuestionnaireWorkbook(customerName)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = questionnaireFilename(customerName)
  a.click()
  URL.revokeObjectURL(url)
}
