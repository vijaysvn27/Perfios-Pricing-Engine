// Questionnaire-upload -> auto-built proposal (AM flow). Parses a filled
// "Perfios_DPDP_Questionnaire" Excel (the finalized pricing prerequisite
// template — NOT the same file as src/lib/questionnaire.ts, which is a
// different, self-generated per-customer questionnaire with its own machine
// marker). This module never throws on messy human input: every question
// that fails to parse degrades to a safe default plus a warning (surfaced to
// the AM) and, where useful, a note preserving the raw text so nothing typed
// by the customer is silently lost.
//
// Sheet: "Pricing Questionnaire" (case-insensitive), falling back to the
// first sheet whose B3 contains "Pricing Prerequisite Questionnaire".
// Questions sit in column C, answers in column D, 1-indexed rows per the
// finalized template (see the row map in interpretQuestionnaire below).

import * as ExcelJS from 'exceljs'
import type { DeploymentMode } from '../engine2/types'
import type { ProposalInputs } from './proposalsRepo'
import { PREPARED_FOR_ROW, PRICING_SECTIONS, PRICING_SHEET_NAME, RESPONSE_COL, TITLE_ROW } from './questionnaireTemplate'

// ---------------------------------------------------------------------------
// Cell map — derived from questionnaireTemplate.ts (the single source of
// truth shared with questionnaireExport.ts) instead of hardcoded, so the
// generated workbook and this parser's row expectations can never drift.
// ---------------------------------------------------------------------------

const PRICING_QUESTIONS = PRICING_SECTIONS.flatMap((section) => section.questions)

const ROW_BY_QUESTION_NO: Record<number, number> = Object.fromEntries(
  PRICING_QUESTIONS.map((q): [number, number] => [q.no, q.row]),
)

/** Response cell (e.g. "D9") for a question by its number (Q1..Q15), per the
 * template's PRICING_SECTIONS. Throws at module load if the template is ever
 * edited to drop a question this parser still expects — fail loud, not silent. */
function responseCell(no: number): string {
  const row = ROW_BY_QUESTION_NO[no]
  if (row === undefined) throw new Error(`questionnaireTemplate is missing question Q${no}`)
  return `${RESPONSE_COL}${row}`
}

const PREPARED_FOR_CELL = `B${PREPARED_FOR_ROW}`

// ---------------------------------------------------------------------------
// Free-text parsers (pure, exported for unit tests).
// ---------------------------------------------------------------------------

const UNIT_MULTIPLIERS: Record<string, number | undefined> = {
  l: 1e5,
  lac: 1e5,
  lacs: 1e5,
  lakh: 1e5,
  lakhs: 1e5,
  cr: 1e7,
  crs: 1e7,
  crore: 1e7,
  crores: 1e7,
  k: 1e3,
  thousand: 1e3,
  thousands: 1e3,
  m: 1e6,
  mn: 1e6,
  mio: 1e6,
  million: 1e6,
  millions: 1e6,
}

/**
 * Parses Indian-style free-text numbers: plain numbers with commas
 * ("1,00,000" or "2,500,000"), and lakh/crore/million/thousand shorthand
 * ("25 lakh", "2.5M", "0.5 Cr", "50K"). Returns null for unparseable input —
 * never throws.
 */
export function parseIndianNumber(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null
  let raw = String(text).trim()
  if (!raw) return null
  raw = raw
    .replace(/₹/g, '')
    .replace(/\brs\.?\b/gi, '')
    .replace(/\binr\b/gi, '')
    .replace(/~/g, '')
    .replace(/,/g, '')
    .trim()
  const m = raw.match(/(-?\d+(?:\.\d+)?)\s*([a-zA-Z]+)?/)
  if (!m) return null
  const num = Number(m[1])
  if (!Number.isFinite(num)) return null
  const unitRaw = (m[2] ?? '').toLowerCase().replace(/\.$/, '')
  if (!unitRaw) return Math.round(num)
  const mult = UNIT_MULTIPLIERS[unitRaw]
  if (mult === undefined) return Math.round(num)
  return Math.round(num * mult)
}

