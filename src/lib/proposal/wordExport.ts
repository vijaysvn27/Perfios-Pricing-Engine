// Client-ready Word (.docx) export for a proposal render model — replaces the
// browser print/PDF path (which injected its own header/date and could never
// match the branding benchmark). Mirrors excelExport.ts's structure and
// guard: buildProposalDocx is a pure builder (no DOM/Blob calls) so the
// blocklist guard and the document shape are unit-testable directly;
// exportProposalDocx is the thin browser-download wrapper around it.
//
// Styling replicates the extracted Perfios design spec (see
// docs/superpowers/specs/2026-07-12-proposal-builder-revamp-design.md §7,
// "Document design language") 1:1 with excelExport's palette and
// RenderModelView's screen preview, so Word / Excel / screen never disagree.
//
// CRITICAL (D5): buildProposalDocx throws if scanForBlocklist finds a
// partner term in the render model OR in any BOM annexure row — no client
// file may ever contain a partner name (see clientSafe.ts).
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TabStopPosition,
  TextRun,
  WidthType,
} from 'docx'
import { formatINR } from '../format'
import { scanForBlocklist } from './clientSafe'
import type { BomRow } from './bomData'
import type { ProposalRenderModel, RenderSection, RenderTable } from './formats/types'

export interface WordExportOpts {
  bom?: BomRow[]
  bomNotes?: string
  logo?: ArrayBuffer
  customer: string
}

// ---------------------------------------------------------------------------
// Palette + geometry (document design language spec — same hex values as
// excelExport.ts's PRIMARY/BANNER_BLUE/etc, minus the ExcelJS 'FF' alpha
// prefix; docx colors are plain 6-hex RGB strings).
// ---------------------------------------------------------------------------
const FONT = 'Arial'

const COLOR = {
  navy: '1A1A2E',
  primary: '003D82',
  green: '3E9E6A',
  greenRule: '6FCF97',
  meta: '5B6472',
  hairline: 'D7DEE8',
  hairlineOuter: 'C9D4E2',
  body: '222222',
  white: 'FFFFFF',
  calloutGreenFill: 'E2EFDA',
  calloutGreenText: '1C58A7',
  totalFill: '37BC8B',
  zebra: 'F4F7FB',
  closingFill: 'EEF2F7',
} as const

// A4 in twips (1440 twips/inch, 2.54cm/inch): 21.0cm x 29.7cm.
const PAGE_WIDTH_TWIPS = 11906
const PAGE_HEIGHT_TWIPS = 16838
// 2cm side margins, 2.2cm top/bottom margins, ~0.49in header/footer distance.
const MARGIN_SIDE_TWIPS = 1134
const MARGIN_TOPBOTTOM_TWIPS = 1247
const HEADER_FOOTER_DIST_TWIPS = 710

/** Run/paragraph font size: docx takes half-points. */
function hp(pt: number): number {
  return Math.round(pt * 2)
}
/** Border size: docx takes eighths of a point. */
function eighths(pt: number): number {
  return Math.round(pt * 8)
}

type Align = (typeof AlignmentType)[keyof typeof AlignmentType]

function isTotalRow(firstCell: string | number): boolean {
  return /total|tco/i.test(String(firstCell))
}

/** Closing sections (heading contains "One Partner" or "Certifications") get
 * the callout treatment, matching RenderModelView.isCalloutSection. */
function isClosingSection(heading: string): boolean {
  return /one partner|certifications/i.test(heading)
}

function thinTableBorders(outerColor: string, innerColor: string) {
  const outer = { style: BorderStyle.SINGLE, size: eighths(0.5), color: outerColor }
  const inner = { style: BorderStyle.SINGLE, size: eighths(0.5), color: innerColor }
  return { top: outer, bottom: outer, left: outer, right: outer, insideHorizontal: inner, insideVertical: inner }
}

