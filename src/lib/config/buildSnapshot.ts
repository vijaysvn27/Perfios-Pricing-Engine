import type { ConfigSnapshot } from '../engine'
import type { DraftState } from './types'

/**
 * Assemble a deterministic ConfigSnapshot from draft state. Used for BOTH the
 * live preview AND Publish, so what the admin previews is exactly what is
 * published — there is no second (SQL) builder to drift out of sync.
 *
 * Ordering is normalized so equal drafts always produce byte-identical snapshots.
 */
export function buildSnapshot(draft: DraftState): ConfigSnapshot {
  const fields = [...draft.fields].sort(
    (a, b) => a.sort_order - b.sort_order || a.field_key.localeCompare(b.field_key),
  )
  const modules = [...draft.modules].sort((a, b) => a.module_key.localeCompare(b.module_key))

  const fieldOrder = new Map(fields.map((f, i) => [f.field_key, i]))
  const module_fields = [...draft.module_fields].sort(
    (a, b) =>
      a.module_key.localeCompare(b.module_key) ||
      (fieldOrder.get(a.field_key) ?? 0) - (fieldOrder.get(b.field_key) ?? 0),
  )

  const cm_tiers = [...draft.cm_tiers].sort((a, b) => a.license_fee_inr - b.license_fee_inr)

  const informational_questions = [...draft.informational_questions].sort(
    (a, b) => a.section_sort - b.section_sort || a.item_sort - b.item_sort || a.question_key.localeCompare(b.question_key),
  )

  return { fields, modules, module_fields, cm_tiers, settings: draft.settings, informational_questions }
}
