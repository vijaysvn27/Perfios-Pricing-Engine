// Client-ready Excel export for a proposal render model (§9 of the revamp
// design). Reuses the same library (ExcelJS) and styling conventions as the
// existing src/lib/excel.ts export: blue header bands, INR Indian-digit
// grouping, thin borders, alternating row shading.
//
// CRITICAL (D5): scanForBlocklist runs on the render model AND on any BOM
// annexure rows before a single cell is written. buildWorkbook throws if
// anything blocklisted (partner names) is present — no client file may ever
// contain a partner name. buildWorkbook is deliberately separate from the
// browser download step so the guard is unit-testable without touching the
// DOM (no document/Blob/URL calls happen until exportProposalXlsx).
import * as ExcelJS from 'exceljs'
import { scanForBlocklist } from './clientSafe'
import { BOM_NOTES } from './bomData'
import type { BomRow } from './bomData'
import type { ProposalCover, ProposalRenderModel, RenderSection, RenderTable } from './formats/types'

// Palette (Honda DPDP Pricing SaaS pattern) — see
// docs/superpowers/specs/2026-07-12-proposal-builder-revamp-design.md §7,
// "Document design language". Hardcoded, never invented.
const PRIMARY = 'FF003D82' // headings / wordmark text
const BANNER_BLUE = 'FF1C58A7' // section banner fills (Excel banner blue)
const SUBHEADER_TINT = 'FFEAF1FB' // subheader / note rows, text in BANNER_BLUE
const GREEN_CALLOUT = 'FFE2EFDA' // light green callout fill
const TOTAL_GREEN = 'FF37BC8B' // TOTAL row fill, white bold text
const ZEBRA = 'FFF4F7FB' // alternating data rows
const BORDER = 'FFD7DEE8' // hairline (inner) borders
const OUTER_HAIRLINE = 'FFC9D4E2' // hairline (outer) borders
const META_GREY = 'FF5B6472' // muted meta / footer text
const INR = '"₹" #,##,##0'

export type { BomRow }

export interface ExcelExportOptions {
  bom?: BomRow[]
  filename: string
  /** PNG bytes for the Perfios logo (item 3). Fetched by the caller
   * (Step4Present) from the bundled asset — lib code stays asset-free. When
   * absent, the cover falls back to a styled "PERFIOS" wordmark. */
  logo?: ArrayBuffer
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BORDER } }
  return { top: side, bottom: side, left: side, right: side }
}

function assertClientSafe(model: ProposalRenderModel, bom?: BomRow[]): void {
  const offenders = new Set<string>([...scanForBlocklist(model), ...(bom ? scanForBlocklist(bom) : [])])
  if (offenders.size > 0) {
    throw new Error(
      `Blocked partner terms found in client-facing export, refusing to write: ${Array.from(offenders).join(', ')}`,
    )
  }
}

/** A row is a TOTAL row (Honda pattern: solid green fill, white bold text)
 * when its label cell reads "total", "TCO", or "subtotal" — same predicate
 * RenderModelView.isTotalRow uses on screen, so the workbook and the preview
 * never disagree on which rows are totals. */
function isTotalRow(firstCell: string | number): boolean {
  return /total|tco/i.test(String(firstCell))
}

/** Column letter for a 1-based column index (e.g. 2 -> 'B'). */
function colLetter(ws: ExcelJS.Worksheet, col1: number): string {
  return ws.getColumn(col1).letter
}

/**
 * Tables where formula auto-generation is safe: every numeric column shares
 * the same "line item -> TOTAL" shape (Year 1..Year N columns rolling up
 * into a TOTAL row, or a single Annual column rolling up into a Subtotal
 * row). The compare-mode "Your Options" table mixes row semantics in the
 * same columns (a "CM Year 1" row and a "CM Annual" row share the same
 * On-Prem/Hybrid/SaaS columns) — a generic block-sum there could silently
 * misstate a total, so it deliberately keeps plain numbers.
 */
function isCommercialSummaryTable(title: string): boolean {
  return /^commercial summary/i.test(title)
}
function isEstateConsideredTable(title: string): boolean {
  return title === 'Estate Considered'
}