// ---------------------------------------------------------------------------
// Running header / footer (every page except the cover — titlePage:true on
// the section properties means page 1 gets no header/footer at all).
// ---------------------------------------------------------------------------
function buildRunningHeader(customer: string, title: string): Header {
  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { bottom: { style: BorderStyle.SINGLE, size: eighths(0.5), color: COLOR.hairline } },
        children: [
          new TextRun({ text: `Perfios DPDP Suite · ${customer}`, font: FONT, size: hp(7.5), color: COLOR.meta }),
          new TextRun({ text: '\t', font: FONT, size: hp(7.5), color: COLOR.meta }),
          new TextRun({ text: title, font: FONT, size: hp(7.5), color: COLOR.meta }),
        ],
      }),
    ],
  })
}

function buildRunningFooter(customer: string): Footer {
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { top: { style: BorderStyle.SINGLE, size: eighths(0.5), color: COLOR.hairline } },
        children: [
          new TextRun({
            text: `Private & Confidential — prepared by Perfios for ${customer}`,
            font: FONT,
            size: hp(7),
            color: COLOR.meta,
          }),
          new TextRun({ text: '\t', font: FONT, size: hp(7), color: COLOR.meta }),
          new TextRun({
            children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
            font: FONT,
            size: hp(7),
            color: COLOR.meta,
          }),
        ],
      }),
    ],
  })
}

// ---------------------------------------------------------------------------
// Cover (first page — from model.cover, then a page break onto the first
// section heading).
// ---------------------------------------------------------------------------
const LOGO_HEIGHT_PX = 86 // ~0.9in at 96dpi
const LOGO_ASPECT = 900 / 619 // source PNG is 900x619
const LOGO_WIDTH_PX = Math.round(LOGO_HEIGHT_PX * LOGO_ASPECT)

function buildCoverBlocks(model: ProposalRenderModel, opts: WordExportOpts): Paragraph[] {
  const cover = model.cover
  const blocks: Paragraph[] = []

  // 1. Logo (or text wordmark fallback).
  if (opts.logo) {
    blocks.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: opts.logo,
            type: 'png',
            transformation: { width: LOGO_WIDTH_PX, height: LOGO_HEIGHT_PX },
          }),
        ],
      }),
    )
  } else {
    blocks.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'PERFIOS', font: FONT, bold: true, size: hp(20), color: COLOR.primary }),
          new TextRun({ text: ' · DPDP SUITE', font: FONT, bold: true, size: hp(20), color: COLOR.green }),
        ],
      }),
    )
  }

  // 2. Accent rule.
  blocks.push(
    new Paragraph({
      spacing: { before: 120, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: eighths(3), color: COLOR.greenRule } },
      children: [],
    }),
  )

  // 3. Two-tone title: "DPDP Suite" / model.title.
  blocks.push(
    new Paragraph({
      spacing: { before: 160, after: 160 },
      children: [
        new TextRun({ text: 'DPDP Suite', font: FONT, bold: true, size: hp(24), color: COLOR.navy, break: 1 }),
        new TextRun({ text: model.title, font: FONT, bold: true, size: hp(24), color: COLOR.primary }),
      ],
    }),
  )

  // 4. Eyebrow + customer.
  blocks.push(
    new Paragraph({
      spacing: { before: 200, after: 40 },
      children: [new TextRun({ text: 'Prepared for', font: FONT, size: hp(11), color: COLOR.meta })],
    }),
  )
  blocks.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: cover?.customer || opts.customer || '—',
          font: FONT,
          bold: true,
          size: hp(17),
          color: COLOR.navy,
        }),
      ],
    }),
  )

  // 5. Tagline.
  blocks.push(
    new Paragraph({
      spacing: { after: 320 },
      children: [
        new TextRun({
          text: 'Solution · Consulting · Integration · SLAs · Support — delivered by Perfios',
          font: FONT,
          italics: true,
          size: hp(10),
          color: COLOR.green,
        }),
      ],
    }),
  )

  // 6. Prepared-by block.
  blocks.push(
    new Paragraph({
      spacing: { before: 400, after: 40 },
      children: [
        new TextRun({ text: 'Perfios Software Solutions Pvt. Ltd.', font: FONT, bold: true, size: hp(11), color: COLOR.primary }),
      ],
    }),
  )
  if (cover) {
    blocks.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: `${cover.date_label}  ·  Validity ${cover.validity_days} days  ·  Ref ${cover.reference}`,
            font: FONT,
            size: hp(9),
            color: COLOR.meta,
          }),
        ],
      }),
    )
  }
  blocks.push(
    new Paragraph({
      children: [new TextRun({ text: 'Private & Confidential', font: FONT, size: hp(9), color: COLOR.meta })],
    }),
  )

  return blocks
}

