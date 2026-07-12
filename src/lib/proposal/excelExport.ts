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
import type { ProposalCover, ProposalRenderModel, RenderTable } from './formats/types'

const BLUE = 'FF1C58A7'
const LIGHT = 'FFF1F5F9'
const BORDER = 'FFE2E8F0'
const INR = '"₹" #,##,##0'
const FOOTER_GREY = 'FF94A3B8'

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

function writeTable(ws: ExcelJS.Worksheet, table: RenderTable, startRow: number): number {
  let r = startRow
  table.columns.forEach((text, i) => {
    const c = ws.getRow(r).getCell(i + 1)
    c.value = text
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
    c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle' }
    c.border = thinBorder()
  })
  r += 1

  table.rows.forEach((row, idx) => {
    row.forEach((val, i) => {
      const c = ws.getRow(r).getCell(i + 1)
      c.value = val
      c.border = thinBorder()
      if (typeof val === 'number') {
        c.numFmt = INR
        c.alignment = { horizontal: 'right' }
      } else if (i === 0) {
        c.alignment = { wrapText: true, vertical: 'top' }
        c.font = { bold: /total|tco/i.test(String(val)) }
      }
      if (idx % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
    })
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
    ws.addImage(imageId, { tl: { col: 0.15, row: r - 1 + 0.15 }, ext: { width: 118, height: 81 } })
    brandRow.value = ''
    ws.getRow(r).height = 60
  } else {
    brandRow.value = 'PERFIOS'
    brandRow.font = { bold: true, size: 20, color: { argb: BLUE } }
    brandRow.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    ws.getRow(r).height = 34
  }
  r += 1

  const title = band(r)
  title.value = cover.title
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(r).height = 30
  r += 1

  const prepared = band(r)
  prepared.value = `Prepared for: ${cover.customer || '______________________'}`
  prepared.font = { bold: true, size: 11, color: { argb: BLUE } }
  prepared.alignment = { indent: 1 }
  r += 1

  const meta = band(r)
  meta.value = `Date: ${cover.date_label}   |   Valid ${cover.validity_days} days   |   Ref: ${cover.reference}`
  meta.font = { size: 10, color: { argb: 'FF64748B' } }
  meta.alignment = { indent: 1 }
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
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(r).height = 30
  r += 1

  const subtitle = band(r)
  subtitle.value = model.subtitle
  subtitle.font = { italic: true, size: 10, color: { argb: 'FF64748B' } }
  subtitle.alignment = { indent: 1 }
  r += 2
  return r
}

/** Footer band: "Perfios Software Solutions | Confidential — prepared for <customer>". */
function writeFooter(ws: ExcelJS.Worksheet, row: number, colCount: number, customerName: string): number {
  const band = (r: number): ExcelJS.Cell => {
    ws.mergeCells(r, 1, r, colCount)
    return ws.getCell(r, 1)
  }
  const f = band(row)
  f.value = `Perfios Software Solutions | Confidential — prepared for ${customerName || 'the client'}`
  f.font = { size: 9, italic: true, color: { argb: FOOTER_GREY } }
  return row + 1
}

function writeSections(ws: ExcelJS.Worksheet, model: ProposalRenderModel, colCount: number, startRow: number): number {
  const band = (row: number): ExcelJS.Cell => {
    ws.mergeCells(row, 1, row, colCount)
    return ws.getCell(row, 1)
  }

  let r = startRow

  for (const section of model.sections) {
    const heading = band(r)
    heading.value = section.heading
    heading.font = { bold: true, size: 12, color: { argb: BLUE } }
    r += 1

    for (const para of section.paragraphs ?? []) {
      const c = band(r)
      c.value = para
      c.font = { size: 10, color: { argb: 'FF334155' } }
      c.alignment = { wrapText: true, vertical: 'top' }
      r += 1
    }

    for (const bullet of section.bullets ?? []) {
      const c = band(r)
      c.value = `•  ${bullet}`
      c.font = { size: 10, color: { argb: 'FF334155' } }
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
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(r).height = 30
  r += 1

  const notes = band(r)
  notes.value = BOM_NOTES
  notes.font = { italic: true, size: 10, color: { argb: 'FF64748B' } }
  notes.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(r).height = 30
  r += 2

  r = writeTable(ws, table, r)
  r += 1
  writeFooter(ws, r, columnCount, customerName)
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

  if (opts.bom && opts.bom.length > 0) {
    const annex = wb.addWorksheet('Infrastructure You Provide')
    annex.columns = [{ width: 34 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 20 }]
    writeBomAnnexure(annex, opts.bom, model.cover?.customer ?? '')
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
