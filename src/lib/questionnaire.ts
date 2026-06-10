// Per-customer questionnaire round-trip. The generator and the parser share ONE
// schema (the constants + cell layout below), so a filled file re-uploads
// losslessly. Contains NO prices — only questions and answer cells. Built from the
// price-stripped public form.
//
// Layout (rows 1-4 = header block, row 5 = table header, row 6+ = questions):
//   col 1  Field Code   (HIDDEN — field_key | info:<key> | __cm_tier__ | empty)
//   col 2  #            (per-section number A.1, A.2 …)
//   col 3  Question     (question_text with inline example)
//   col 4  Response     (the answer cell — the only cell users edit)
//   col 5  Why this is needed
// Questions are grouped into SECTIONS (lettered A, B, …) ordered by section_sort
// then item_sort. Section header rows carry no code, so the parser ignores them —
// as it ignores informational rows. Pricing consumes ONLY quantities + cmTier.

import * as ExcelJS from 'exceljs'
import type { PublicField, PublicForm, PublicInformationalQuestion } from './publicApi'

export const QUESTIONNAIRE_MARKER = 'PERFIOS_QUESTIONNAIRE_V1'
export const CM_TIER_CODE = '__cm_tier__'
const INFO_PREFIX = 'info:'
const META_SHEET = '_perfios_meta'
const QUESTION_SHEET = 'Questionnaire'

const CODE_COL = 1
const NUM_COL = 2
const QUESTION_COL = 3
const ANSWER_COL = 4
const WHY_COL = 5
const HEADER_ROW = 5
const CUSTOMER_CELL = 'C2'
const DATE_CELL = 'E2'

// CM tier lives in its own trailing section regardless of how fields are sectioned.
const CM_SECTION = 'Consent Manager'
const CM_SECTION_SORT = 1_000_000
const DEFAULT_SECTION = 'General'

export type InfoAnswer = string | number | boolean

export interface ParsedQuestionnaire {
  moduleKeys: string[]
  /** Priced quantities ONLY (field_key -> integer). Pricing reads these. */
  quantities: Record<string, number>
  cmTier: string | null
  /** Informational (non-priced) answers. STORED ONLY — never affect pricing. */
  informationalAnswers: Record<string, InfoAnswer>
  customerName: string
}

export interface QuestionnaireOpts {
  customerName?: string
  /** Optional pre-fill (e.g. re-download after the user typed values on screen). */
  quantities?: Record<string, number>
  /** tier_key to pre-select. */
  cmTier?: string | null
  informationalAnswers?: Record<string, InfoAnswer>
}

/** Active fields tagged to the selected modules (union; VM gating falls out of the tags). */
function applicableFields(form: PublicForm, moduleKeys: string[]): PublicField[] {
  const byKey = new Map(form.fields.map((f) => [f.field_key, f]))
  const sel = new Set(moduleKeys)
  const keys = new Set<string>()
  for (const tag of form.module_fields) {
    if (sel.has(tag.module_key) && byKey.has(tag.field_key)) keys.add(tag.field_key)
  }
  return [...keys].map((k) => byKey.get(k)!).filter((f) => f.active).sort((a, b) => a.sort_order - b.sort_order)
}

function tierSelected(form: PublicForm, moduleKeys: string[]): boolean {
  const sel = new Set(moduleKeys)
  return form.modules.some((m) => sel.has(m.module_key) && m.pricing_type === 'tier')
}

/** Question text with the example folded in inline. */
function questionText(text: string | null | undefined, label: string, example: string | null | undefined): string {
  const q = (text ?? '').trim() || label
  const ex = (example ?? '').trim()
  return ex ? `${q} (e.g. ${ex})` : q
}