/** First integer found anywhere in the text (used for "leading count" answers). */
function leadingInteger(text: string): number | null {
  const m = text.match(/(\d[\d,]*)/)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export function parseYesNo(text: string | null | undefined): boolean | null {
  if (text === null || text === undefined) return null
  const s = String(text).trim().toLowerCase()
  if (!s) return null
  if (/^(y|yes|true|1)$/.test(s)) return true
  if (/^(n|no|false|0)$/.test(s)) return false
  return null
}

export function parseDeploymentMode(text: string | null | undefined): DeploymentMode | null {
  if (text === null || text === undefined) return null
  const s = String(text).trim().toLowerCase()
  if (!s) return null
  if (/hybrid/.test(s)) return 'hybrid'
  if (/on[\s-]?prem(ise)?|on premise|self[\s-]?hosted/.test(s)) return 'onprem'
  if (/saas|software as a service|cloud/.test(s)) return 'saas'
  return null
}

export interface DspmDam {
  dspm: boolean | null
  dam: boolean | null
}

/**
 * Handles combined "DSPM in scope? DAM in scope?" answers: explicit
 * per-module mentions ("DSPM: Yes, DAM: No"), slash/comma pairs
 * ("Yes/Yes", "Yes, No"), and a bare answer ("Yes" / "Y" / "No") which
 * applies to both.
 */
export function parseDspmDam(text: string | null | undefined): DspmDam {
  if (text === null || text === undefined) return { dspm: null, dam: null }
  const raw = String(text).trim()
  if (!raw) return { dspm: null, dam: null }
  const s = raw.toLowerCase()

  const dspmMatch = s.match(/dspm[^a-z0-9]{0,5}(yes|no|y|n)\b/)
  const damMatch = s.match(/dam[^a-z0-9]{0,5}(yes|no|y|n)\b/)
  if (dspmMatch || damMatch) {
    return {
      dspm: dspmMatch ? parseYesNo(dspmMatch[1]) : null,
      dam: damMatch ? parseYesNo(damMatch[1]) : null,
    }
  }

  const parts = s
    .split(/[/,]/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    const a = parseYesNo(parts[0])
    const b = parseYesNo(parts[1])
    if (a !== null || b !== null) return { dspm: a, dam: b }
  }

  const bare = parseYesNo(s)
  if (bare !== null) return { dspm: bare, dam: bare }
  return { dspm: null, dam: null }
}

const PROVIDER_PATTERNS: RegExp[] = [
  /\baws\b|amazon\s*(web\s*services)?/i,
  /\bazure\b/i,
  /\bgcp\b|google\s*cloud/i,
  /on[\s-]?prem(ise)?(\s*dc)?|data\s*cent(er|re)/i,
]

/** Count of distinct providers mentioned (AWS / Azure / GCP / on-prem DC). */
function countProviders(text: string): number {
  const s = text.toLowerCase()
  let n = 0
  for (const re of PROVIDER_PATTERNS) if (re.test(s)) n += 1
  return n
}

// ---------------------------------------------------------------------------
// interpretQuestionnaire — pure mapping from a {cellRef: text} map to
// proposal inputs. Never throws.
// ---------------------------------------------------------------------------

export interface QuestionnaireImportResult {
  inputs: Partial<ProposalInputs>
  customer_name: string | null
  /** Free text that doesn't map to a structured field — appended to internal_notes by the caller. */
  notes: string[]
  /** Assumptions/defaults applied because an answer was blank or unparseable — shown to the AM. */
  warnings: string[]
}

function computeDpBaseY2(
  y1: number,
  growthRaw: string,
  warnings: string[],
  notes: string[],
): number {
  const raw = growthRaw.trim()
  if (!raw) return y1
  if (raw.includes('%')) {
    const pct = parseIndianNumber(raw.replace('%', ''))
    if (pct === null) {
      warnings.push(`Q3 expected growth ("${raw}") could not be parsed as a percentage — Year 2 base defaulted to the Year 1 value.`)
      notes.push(`From questionnaire: Q3 expected growth (unparsed): "${raw}"`)
      return y1
    }
    return Math.round(y1 * (1 + pct / 100))
  }
  const abs = parseIndianNumber(raw)
  if (abs === null) {
    warnings.push(`Q3 expected growth ("${raw}") could not be parsed — Year 2 base defaulted to the Year 1 value.`)
    notes.push(`From questionnaire: Q3 expected growth (unparsed): "${raw}"`)
    return y1
  }
  return y1 + abs
}

interface EstateQ {
  key: string
  label: string
  cell: string
  extract: (raw: string) => number | null
}

const ESTATE_QUESTIONS: EstateQ[] = [
  { key: 'database', label: 'Q5 databases to be scanned', cell: responseCell(5), extract: leadingInteger },
  {
    key: 'cloud_connector',
    label: 'Q6 cloud providers holding PII',
    cell: responseCell(6),
    extract: (raw) => {
      const n = countProviders(raw)
      return n > 0 ? n : leadingInteger(raw)
    },
  },
  { key: 'account', label: 'Q7 separate accounts per provider', cell: responseCell(7), extract: parseIndianNumber },
  { key: 'vm', label: 'Q8 virtual machines hosting PII', cell: responseCell(8), extract: parseIndianNumber },
  { key: 'gdrive_user', label: 'Q9 M365 / Google Workspace users', cell: responseCell(9), extract: parseIndianNumber },
  { key: 'endpoint_device', label: 'Q10 endpoint devices', cell: responseCell(10), extract: parseIndianNumber },
]

function extractCustomerName(b4: string | undefined): string | null {
  if (!b4) return null
  const m = b4.match(/prepared\s*for\s*:?\s*(.*?)(?:\s*channel\s*:|\s*date\s*:|$)/i)
  const name = (m ? m[1] : b4).trim()
  return name || null
}

/**
 * Pure interpreter: takes a {cellRef: text} map (e.g. {D9: 'On-Prem', D10: '25 lakh', ...})
 * and returns partial ProposalInputs plus notes/warnings. Never throws — every
 * blank or unparseable answer degrades to a safe default and a warning.
 */
export function interpretQuestionnaire(cells: Record<string, string>): QuestionnaireImportResult {
  const notes: string[] = []
  const warnings: string[] = []
  const inputs: Partial<ProposalInputs> = {}

  const cell = (ref: string): string => (cells[ref] ?? '').trim()

  // Q1 deployment mode (D9)
  const modeRaw = cell(responseCell(1))
  if (modeRaw) {
    const mode = parseDeploymentMode(modeRaw)
    if (mode) {
      inputs.deployment_mode = mode
    } else {
      warnings.push(`Q1 deployment mode ("${modeRaw}") could not be parsed — defaulted to On-Prem.`)
      notes.push(`From questionnaire: Q1 deployment mode (unparsed): "${modeRaw}"`)
    }
  } else {
    warnings.push('Q1 deployment mode was blank — defaulted to On-Prem.')
  }

  // Q2 Year-1 data principal base (D10)
  const y1Raw = cell(responseCell(2))
  let y1: number | null = null
  if (y1Raw) {
    y1 = parseIndianNumber(y1Raw)
    if (y1 !== null) {
      inputs.dp_base_y1 = y1
    } else {
      warnings.push(`Q2 Year-1 data principal base ("${y1Raw}") could not be parsed — defaulted to 0.`)
      notes.push(`From questionnaire: Q2 Year-1 data principal base (unparsed): "${y1Raw}"`)
    }
  } else {
    warnings.push('Q2 Year-1 data principal base was blank — defaulted to 0.')
  }

  // Q3 expected growth from Year 2 (D11) -> dp_base_y2
  if (y1 !== null) {
    inputs.dp_base_y2 = computeDpBaseY2(y1, cell(responseCell(3)), warnings, notes)
  }

  // Q4 core systems to integrate (D12) — note only
  const q4 = cell(responseCell(4))
  if (q4) notes.push(`From questionnaire: Q4 core systems to integrate: "${q4}"`)

  // Q5-Q10 estate quantities
  const estate_quantities: Record<string, number> = {}
  const blankLabels: string[] = []
  for (const q of ESTATE_QUESTIONS) {
    const raw = cell(q.cell)
    if (!raw) {
      blankLabels.push(q.label)
      estate_quantities[q.key] = 0
      continue
    }
    const n = q.extract(raw)
    if (n === null) {
      warnings.push(`${q.label} ("${raw}") could not be parsed — defaulted to 0.`)
      notes.push(`From questionnaire: ${q.label} (unparsed): "${raw}"`)
      estate_quantities[q.key] = 0
    } else {
      estate_quantities[q.key] = Math.max(0, Math.round(n))
    }
  }
  if (blankLabels.length > 0) {
    warnings.push(`Blank in questionnaire — defaulted to 0: ${blankLabels.join(', ')}`)
  }
  inputs.estate_quantities = estate_quantities

  // Q11 DSPM / DAM in scope (D25)
  const q11Raw = cell(responseCell(11))
  const dd = parseDspmDam(q11Raw)
  if (!q11Raw) {
    warnings.push('Q11 DSPM/DAM scope was blank — both defaulted to No.')
  } else {
    if (dd.dspm === null) warnings.push(`Q11 DSPM answer ("${q11Raw}") could not be parsed — defaulted to No.`)
    if (dd.dam === null) warnings.push(`Q11 DAM answer ("${q11Raw}") could not be parsed — defaulted to No.`)
    if (dd.dspm === null || dd.dam === null) {
      notes.push(`From questionnaire: Q11 DSPM/DAM scope (unparsed): "${q11Raw}"`)
    }
  }

  // Q12 Endpoint Discovery / DLP in scope (D26)
  const q12Raw = cell(responseCell(12))
  const ep = q12Raw ? parseYesNo(q12Raw) : null
  if (!q12Raw) {
    warnings.push('Q12 Endpoint Discovery/DLP scope was blank — defaulted to No.')
  } else if (ep === null) {
    warnings.push(`Q12 Endpoint Discovery/DLP answer ("${q12Raw}") could not be parsed — defaulted to No.`)
    notes.push(`From questionnaire: Q12 Endpoint Discovery/DLP (unparsed): "${q12Raw}"`)
  }

  inputs.modules = { dspm: dd.dspm ?? false, dam: dd.dam ?? false, endpoint: ep ?? false }

  // Q13-Q15 — note only
  const q13 = cell(responseCell(13))
  if (q13) notes.push(`From questionnaire: Q13 existing DSPM/lineage tool: "${q13}"`)
  const q14 = cell(responseCell(14))
  if (q14) notes.push(`From questionnaire: Q14 SaaS/multi-tenant sources holding PII: "${q14}"`)
  const q15 = cell(responseCell(15))
  if (q15) notes.push(`From questionnaire: Q15 implementation — Perfios direct or SI partner: "${q15}"`)

  const customer_name = extractCustomerName(cells[PREPARED_FOR_CELL])

  return { inputs, customer_name, notes, warnings }
}

// ---------------------------------------------------------------------------
// exceljs wrapper — locates the sheet, extracts the fixed cell map, delegates
// to interpretQuestionnaire.
// ---------------------------------------------------------------------------

// All response cells the parser reads, plus the prepared-for cell — derived
// from the template rather than hardcoded, so a template edit that adds,
// removes, or moves a question is reflected here automatically.
const CELL_REFS: string[] = [PREPARED_FOR_CELL, ...PRICING_QUESTIONS.map((q) => `${RESPONSE_COL}${q.row}`)]

function cellText(raw: unknown): string {
  const v =
    raw && typeof raw === 'object' && 'result' in (raw as Record<string, unknown>)
      ? (raw as { result?: unknown }).result
      : raw
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v).trim()
}

function findQuestionnaireSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  const byName = wb.worksheets.find((ws) => ws.name.trim().toLowerCase() === PRICING_SHEET_NAME.toLowerCase())
  if (byName) return byName
  return wb.worksheets.find((ws) =>
    /pricing prerequisite questionnaire/i.test(cellText(ws.getCell(`B${TITLE_ROW}`).value)),
  )
}

/** Loads a filled "Perfios_DPDP_Questionnaire" workbook and maps it to proposal inputs. */
export async function importQuestionnaireXlsx(buffer: ArrayBuffer): Promise<QuestionnaireImportResult> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const ws = findQuestionnaireSheet(wb)
  const cells: Record<string, string> = {}
  if (ws) {
    for (const ref of CELL_REFS) {
      const v = cellText(ws.getCell(ref).value)
      if (v) cells[ref] = v
    }
  }

  const result = interpretQuestionnaire(cells)
  if (!ws) {
    result.warnings.unshift(
      'Could not find the "Pricing Questionnaire" sheet in this file — nothing was imported. Please check it is the Perfios_DPDP_Questionnaire template.',
    )
  }
  return result
}

/**
 * Layers parsed questionnaire inputs over the wizard's usual defaults. Not a
 * plain `{ ...defaults, ...partial }` spread on purpose: TypeScript infers
 * overlapping properties of a `Partial<T>` spread as possibly-undefined,
 * which then fails to satisfy `ProposalInputs`'s required fields. Every field
 * interpretQuestionnaire may set is merged explicitly instead, each falling
 * back to the caller's defaults.
 */
export function mergeQuestionnaireInputs(
  defaults: ProposalInputs,
  partial: Partial<ProposalInputs>,
): ProposalInputs {
  return {
    ...defaults,
    deployment_mode: partial.deployment_mode ?? defaults.deployment_mode,
    dp_base_y1: partial.dp_base_y1 ?? defaults.dp_base_y1,
    dp_base_y2: partial.dp_base_y2 ?? defaults.dp_base_y2,
    modules: partial.modules ?? defaults.modules,
    estate_quantities: partial.estate_quantities ?? defaults.estate_quantities,
  }
}