/** Writes a single paragraph cell, applying the Honda "INCLUDED CONSENTS"
 * callout treatment (light green fill, bold banner-blue text) whenever the
 * paragraph starts with "Included:" — the included-DP note (shared.ts
 * includedDpNote), detected by prefix so no caller has to pass a flag. */
function writeParagraph(ws: ExcelJS.Worksheet, row: number, colCount: number, text: string): void {
  const c = ws.getCell(row, 1)
  ws.mergeCells(row, 1, row, colCount)
  c.value = text
  if (text.startsWith('Included:')) {
    c.font = { size: 10, bold: true, color: { argb: BANNER_BLUE } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_CALLOUT } }
  } else {
    c.font = { size: 10, color: { argb: 'FF222222' } }
  }
  c.alignment = { wrapText: true, vertical: 'top' }
}

/**
 * Writes a data/table body, turning TOTAL/Subtotal/TCO cells into real
 * ExcelJS formulas — `{ formula, result }` — instead of plain numbers, so an
 * AM editing a line-item figure sees the total recalculate (owner: totals
 * must be live formulas, not frozen numbers). The cached `result` keeps the
 * number visible to any viewer that doesn't recalc.
 *
 * Two shapes are recognised (see isCommercialSummaryTable /
 * isEstateConsideredTable):
 *  - Commercial-summary-shaped tables (`Component | Year 1..N | N-Year TCO`):
 *    every row's TCO cell = a row-wise SUM of its own Year columns; a TOTAL
 *    row's Year cells = a column-wise SUM of the contiguous block of rows
 *    above it. `blockStart` tracks that block: it resets to the current row
 *    whenever a TOTAL row is written, so a List/Discount/Net trio correctly
 *    sums List+Discount into Net (not the line items twice).
 *  - Estate Considered (`Driver | Count | Unit Rate | Annual`): only the
 *    Subtotal row's Annual cell gets a column-wise SUM of the Annual values
 *    above it.
 * Every other table keeps plain numbers, the safe default.
 *
 * Blank-not-zero (owner: "Fields not included in the pricing should be left
 * empty"): a literal numeric 0 — however it got here — renders as an empty
 * cell, never "₹0" or a stray SUM of nothing.
 */
function writeTable(ws: ExcelJS.Worksheet, table: RenderTable, startRow: number): number {
  let r = startRow
  table.columns.forEach((text, i) => {
    const c = ws.getRow(r).getCell(i + 1)
    c.value = text
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANNER_BLUE } }
    c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle' }
    c.border = thinBorder()
  })
  r += 1

  const commercial = isCommercialSummaryTable(table.title)
  const estate = isEstateConsideredTable(table.title)
  const lastCol = table.columns.length
  let blockStart = r // first row of the contiguous block the next TOTAL row sums

  table.rows.forEach((row, idx) => {
    const total = isTotalRow(row[0])
    row.forEach((val, i) => {
      const c = ws.getRow(r).getCell(i + 1)
      const display: string | number = typeof val === 'number' && val === 0 ? '' : val
      const isNumber = typeof display === 'number'
      let cellValue: ExcelJS.CellValue = display

      if (isNumber && commercial) {
        if (i === lastCol - 1) {
          // TCO column: row-wise sum of this row's own Year cells.
          const from = colLetter(ws, 2)
          const to = colLetter(ws, lastCol - 1)
          cellValue = { formula: `SUM(${from}${r}:${to}${r})`, result: display }
        } else if (total && i > 0) {
          // A Year column on a TOTAL/List/Net row: column-wise sum of the
          // block immediately above.
          const col = colLetter(ws, i + 1)
          cellValue = { formula: `SUM(${col}${blockStart}:${col}${r - 1})`, result: display }
        }
      } else if (isNumber && estate && total && i === lastCol - 1) {
        const col = colLetter(ws, i + 1)
        cellValue = { formula: `SUM(${col}${blockStart}:${col}${r - 1})`, result: display }
      }

      c.value = cellValue
      c.border = thinBorder()
      if (isNumber) {
        c.numFmt = INR
        c.alignment = { horizontal: 'right' }
      } else if (i === 0) {
        c.alignment = { wrapText: true, vertical: 'top' }
      }
      if (total) {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_GREEN } }
      } else if (idx % 2 === 1) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
      }
    })
    if (total) blockStart = r // this total's own row joins the next block (List/Discount/Net)
    r += 1
  })
  return r
}

