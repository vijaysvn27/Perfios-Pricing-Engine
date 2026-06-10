// Branded Excel export (ExcelJS): blue header band, prepared-for/date, hero block,
// headline totals, the breakdown table, and an editable Terms section. No margin
// columns (partners add margin themselves). No per-unit rates or rate card.

import * as ExcelJS from 'exceljs'
import { frequencyLabel } from './breakdown'
import type { ClientBreakdown } from './breakdown'

const BLUE = 'FF1C58A7'
const GREEN = 'FF37BC8B'
const LIGHT = 'FFF1F5F9'
const BORDER = 'FFE2E8F0'
const INR = '"₹" #,##,##0' // ₹ with Indian digit grouping

export interface ExportOptions {
  customerName?: string
  hero?: string
  terms?: string
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BORDER } }
  return { top: side, bottom: side, left: side, right: side }
}

export async function exportBreakdownXlsx(
  breakdown: ClientBreakdown,
  opts: ExportOptions = {},
  today: Date = new Date(),
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Pricing')
  ws.columns = [{ width: 46 }, { width: 24 }, { width: 18 }, { width: 18 }]

  const dateStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`
  const customer = (opts.customerName ?? '').trim()
  let r = 1

  // Merge A:D on a row and return the (top-left) cell to style.
  const band = (row: number): ExcelJS.Cell => {
    ws.mergeCells(`A${row}:D${row}`)
    return ws.getCell(`A${row}`)
  }
  const gridCell = (row: number, col: number): ExcelJS.Cell => ws.getRow(row).getCell(col)

  // Title band
  const title = band(r)
  title.value = 'Perfios Pricing Estimate'
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(r).height = 30
  r += 1

  // Prepared for / date
  const pf = band(r)
  pf.value = customer ? `Prepared for: ${customer}` : 'Prepared for: ______________________'
  pf.font = { bold: true, size: 11, color: { argb: BLUE } }
  pf.alignment = { indent: 1 }
  r += 1
  const dt = band(r)
  dt.value = `Date: ${dateStr}`
  dt.font = { size: 10, color: { argb: 'FF64748B' } }
  dt.alignment = { indent: 1 }
  r += 2

  // Hero
  const hero = (opts.hero ?? '').trim()
  if (hero) {
    const h = band(r)
    h.value = hero
    h.font = { italic: true, size: 11, color: { argb: 'FF334155' } }
    h.alignment = { wrapText: true, vertical: 'top' }
    ws.getRow(r).height = 46
    r += 2
  }

  // Headline totals
  const ht1 = gridCell(r, 1)
  ht1.value = 'Year 1 Total'
  ht1.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ht1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } }
  const hv1 = gridCell(r, 2)
  hv1.value = breakdown.year1Total
  hv1.numFmt = INR
  hv1.font = { bold: true }
  hv1.alignment = { horizontal: 'right' }
  const ht2 = gridCell(r, 3)
  ht2.value = 'Year 2 Total'
  ht2.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ht2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } }
  const hv2 = gridCell(r, 4)
  hv2.value = breakdown.year2Total
  hv2.numFmt = INR
  hv2.font = { bold: true }
  hv2.alignment = { horizontal: 'right' }
  r += 2

  // Table header
  const headers = ['Line', 'Frequency', 'Year 1', 'Year 2']
  headers.forEach((text, i) => {
    const c = gridCell(r, i + 1)
    c.value = text
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
    c.alignment = { horizontal: i >= 2 ? 'right' : 'left' }
    c.border = thinBorder()
  })
  r += 1

  // Data rows
  breakdown.lines.forEach((l, idx) => {
    const label =
      l.includes && l.includes.length > 0
        ? `${l.label}\nIncludes: ${l.includes.join(', ')}`
        : l.label
    const values: Array<string | number> = [label, frequencyLabel(l.frequency), l.year1, l.year2]
    values.forEach((val, i) => {
      const c = gridCell(r, i + 1)
      c.value = val
      c.border = thinBorder()
      if (i >= 2) {
        c.numFmt = INR
        c.alignment = { horizontal: 'right' }
      } else if (i === 0) {
        c.alignment = { wrapText: true, vertical: 'top' }
      }
      if (idx % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
    })
    r += 1
  })

  // Total row
  const totals: Array<string | number> = ['Total', '', breakdown.year1Total, breakdown.year2Total]
  totals.forEach((val, i) => {
    const c = gridCell(r, i + 1)
    c.value = val
    c.font = { bold: true }
    c.border = thinBorder()
    if (i >= 2) {
      c.numFmt = INR
      c.alignment = { horizontal: 'right' }
    }
  })
  r += 2

  // Terms
  const termsLines = (opts.terms ?? '')
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
  if (termsLines.length > 0) {
    const th = band(r)
    th.value = 'Terms & Notes'
    th.font = { bold: true, size: 11, color: { argb: BLUE } }
    r += 1
    for (const line of termsLines) {
      const c = band(r)
      c.value = `•  ${line}`
      c.font = { size: 10, color: { argb: 'FF334155' } }
      c.alignment = { wrapText: true, vertical: 'top' }
      r += 1
    }
    r += 1
  }

  // Footer
  const foot = band(r)
  foot.value = `Generated on ${dateStr}. Base cost only; figures in INR.`
  foot.font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeCustomer = customer
    ? `-${customer.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')}`
    : ''
  const fileDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  a.href = url
  a.download = `Perfios-Pricing${safeCustomer}-${fileDate}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
