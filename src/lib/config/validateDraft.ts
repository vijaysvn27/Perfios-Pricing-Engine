import type { DraftState, ValidationError } from './types'

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Validate a draft config. Returns [] when publishable. Publish is gated on this.
 * The zero-fields exemption is keyed on `pricing_type === 'tier'`, NOT on a
 * hardcoded module_key, so it generalises to any future tier-based module.
 */
export function validateDraft(d: DraftState): ValidationError[] {
  const errs: ValidationError[] = []
  const activeFieldKeys = new Set(d.fields.filter((f) => f.active).map((f) => f.field_key))
  const allFieldKeys = new Set(d.fields.map((f) => f.field_key))

  // Rule 5: integrity — unique non-empty field keys, integer prices >= 0.
  const seenField = new Set<string>()
  for (const f of d.fields) {
    if (!f.field_key) {
      errs.push({ code: 'field_key_empty', message: 'A field has an empty key.', entityType: 'field', entityKey: f.field_key })
    }
    if (seenField.has(f.field_key)) {
      errs.push({ code: 'field_key_dup', message: `Duplicate field key "${f.field_key}".`, entityType: 'field', entityKey: f.field_key })
    }
    seenField.add(f.field_key)
    if (!num(f.unit_price_inr) || f.unit_price_inr < 0 || !Number.isInteger(f.unit_price_inr)) {
      errs.push({ code: 'unit_price_invalid', message: `Unit price for "${f.field_key}" must be an integer >= 0.`, entityType: 'field', entityKey: f.field_key })
    }
  }

  // Rule 1 + 3b: field-priced modules (composite | multiplier) need >= 1 active field;
  // multiplier modules need a numeric multiplier >= 0. `tier` modules are exempt.
  const seenModule = new Set<string>()
  for (const m of d.modules) {
    if (seenModule.has(m.module_key)) {
      errs.push({ code: 'module_key_dup', message: `Duplicate module key "${m.module_key}".`, entityType: 'module', entityKey: m.module_key })
    }
    seenModule.add(m.module_key)
    if (!m.active) continue
    if (m.pricing_type === 'tier') continue

    const tagged = d.module_fields.filter(
      (t) => t.module_key === m.module_key && activeFieldKeys.has(t.field_key),
    )
    if (tagged.length === 0) {
      errs.push({ code: 'module_no_fields', message: `Module "${m.module_key}" has no active fields.`, entityType: 'module', entityKey: m.module_key })
    }
    if (m.pricing_type === 'multiplier' && (!num(m.multiplier) || (m.multiplier as number) < 0)) {
      errs.push({ code: 'multiplier_missing', message: `Module "${m.module_key}" needs a multiplier >= 0.`, entityType: 'module', entityKey: m.module_key })
    }
  }

  // Rule 2: every tag references an existing, active field.
  for (const t of d.module_fields) {
    if (!allFieldKeys.has(t.field_key)) {
      errs.push({ code: 'tag_missing_field', message: `"${t.module_key}" references missing field "${t.field_key}".`, entityType: 'module_field', entityKey: `${t.module_key}:${t.field_key}` })
    } else if (!activeFieldKeys.has(t.field_key)) {
      errs.push({ code: 'tag_inactive_field', message: `"${t.module_key}" references inactive field "${t.field_key}".`, entityType: 'module_field', entityKey: `${t.module_key}:${t.field_key}` })
    }
  }

  // Rule 3a: global percentages numeric and >= 0.
  for (const k of ['deployment_pct', 'amc_pct'] as const) {
    const v = d.settings[k]
    if (!num(v) || v < 0) {
      errs.push({ code: 'pct_negative', message: `Settings ${k} must be a number >= 0.`, entityType: 'settings', entityKey: k })
    }
  }

  // Rule 3c + 4: each CM tier has a numeric amc >= 0 and a license fee >= 0.
  for (const t of d.cm_tiers) {
    if (!num(t.amc_pct) || t.amc_pct < 0) {
      errs.push({ code: 'pct_negative', message: `CM tier "${t.tier_key}" amc % must be >= 0.`, entityType: 'cm_tier', entityKey: t.tier_key })
    }
    if (!num(t.license_fee_inr) || t.license_fee_inr < 0) {
      errs.push({ code: 'cm_tier_no_license', message: `CM tier "${t.tier_key}" needs a license fee >= 0.`, entityType: 'cm_tier', entityKey: t.tier_key })
    }
  }

  // Informational questions (context only): unique non-empty key, has text,
  // select has options. These never affect price.
  const seenInfo = new Set<string>()
  for (const q of d.informational_questions) {
    if (!q.question_key) {
      errs.push({ code: 'info_key_empty', message: 'An informational question has an empty key.', entityType: 'informational', entityKey: q.question_key })
    }
    if (seenInfo.has(q.question_key)) {
      errs.push({ code: 'info_key_dup', message: `Duplicate informational question key "${q.question_key}".`, entityType: 'informational', entityKey: q.question_key })
    }
    seenInfo.add(q.question_key)
    if (!q.question_text || !q.question_text.trim()) {
      errs.push({ code: 'info_text_empty', message: `Informational question "${q.question_key}" needs question text.`, entityType: 'informational', entityKey: q.question_key })
    }
    if (q.answer_type === 'select' && (!q.options || q.options.length === 0)) {
      errs.push({ code: 'info_no_options', message: `Informational question "${q.question_key}" (select) needs at least one option.`, entityType: 'informational', entityKey: q.question_key })
    }
  }

  return errs
}
