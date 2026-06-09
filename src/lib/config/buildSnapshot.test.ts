import { describe, expect, it } from 'vitest'
import { buildSnapshot } from './buildSnapshot'
import { seedSnapshot } from '../engine/__fixtures__/seedSnapshot'
import type { ConfigSnapshot } from '../engine'
import type { DraftState } from './types'

const draftFromSeed = (): DraftState => ({
  fields: seedSnapshot.fields,
  modules: seedSnapshot.modules,
  module_fields: seedSnapshot.module_fields,
  cm_tiers: seedSnapshot.cm_tiers,
  settings: seedSnapshot.settings,
})

// Order-insensitive canonicalisation so parity compares CONTENT, not array order.
function canon(s: ConfigSnapshot) {
  return {
    fields: [...s.fields].sort((a, b) => a.field_key.localeCompare(b.field_key)),
    modules: [...s.modules].sort((a, b) => a.module_key.localeCompare(b.module_key)),
    module_fields: [...s.module_fields].sort((a, b) =>
      `${a.module_key}:${a.field_key}`.localeCompare(`${b.module_key}:${b.field_key}`),
    ),
    cm_tiers: [...s.cm_tiers].sort((a, b) => a.tier_key.localeCompare(b.tier_key)),
    settings: s.settings,
  }
}

describe('buildSnapshot', () => {
  it('reproduces the seed snapshot content from equivalent draft state (parity)', () => {
    expect(canon(buildSnapshot(draftFromSeed()))).toEqual(canon(seedSnapshot))
  })

  it('emits pricing_type on every module', () => {
    for (const m of buildSnapshot(draftFromSeed()).modules) {
      expect(m.pricing_type).toBeTruthy()
    }
  })

  it('is deterministic regardless of input ordering', () => {
    const d = draftFromSeed()
    const shuffled: DraftState = {
      ...d,
      modules: [...d.modules].reverse(),
      fields: [...d.fields].reverse(),
      module_fields: [...d.module_fields].reverse(),
    }
    expect(buildSnapshot(d)).toEqual(buildSnapshot(shuffled))
  })
})