// ---------------------------------------------------------------------------
// Body content: paragraphs, bullets, sub-labels, "Included:" callouts, tables.
// ---------------------------------------------------------------------------
function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: FONT, size: hp(10), color: COLOR.body })],
  })
}

/** Sub-labels like "Included in this proposal:" (any bullet ending ':'). */
function subLabelParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 60 },
    children: [new TextRun({ text, font: FONT, bold: true, size: hp(10.5), color: COLOR.green })],
  })
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    indent: { left: 260 },
    children: [new TextRun({ text: `•  ${text}`, font: FONT, size: hp(10), color: COLOR.body })],
  })
}

/** Wraps arbitrary block content in a single-cell shaded table (Honda-style
 * callout inset). Used for "Included:" paragraphs and closing sections. */
function calloutWrap(blocks: (Paragraph | Table)[], fill: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: thinTableBorders(COLOR.hairlineOuter, COLOR.hairline),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, color: 'auto', fill },
            margins: { top: 160, bottom: 160, left: 180, right: 180 },
            children: blocks.length > 0 ? blocks : [new Paragraph({ children: [] })],
          }),
        ],
      }),
    ],
  })
}

function includedCalloutTable(text: string): Table {
  return calloutWrap(
    [new Paragraph({ children: [new TextRun({ text, font: FONT, bold: true, size: hp(10), color: COLOR.calloutGreenText })] })],
    COLOR.calloutGreenFill,
  )
}

function columnWidthPercents(n: number): number[] {
  if (n <= 1) return [100]
  if (n === 2) return [24, 76]
  const first = 28
  const rest = (100 - first) / (n - 1)
  return [first, ...Array.from({ length: n - 1 }, () => rest)]
}

function tableCell(
  text: string,
  opts: { bold?: boolean; color?: string; fill?: string; align?: Align; widthPct: number },
): TableCell {
  return new TableCell({
    width: { size: opts.widthPct, type: WidthType.PERCENTAGE },
    shading: opts.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.fill } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [new TextRun({ text, font: FONT, bold: opts.bold, size: hp(9.5), color: opts.color ?? COLOR.body })],
      }),
    ],
  })
}

/** Generic data table (header band + zebra rows + numeric right-align +
 * TOTAL-row treatment) — reused for both RenderTable sections and the BOM
 * annexure tables ("styled as above"). */
function buildDataTable(columns: string[], rows: (string | number)[][]): Table {
  const widths = columnWidthPercents(columns.length)

  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map((c, i) =>
      tableCell(c, {
        bold: true,
        color: COLOR.white,
        fill: COLOR.primary,
        align: i === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT,
        widthPct: widths[i],
      }),
    ),
  })

  const dataRows = rows.map((row, ri) => {
    const total = isTotalRow(row[0])
    return new TableRow({
      children: row.map((cell, ci) => {
        const numeric = typeof cell === 'number'
        const text = numeric ? formatINR(cell) : String(cell)
        return tableCell(text, {
          bold: total,
          color: total ? COLOR.white : COLOR.body,
          fill: total ? COLOR.totalFill : ri % 2 === 1 ? COLOR.zebra : undefined,
          align: numeric ? AlignmentType.RIGHT : AlignmentType.LEFT,
          widthPct: widths[ci],
        })
      }),
    })
  })

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: thinTableBorders(COLOR.hairlineOuter, COLOR.hairline),
    rows: [headerRow, ...dataRows],
  })
}

function buildTable(table: RenderTable): Table {
  return buildDataTable(table.columns, table.rows)
}

function sectionHeading(heading: string, pageBreakBefore: boolean): Paragraph {
  return new Paragraph({
    pageBreakBefore,
    spacing: { before: 320, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: eighths(0.75), color: COLOR.greenRule } },
    children: [new TextRun({ text: heading, font: FONT, bold: true, size: hp(15), color: COLOR.primary })],
  })
}