/**
 * Branded cover band (item 3): logo (or a styled "PERFIOS" wordmark when no
 * logo bytes are supplied) above a blue title band, "Prepared for <customer>",
 * and a date / validity / reference line. Returns the next free row.
 */
function writeCover(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  cover: ProposalCover,
  colCount: number,
  logo?: ArrayBuffer,
): number {
  const band = (row: number): ExcelJS.Cell => {
    ws.mergeCells(row, 1, row, colCount)
    return ws.getCell(row, 1)
  }

  let r = 1
  const brandRow = band(r)
  if (logo) {
    const imageId = wb.addImage({ buffer: logo, extension: 'png' })
    // Owner fix ("Perfios logo in excel proposal is not correct"): the
    // source asset is 900x619 (aspect ≈1.454); anchor it top-left at a fixed
    // ~140x96 px size (140/96 ≈1.458, matching that aspect) instead of the
    // previous 118x81 box stretched across the banner row. A small inset
    // keeps it off the cell edge; the row is tall enough to hold it without
    // cropping.
    ws.addImage(imageId, { tl: { col: 0.12, row: r - 1 + 0.1 }, ext: { width: 140, height: 96 } })
    brandRow.value = ''
    ws.getRow(r).height = 76
  } else {
    brandRow.value = 'PERFIOS'
    brandRow.font = { bold: true, size: 20, color: { argb: PRIMARY } }
    brandRow.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    ws.getRow(r).height = 34
  }
  // Thin accent rule under the wordmark (COVER spec item 2).
  brandRow.border = { bottom: { style: 'medium', color: { argb: 'FF6FCF97' } } }
  r += 1

  const title = band(r)
  title.value = cover.title
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANNER_BLUE } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(r).height = 30
  r += 1

  const prepared = band(r)
  prepared.value = `Prepared for: ${cover.customer || '______________________'}`
  prepared.font = { bold: true, size: 11, color: { argb: PRIMARY } }
  prepared.alignment = { indent: 1 }
  r += 1

  const meta = band(r)
  meta.value = `Date: ${cover.date_label}   |   Valid ${cover.validity_days} days   |   Ref: ${cover.reference}`
  meta.font = { size: 10, color: { argb: META_GREY } }
  meta.alignment = { indent: 1 }
  meta.border = { bottom: { style: 'thin', color: { argb: OUTER_HAIRLINE } } }
  r += 2

  return r
}

/** Plain fallback header (no cover data) — the original title/subtitle band. */
function writePlainHeader(ws: ExcelJS.Worksheet, model: ProposalRenderModel, colCount: number): number {
  const band = (row: number): ExcelJS.Cell => {
    ws.mergeCells(row, 1, row, colCount)
    return ws.getCell(row, 1)
  }

  let r = 1
  const title = band(r)
  title.value = model.title
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANNER_BLUE } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(r).height = 30
  r += 1

  const subtitle = band(r)
  subtitle.value = model.subtitle
  subtitle.font = { italic: true, size: 10, color: { argb: META_GREY } }
  subtitle.alignment = { indent: 1 }
  r += 2
  return r
}

/** Footer band: "Perfios Software Solutions | Private & Confidential — prepared for <customer>", with a
 * hairline rule above it (PRINT header/footer treatment, adapted for a sheet). */
function writeFooter(ws: ExcelJS.Worksheet, row: number, colCount: number, customerName: string): number {
  const band = (r: number): ExcelJS.Cell => {
    ws.mergeCells(r, 1, r, colCount)
    return ws.getCell(r, 1)
  }
  const f = band(row)
  f.value = `Perfios Software Solutions | Private & Confidential — prepared for ${customerName || 'the client'}`
  f.font = { size: 9, italic: true, color: { argb: META_GREY } }
  f.border = { top: { style: 'thin', color: { argb: OUTER_HAIRLINE } } }
  return row + 1
}

