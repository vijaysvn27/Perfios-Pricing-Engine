import type { CmTier, FieldDef, ModuleDef, ModuleFieldTag, Settings } from '../engine'

/** The in-memory draft working set, mirrored from the normalized Supabase tables. */
export interface DraftState {
  fields: FieldDef[]
  modules: ModuleDef[]
  module_fields: ModuleFieldTag[]
  cm_tiers: CmTier[]
  settings: Settings
}

export type EntityType = 'field' | 'module' | 'module_field' | 'cm_tier' | 'settings'

export interface ValidationError {
  code: string
  message: string
  entityType: EntityType
  entityKey: string
}
