// Excel export of the client-safe breakdown (SheetJS). Cost cells are numeric with
// an Indian rupee number format (so they display as ₹17,13,800 yet stay editable),
// plus Margin % and Final columns with live formulas for the partner to add margin.
// No per-unit rates or rate card — only the bucket-level breakdown lines.

import * as XLSX from 'xlsx'
import { frequencyLabel } from './breakdown'
import type { ClientBreakdown } from './breakdown'

// Indian digit grouping (#,##,##0) with the rupee symbol.
const INR_FMT = '"₹ "#,##,##0'

function addr(c: number, r: number): string {
  return XLSX.utils.encode_cell({ c, r })
}

export function exportBreakdownXlsx(breakdown: ClientBreakdown, today: Date = new Date()): void {
  const headers = ['Line', 'Frequency', 'Year 1 (Base)', 'Year 2 (Base)', 'Margin %', 'Year 1 Final', 'Year 2 Final']
  const ws: XLSX.WorkSheet = {}

  headers.forEach((h, c) => {
    ws[addr(c, 0)] = { t: 's', v: h }
  })

  breakdown.lines.forEach((l, i) => {
    const r = i + 1 // 0-based sheet row
    const xl = r + 1 // 1-based Excel row for formulas
    const label =
      l.includes && l.includes.length > 0
        ? `${l.label} (Includes: ${l.includes.join(', ')})`
        : l.label
    ws[addr(0, r)] = { t: 's', v: label }
    ws[addr(1, r)] = { t: 's', v: frequencyLabel(l.frequency) }
    ws[addr(2, r)] = { t: 'n', v: l.year1, z: INR_FMT }
    ws[addr(3, r)] = { t: 'n', v: l.year2, z: INR_FMT }
    ws[addr(4, r)] = { t: 'n', v: 0, z: '0%' } // Margin % — partner edits this
    ws[addr(5, r)] = { t: 'n', f: `C${xl}*(1+E${xl})`, z: INR_FMT } // Year 1 Final
    ws[addr(6, r)] = { t: 'n', f: `D${xl}*(1+E${xl})`, z: INR_FMT } // Year 2 Final
  })

  const totalR = breakdown.lines.length + 1
  ws[addr(0, totalR)] = { t: 's', v: 'Total' }
  if (breakdown.lines.length > 0) {
    const first = 2
    const last = breakdown.lines.length + 1
    ws[addr(2, totalR)] = { t: 'n', f: `SUM(C${first}:C${last})`, z: INR_FMT }
    ws[addr(3, totalR)] = { t: 'n', f: `SUM(D${first}:D${last})`, z: INR_FMT }
    ws[addr(5, totalR)] = { t: 'n', f: `SUM(F${first}:F${last})`, z: INR_FMT }
    ws[addr(6, totalR)] = { t: 'n', f: `SUM(G${first}:G${last})`, z: INR_FMT }
  }

  ws['!ref'] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 6, r: totalR } })
  ws['!cols'] = [
    { wch: 44 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 16 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pricing')

  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  XLSX.writeFile(wb, `Perfios-Pricing-${d}.xlsx`)
}