function writeSections(ws: ExcelJS.Worksheet, model: ProposalRenderModel, colCount: number, startRow: number): number {
  const band = (row: number): ExcelJS.Cell => {
    ws.mergeCells(row, 1, row, colCount)
    return ws.getCell(row, 1)
  }

  let r = startRow

  for (const section of model.sections) {
    // H1 treatment: primary blue, bold, with the 0.7pt #6FCF97 accent rule
    // underneath (document design language — see index.css's --color-doc-*).
    const heading = band(r)
    heading.value = section.heading
    heading.font = { bold: true, size: 12, color: { argb: PRIMARY } }
    heading.border = { bottom: { style: 'thin', color: { argb: 'FF6FCF97' } } }
    r += 1

    for (const para of section.paragraphs ?? []) {
      writeParagraph(ws, r, colCount, para)
      r += 1
    }

    for (const bullet of section.bullets ?? []) {
      const c = band(r)
      c.value = `•  ${bullet}`
      c.font = { size: 10, color: { argb: 'FF222222' } }
      c.alignment = { wrapText: true, vertical: 'top' }
      r += 1
    }

    if (section.table) {
      r += 1
      r = writeTable(ws, section.table, r)
    }

    r += 1 // blank row between sections
  }
  return r
}

function writeBomAnnexure(ws: ExcelJS.Worksheet, rows: BomRow[], customerName: string): void {
  const columnCount = 6
  const table: RenderTable = {
    title: 'Infrastructure You Provide',
    columns: ['Component', 'Site', 'Nodes', 'vCPU', 'RAM (GB)', 'Storage'],
    rows: rows.map((b) => [
      b.component,
      b.site === 'primary' ? 'Primary' : 'Cold DR',
      b.nodes,
      b.vcpu,
      b.ram_gb,
      b.storage,
    ]),
  }
  const band = (row: number): ExcelJS.Cell => {
    ws.mergeCells(row, 1, row, columnCount)
    return ws.getCell(row, 1)
  }
  let r = 1
  const title = band(r)
  title.value = 'Infrastructure You Provide'
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANNER_BLUE } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(r).height = 30
  r += 1

  const notes = band(r)
  notes.value = BOM_NOTES
  notes.font = { italic: true, size: 10, color: { argb: META_GREY } }
  notes.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(r).height = 30
  r += 2

  r = writeTable(ws, table, r)
  r += 1
  writeFooter(ws, r, columnCount, customerName)
}

function findSection(model: ProposalRenderModel, test: (heading: string) => boolean): RenderSection | undefined {
  return model.sections.find((s) => test(s.heading))
}

/**
 * Dedicated "Inclusions & Exclusions" sheet (Honda pattern): a numbered,
 * banner-headed pair of lists — "1. Included in the Price" (green callout
 * rows) and "2. Not Included (Exclusions)" (plain) — built directly from the
 * render model's Inclusions & Exclusions section (formats/inclusions.ts) so
 * the sheet can never drift from what the main sheet's inline section says.
 * A no-op if that section isn't present in the model.
 */
function writeInclusionsExclusionsSheet(wb: ExcelJS.Workbook, model: ProposalRenderModel, customerName: string): void {
  const section = findSection(model, (h) => /inclusions (&|and) exclusions/i.test(h))
  const bullets = section?.bullets ?? []
  const incAt = bullets.findIndex((b) => /^included in this proposal:$/i.test(b))
  const excAt = bullets.findIndex((b) => /^not included in this proposal:$/i.test(b))
  if (incAt === -1 || excAt === -1) return

  const included = bullets.slice(incAt + 1, excAt)
  const excluded = bullets.slice(excAt + 1)

  const colCount = 1
  const ws = wb.addWorksheet('Inclusions & Exclusions')
  ws.columns = [{ width: 100 }]
  const band = (row: number): ExcelJS.Cell => {
    ws.mergeCells(row, 1, row, colCount)
    return ws.getCell(row, 1)
  }

  let r = 1
  const title = band(r)
  title.value = 'Inclusions & Exclusions'
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANNER_BLUE } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(r).height = 30
  r += 2

  const writeList = (heading: string, items: string[], callout: boolean): void => {
    const h = band(r)
    h.value = heading
    h.font = { bold: true, size: 11, color: { argb: BANNER_BLUE } }
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBHEADER_TINT } }
    h.alignment = { indent: 1 }
    r += 1
    for (const item of items) {
      const c = band(r)
      c.value = `•  ${item}`
      c.font = { size: 10, color: { argb: 'FF222222' } }
      c.alignment = { wrapText: true, vertical: 'top', indent: 1 }
      if (callout) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_CALLOUT } }
      r += 1
    }
    r += 1
  }

  writeList('1. Included in the Price', included, true)
  writeList('2. Not Included (Exclusions)', excluded, false)

  writeFooter(ws, r, colCount, customerName)
}