/** A, B, …, Z, AA, AB … for section index 0, 1, 2 … */
function sectionLetter(idx: number): string {
  let s = ''
  let n = idx + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Item {
  code: string
  question: string
  why: string
  section: string
  sectionSort: number
  itemSort: number
  /** Dropdown options for the answer cell, if any. */
  validation?: string[]
  prefill?: string | number | null
}

function infoPrefill(q: PublicInformationalQuestion, val: InfoAnswer | undefined): string | number | null {
  if (val === undefined || val === null || val === '') return null
  if (q.answer_type === 'number') {
    const n = Number(val)
    return Number.isFinite(n) ? n : null
  }
  if (q.answer_type === 'yes_no') {
    return val === true || /^(y|yes|true)$/i.test(String(val).trim()) ? 'Yes' : 'No'
  }
  return String(val)
}

function buildItems(form: PublicForm, moduleKeys: string[], opts: QuestionnaireOpts): Item[] {
  const items: Item[] = []

  for (const f of applicableFields(form, moduleKeys)) {
    const pre = opts.quantities?.[f.field_key]
    items.push({
      code: f.field_key,
      question: questionText(f.question_text, f.label, f.example),
      why: (f.why_text ?? '').trim(),
      section: (f.section ?? '').trim() || DEFAULT_SECTION,
      sectionSort: f.section_sort ?? 0,
      itemSort: f.item_sort ?? f.sort_order,
      prefill: pre === undefined || pre === null ? null : pre,
    })
  }

  for (const q of form.informational_questions ?? []) {
    if (!q.active) continue
    const validation =
      q.answer_type === 'yes_no' ? ['Yes', 'No'] : q.answer_type === 'select' ? q.options ?? [] : undefined
    items.push({
      code: `${INFO_PREFIX}${q.question_key}`,
      question: questionText(q.question_text, q.question_key, q.example),
      why: (q.why_text ?? '').trim(),
      section: (q.section ?? '').trim() || DEFAULT_SECTION,
      sectionSort: q.section_sort ?? 0,
      itemSort: q.item_sort ?? 0,
      validation: validation && validation.length ? validation : undefined,
      prefill: infoPrefill(q, opts.informationalAnswers?.[q.question_key]),
    })
  }

  if (tierSelected(form, moduleKeys) && form.cm_tiers.length > 0) {
    const label = opts.cmTier ? form.cm_tiers.find((t) => t.tier_key === opts.cmTier)?.label ?? null : null
    items.push({
      code: CM_TIER_CODE,
      question: 'Consent Manager tier',
      why: 'Select the licensing tier for the Consent Manager module.',
      section: CM_SECTION,
      sectionSort: CM_SECTION_SORT,
      itemSort: 0,
      validation: form.cm_tiers.map((t) => t.label),
      prefill: label,
    })
  }

  return items
}

export function buildQuestionnaireWorkbook(
  form: PublicForm,
  moduleKeys: string[],
  opts: QuestionnaireOpts = {},
  today: Date = new Date(),
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(QUESTION_SHEET)
  ws.columns = [{ width: 16 }, { width: 7 }, { width: 56 }, { width: 20 }, { width: 46 }]
  ws.getColumn(CODE_COL).hidden = true // Field Code (technical, do not edit)

  // --- Header block ---------------------------------------------------------
  ws.mergeCells('B1:D1')
  const title = ws.getCell('B1')
  title.value = `Pricing questionnaire — ${form.instance_name}`
  title.font = { bold: true, size: 14, color: { argb: 'FF1C58A7' } }
  const conf = ws.getCell('E1')
  conf.value = 'CONFIDENTIAL'
  conf.font = { bold: true, size: 10, color: { argb: 'FF94A3B8' } }
  conf.alignment = { horizontal: 'right' }

  ws.getCell('B2').value = 'Customer:'
  ws.getCell('B2').font = { bold: true, color: { argb: 'FF64748B' } }
  ws.getCell(CUSTOMER_CELL).value = opts.customerName ?? ''
  ws.getCell('D2').value = 'Date:'
  ws.getCell('D2').font = { bold: true, color: { argb: 'FF64748B' } }
  ws.getCell(DATE_CELL).value = isoDate(today)

  ws.mergeCells('B3:E3')
  const intro = ws.getCell('B3')
  intro.value =
    'Approximate / ballpark counts are fine — exact figures are not needed. Fill the Response column, then upload this file back into the calculator.'
  intro.font = { italic: true, size: 10, color: { argb: 'FF64748B' } }

  // --- Table header ---------------------------------------------------------
  const header = ['Field Code', '#', 'Question', 'Response', 'Why this is needed']
  const headerRow = ws.getRow(HEADER_ROW)
  header.forEach((h, i) => {
    const c = headerRow.getCell(i + 1)
    c.value = h
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C58A7' } }
  })

  // --- Sectioned question rows ---------------------------------------------
  const items = buildItems(form, moduleKeys, opts)

  // Section order: by the section's sort (min across its items), then name.
  const sectionSort = new Map<string, number>()
  for (const it of items) {
    const cur = sectionSort.get(it.section)
    if (cur === undefined || it.sectionSort < cur) sectionSort.set(it.section, it.sectionSort)
  }
  const sections = [...sectionSort.keys()].sort((a, b) => {
    const d = sectionSort.get(a)! - sectionSort.get(b)!
    return d !== 0 ? d : a.localeCompare(b)
  })

  const answerBorder = { bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } } }
  let r = HEADER_ROW + 1

  sections.forEach((section, si) => {
    const letter = sectionLetter(si)
    const headRow = ws.getRow(r)
    ws.mergeCells(r, QUESTION_COL, r, WHY_COL)
    const hc = headRow.getCell(QUESTION_COL)
    hc.value = `${letter}. ${section}`
    hc.font = { bold: true, color: { argb: 'FF1C58A7' } }
    hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FB' } }
    headRow.getCell(NUM_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FB' } }
    r += 1

    const rows = items
      .map((it, i) => ({ it, i }))
      .filter((x) => x.it.section === section)
      .sort((a, b) => (a.it.itemSort - b.it.itemSort) || (a.i - b.i))

    rows.forEach(({ it }, ni) => {
      const row = ws.getRow(r)
      row.getCell(CODE_COL).value = it.code
      row.getCell(NUM_COL).value = `${letter}.${ni + 1}`
      const qc = row.getCell(QUESTION_COL)
      qc.value = it.question
      qc.alignment = { wrapText: true, vertical: 'top' }
      const ans = row.getCell(ANSWER_COL)
      ans.value = it.prefill ?? null
      if (it.validation && it.validation.length) {
        ans.dataValidation = { type: 'list', allowBlank: true, formulae: [`"${it.validation.join(',')}"`] }
      }
      ans.border = answerBorder
      const wc = row.getCell(WHY_COL)
      wc.value = it.why
      wc.font = { size: 10, color: { argb: 'FF64748B' } }
      wc.alignment = { wrapText: true, vertical: 'top' }
      r += 1
    })
  })

  // Hidden machine-readable metadata: marker + selected modules.
  const meta = wb.addWorksheet(META_SHEET)
  meta.state = 'veryHidden'
  meta.getCell('A1').value = QUESTIONNAIRE_MARKER
  meta.getCell('A2').value = moduleKeys.join(',')

  return wb
}

