import type { CmTier, FieldDef, InformationalQuestion, ModuleDef, ModuleFieldTag, Settings } from '../engine'

/** The in-memory draft working set, mirrored from the normalized Supabase tables. */
export interface DraftState {
  fields: FieldDef[]
  modules: ModuleDef[]
  module_fields: ModuleFieldTag[]
  cm_tiers: CmTier[]
  settings: Settings
  informational_questions: InformationalQuestion[]
}

export type EntityType = 'field' | 'module' | 'module_field' | 'cm_tier' | 'settings' | 'informational'

export interface ValidationError {
  code: string
  message: string
  entityType: EntityType
  entityKey: string
}