/**
 * Dedicated "Sizing Estimate" sheet, mirroring the BOM annexure's own-sheet
 * pattern: banner title, the section's paragraphs (SaaS/Hybrid platform
 * sizing key/value lines, or the On-Prem annexure pointer), then the Estate
 * Considered table when there is one. A no-op when the model has no Sizing
 * Estimate section (CM-only On-Prem — see formats/sizing.ts).
 */
function writeSizingSheet(wb: ExcelJS.Workbook, model: ProposalRenderModel, customerName: string): void {
  const section = findSection(model, (h) => /sizing estimate/i.test(h))
  if (!section) return

  const colCount = Math.max(2, section.table?.columns.length ?? 0)
  const ws = wb.addWorksheet('Sizing Estimate')
  ws.columns = Array.from({ length: colCount }, (_, i) => ({ width: i === 0 ? 34 : 20 }))
  const band = (row: number): ExcelJS.Cell => {
    ws.mergeCells(row, 1, row, colCount)
    return ws.getCell(row, 1)
  }

  let r = 1
  const title = band(r)
  title.value = 'Sizing Estimate'
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANNER_BLUE } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(r).height = 30
  r += 1

  for (const para of section.paragraphs ?? []) {
    writeParagraph(ws, r, colCount, para)
    r += 1
  }
  r += 1

  if (section.table) r = writeTable(ws, section.table, r)
  r += 1
  writeFooter(ws, r, colCount, customerName)
}

/**
 * Build the workbook in memory (no DOM). Throws if the model — or the BOM
 * annexure rows — contain any blocklisted partner term. Separated from the
 * browser download step so this guard can be unit-tested directly.
 */
export function buildWorkbook(
  model: ProposalRenderModel,
  opts: { bom?: BomRow[]; logo?: ArrayBuffer } = {},
): ExcelJS.Workbook {
  assertClientSafe(model, opts.bom)

  const wb = new ExcelJS.Workbook()
  const maxCols = Math.max(2, ...model.sections.map((s) => s.table?.columns.length ?? 0))
  const ws = wb.addWorksheet((model.title || 'Proposal').slice(0, 31))
  ws.columns = Array.from({ length: maxCols }, (_, i) => ({ width: i === 0 ? 42 : 20 }))

  const headerEnd = model.cover
    ? writeCover(wb, ws, model.cover, maxCols, opts.logo)
    : writePlainHeader(ws, model, maxCols)
  const sectionsEnd = writeSections(ws, model, maxCols, headerEnd)
  writeFooter(ws, sectionsEnd, maxCols, model.cover?.customer ?? '')

  const customerName = model.cover?.customer ?? ''
  writeInclusionsExclusionsSheet(wb, model, customerName)
  writeSizingSheet(wb, model, customerName)

  if (opts.bom && opts.bom.length > 0) {
    const annex = wb.addWorksheet('Infrastructure You Provide')
    annex.columns = [{ width: 34 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 20 }]
    writeBomAnnexure(annex, opts.bom, customerName)
  }

  return wb
}

/** Build the workbook and trigger a browser download. */
export async function exportProposalXlsx(model: ProposalRenderModel, opts: ExcelExportOptions): Promise<void> {
  const wb = buildWorkbook(model, { bom: opts.bom, logo: opts.logo })
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = opts.filename.endsWith('.xlsx') ? opts.filename : `${opts.filename}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