export async function generateQuestionnaireXlsx(
  form: PublicForm,
  moduleKeys: string[],
  opts: QuestionnaireOpts = {},
  today: Date = new Date(),
): Promise<void> {
  const wb = buildQuestionnaireWorkbook(form, moduleKeys, opts, today)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Perfios-Questionnaire-${isoDate(today)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

/** Unwrap a formula cell to its computed result; otherwise return the raw value. */
function cellValue(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'result' in (raw as Record<string, unknown>)) {
    return (raw as { result?: unknown }).result
  }
  return raw
}

function coerceInfo(q: PublicInformationalQuestion | undefined, raw: unknown): InfoAnswer | null {
  if (raw === null || raw === undefined || raw === '') return null
  const type = q?.answer_type
  if (type === 'number') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  if (type === 'yes_no') return /^(y|yes|true)$/i.test(String(raw).trim())
  if (type === 'date' && raw instanceof Date) return isoDate(raw)
  return String(raw).trim()
}

/** Parse a filled questionnaire. Throws if the file is not a Perfios questionnaire. */
export async function parseQuestionnaireBuffer(buffer: ArrayBuffer, form: PublicForm): Promise<ParsedQuestionnaire> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const meta = wb.getWorksheet(META_SHEET)
  if (!meta || String(meta.getCell('A1').value ?? '') !== QUESTIONNAIRE_MARKER) {
    throw new Error('This file is not a Perfios questionnaire. Please upload the file generated by this calculator.')
  }

  const knownModules = new Set(form.modules.map((m) => m.module_key))
  const moduleKeys = String(meta.getCell('A2').value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((k) => k && knownModules.has(k))

  const knownFields = new Set(form.fields.map((f) => f.field_key))
  const tierByLabel = new Map(form.cm_tiers.map((t) => [t.label, t.tier_key]))
  const infoByKey = new Map((form.informational_questions ?? []).map((q) => [q.question_key, q]))

  const quantities: Record<string, number> = {}
  const informationalAnswers: Record<string, InfoAnswer> = {}
  let cmTier: string | null = null
  let customerName = ''

  const ws = wb.getWorksheet(QUESTION_SHEET) ?? wb.worksheets.find((w) => w.name !== META_SHEET)
  if (ws) {
    customerName = String(ws.getCell(CUSTOMER_CELL).value ?? '').trim()
    ws.eachRow((row) => {
      const code = String(row.getCell(CODE_COL).value ?? '').trim()
      if (!code || code === 'Field Code') return // section headers / table header
      const raw = cellValue(row.getCell(ANSWER_COL).value)

      if (code === CM_TIER_CODE) {
        cmTier = tierByLabel.get(String(raw ?? '').trim()) ?? null
        return
      }
      if (code.startsWith(INFO_PREFIX)) {
        const key = code.slice(INFO_PREFIX.length)
        const v = coerceInfo(infoByKey.get(key), raw)
        if (v !== null && v !== '') informationalAnswers[key] = v
        return
      }
      if (!knownFields.has(code)) return // ignore unknown / extra rows
      if (raw === null || raw === undefined || raw === '') return
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 0) quantities[code] = Math.trunc(n)
    })
  }

  return { moduleKeys, quantities, cmTier, informationalAnswers, customerName }
}