function sectionBodyBlocks(section: RenderSection): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = []
  for (const p of section.paragraphs ?? []) {
    blocks.push(p.startsWith('Included:') ? includedCalloutTable(p) : bodyParagraph(p))
  }
  for (const b of section.bullets ?? []) {
    blocks.push(b.trim().endsWith(':') ? subLabelParagraph(b) : bulletParagraph(b))
  }
  if (section.table) blocks.push(buildTable(section.table))
  return blocks
}

function buildSectionBlocks(section: RenderSection, isFirst: boolean): (Paragraph | Table)[] {
  const heading = sectionHeading(section.heading, isFirst)
  const body = sectionBodyBlocks(section)
  if (isClosingSection(section.heading)) {
    return [heading, calloutWrap(body, COLOR.closingFill)]
  }
  return [heading, ...body]
}

// ---------------------------------------------------------------------------
// Annexure ("Infrastructure You Provide (On-Premise)") — page break, intro
// paragraph, then Primary Site / Cold DR tables.
// ---------------------------------------------------------------------------
function annexureLabel(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, font: FONT, bold: true, size: hp(11), color: COLOR.primary })],
  })
}

function bomRowsToTable(rows: BomRow[]): Table {
  const columns = ['Component', 'Nodes', 'vCPU/node', 'RAM (GB)/node', 'Storage/node']
  const data = rows.map((b) => [b.component, b.nodes, b.vcpu, b.ram_gb, b.storage])
  return buildDataTable(columns, data)
}

function buildAnnexureBlocks(bom: BomRow[], bomNotes: string | undefined): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = []
  blocks.push(sectionHeading('Annexure — Infrastructure You Provide (On-Premise)', true))
  if (bomNotes) blocks.push(bodyParagraph(bomNotes))

  const primary = bom.filter((b) => b.site === 'primary')
  const dr = bom.filter((b) => b.site === 'dr')
  if (primary.length > 0) {
    blocks.push(annexureLabel('Primary Site'))
    blocks.push(bomRowsToTable(primary))
  }
  if (dr.length > 0) {
    blocks.push(annexureLabel('Cold DR'))
    blocks.push(bomRowsToTable(dr))
  }
  return blocks
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the Document in memory (no DOM/Blob/Packer calls). Throws if the
 * model — or the BOM annexure rows — contain any blocklisted partner term.
 * Separated from the browser download step so this guard, and the document
 * shape, are unit-testable directly (mirrors excelExport.buildWorkbook).
 */
export function buildProposalDocx(model: ProposalRenderModel, opts: WordExportOpts): Document {
  const offenders = new Set<string>([...scanForBlocklist(model), ...(opts.bom ? scanForBlocklist(opts.bom) : [])])
  if (offenders.size > 0) {
    throw new Error(
      `Blocked partner terms found in client-facing export, refusing to build: ${Array.from(offenders).join(', ')}`,
    )
  }

  const children: (Paragraph | Table)[] = [...buildCoverBlocks(model, opts)]

  model.sections.forEach((section, i) => {
    children.push(...buildSectionBlocks(section, i === 0))
  })

  if (opts.bom && opts.bom.length > 0) {
    children.push(...buildAnnexureBlocks(opts.bom, opts.bomNotes))
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_TWIPS, height: PAGE_HEIGHT_TWIPS },
            margin: {
              top: MARGIN_TOPBOTTOM_TWIPS,
              bottom: MARGIN_TOPBOTTOM_TWIPS,
              left: MARGIN_SIDE_TWIPS,
              right: MARGIN_SIDE_TWIPS,
              header: HEADER_FOOTER_DIST_TWIPS,
              footer: HEADER_FOOTER_DIST_TWIPS,
            },
          },
          titlePage: true,
        },
        headers: { default: buildRunningHeader(opts.customer, model.title) },
        footers: { default: buildRunningFooter(opts.customer) },
        children,
      },
    ],
  })
}

/** Build the document and trigger a browser download. */
export async function exportProposalDocx(
  model: ProposalRenderModel,
  opts: WordExportOpts & { filename: string },
): Promise<void> {
  const doc = buildProposalDocx(model, opts)
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = opts.filename.endsWith('.docx') ? opts.filename : `${opts.filename}.docx`
  a.click()
  URL.revokeObjectURL(url)
}
