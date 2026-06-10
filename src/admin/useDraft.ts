import { useCallback, useEffect, useRef, useState } from 'react'
import type { CmTier, FieldDef, InformationalQuestion, ModuleDef, Settings } from '../lib/engine'
import type { DraftState } from '../lib/config/types'
import {
  deleteInformationalQuestion,
  loadDraft,
  saveSettings,
  setFieldTag,
  upsertField,
  upsertInformationalQuestion,
  upsertModule,
  upsertTier,
} from '../lib/config/draftRepo'
import { resetDraftToLive } from '../lib/config/versions'

/**
 * Holds one instance's draft working set. Local patches are applied immediately
 * (so preview and validation are instant); persistence happens on blur / discrete
 * change via the commit* helpers — never on every keystroke. All writes are scoped
 * to `instanceId`.
 */
export function useDraft(instanceId: string | null) {
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [opError, setOpError] = useState<string | null>(null)

  const draftRef = useRef<DraftState | null>(null)
  draftRef.current = draft

  const reload = useCallback(async () => {
    if (!instanceId) {
      setDraft(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setDraft(await loadDraft(instanceId))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [instanceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn()
      setOpError(null)
    } catch (e) {
      setOpError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // ---- local patches (instant, no DB write) ----
  const patchField = useCallback((key: string, patch: Partial<FieldDef>) => {
    setDraft((d) => (d ? { ...d, fields: d.fields.map((f) => (f.field_key === key ? { ...f, ...patch } : f)) } : d))
  }, [])
  const patchModule = useCallback((key: string, patch: Partial<ModuleDef>) => {
    setDraft((d) => (d ? { ...d, modules: d.modules.map((m) => (m.module_key === key ? { ...m, ...patch } : m)) } : d))
  }, [])
  const patchTier = useCallback((key: string, patch: Partial<CmTier>) => {
    setDraft((d) => (d ? { ...d, cm_tiers: d.cm_tiers.map((t) => (t.tier_key === key ? { ...t, ...patch } : t)) } : d))
  }, [])
  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setDraft((d) => (d ? { ...d, settings: { ...d.settings, ...patch } } : d))
  }, [])

  // ---- commits (persist current local value) ----
  const commitField = useCallback((key: string) => {
    const f = draftRef.current?.fields.find((x) => x.field_key === key)
    if (f && instanceId) void run(() => upsertField(instanceId, f))
  }, [run, instanceId])
  const commitModule = useCallback((key: string) => {
    const m = draftRef.current?.modules.find((x) => x.module_key === key)
    if (m && instanceId) void run(() => upsertModule(instanceId, m))
  }, [run, instanceId])
  const commitTier = useCallback((key: string) => {
    const t = draftRef.current?.cm_tiers.find((x) => x.tier_key === key)
    if (t && instanceId) void run(() => upsertTier(instanceId, t))
  }, [run, instanceId])
  const commitSettings = useCallback(() => {
    const s = draftRef.current?.settings
    if (s && instanceId) void run(() => saveSettings(instanceId, s))
  }, [run, instanceId])

  // ---- discrete actions (persist immediately) ----
  const addField = useCallback((f: FieldDef) => {
    setDraft((d) => (d ? { ...d, fields: [...d.fields, f] } : d))
    if (instanceId) void run(() => upsertField(instanceId, f))
  }, [run, instanceId])
  const addTier = useCallback((t: CmTier) => {
    setDraft((d) => (d ? { ...d, cm_tiers: [...d.cm_tiers, t] } : d))
    if (instanceId) void run(() => upsertTier(instanceId, t))
  }, [run, instanceId])
  const toggleTag = useCallback((moduleKey: string, fieldKey: string, on: boolean) => {
    setDraft((d) => {
      if (!d) return d
      const exists = d.module_fields.some((t) => t.module_key === moduleKey && t.field_key === fieldKey)
      const module_fields = on
        ? exists ? d.module_fields : [...d.module_fields, { module_key: moduleKey, field_key: fieldKey }]
        : d.module_fields.filter((t) => !(t.module_key === moduleKey && t.field_key === fieldKey))
      return { ...d, module_fields }
    })
    if (instanceId) void run(() => setFieldTag(instanceId, moduleKey, fieldKey, on))
  }, [run, instanceId])

  // ---- informational questions ----
  const patchInfo = useCallback((key: string, patch: Partial<InformationalQuestion>) => {
    setDraft((d) => (d ? { ...d, informational_questions: d.informational_questions.map((q) => (q.question_key === key ? { ...q, ...patch } : q)) } : d))
  }, [])
  const commitInfo = useCallback((key: string) => {
    const q = draftRef.current?.informational_questions.find((x) => x.question_key === key)
    if (q && instanceId) void run(() => upsertInformationalQuestion(instanceId, q))
  }, [run, instanceId])
  const addInfo = useCallback((q: InformationalQuestion) => {
    setDraft((d) => (d ? { ...d, informational_questions: [...d.informational_questions, q] } : d))
    if (instanceId) void run(() => upsertInformationalQuestion(instanceId, q))
  }, [run, instanceId])
  const deleteInfo = useCallback((key: string) => {
    setDraft((d) => (d ? { ...d, informational_questions: d.informational_questions.filter((x) => x.question_key !== key) } : d))
    if (instanceId) void run(() => deleteInformationalQuestion(instanceId, key))
  }, [run, instanceId])

  const reset = useCallback(async () => {
    if (!instanceId) return
    await run(() => resetDraftToLive(instanceId))
    await reload()
  }, [run, reload, instanceId])

  return {
    draft,
    loading,
    error,
    opError,
    reload,
    patchField,
    patchModule,
    patchTier,
    patchSettings,
    commitField,
    commitModule,
    commitTier,
    commitSettings,
    addField,
    addTier,
    toggleTag,
    patchInfo,
    commitInfo,
    addInfo,
    deleteInfo,
    reset,
  }
}
