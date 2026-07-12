import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RateCard } from '../lib/engine2/types'
import { loadDraft, saveDraft } from '../lib/rateCard/repo'
import { validateRateCard } from '../lib/rateCard/validate'
import EstateGroup from './rateCard/EstateGroup'
import ExplainerCard from './rateCard/ExplainerCard'
import type { UpdateCard } from './rateCard/helpers'
import OnPremCmGroup from './rateCard/OnPremCmGroup'
import PublishBar from './rateCard/PublishBar'
import SaasCmGroup from './rateCard/SaasCmGroup'
import WorkedExample from './rateCard/WorkedExample'

interface Props {
  instanceId: string
}

const AUTOSAVE_MS = 1000

/**
 * Admin Rate Card page (spec §8): the four Excel-mirroring rate groups, a live
 * worked-example trace rail, validation, publish and version history — one page,
 * numbers only, never logic.
 */
export default function RateCardPage({ instanceId }: Props) {
  const [draft, setDraft] = useState<RateCard | null>(null)
  const [persisted, setPersisted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  // Refs so save callbacks always see the latest draft without re-binding.
  const draftRef = useRef<RateCard | null>(null)
  draftRef.current = draft
  const editSeq = useRef(0)

  const reloadDraft = useCallback(async () => {
    const d = await loadDraft(instanceId)
    editSeq.current += 1 // invalidate any in-flight save's dirty-clear
    setDraft(d.card)
    setPersisted(d.persisted)
    setDirty(false)
  }, [instanceId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadErr(null)
    loadDraft(instanceId)
      .then((d) => {
        if (cancelled) return
        editSeq.current += 1
        setDraft(d.card)
        setPersisted(d.persisted)
        setDirty(false)
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [instanceId])

  const update: UpdateCard = useCallback((fn: (c: RateCard) => RateCard) => {
    editSeq.current += 1
    setDirty(true)
    setDraft((d) => (d ? fn(d) : d))
  }, [])

  /** Persist the current local draft. Throws on real failure (publish path awaits it). */
  const doSave = useCallback(async () => {
    const cardNow = draftRef.current
    if (!cardNow) return
    const seq = editSeq.current
    setSaving(true)
    try {
      const res = await saveDraft(instanceId, cardNow)
      setPersisted(res.persisted)
      if (editSeq.current === seq) setDirty(false)
      setSaveErr(null)
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setSaving(false)
    }
  }, [instanceId])

  // Debounced autosave: edits land in the draft row shortly after typing stops.
  useEffect(() => {
    if (!dirty || !persisted || !draft) return
    const t = setTimeout(() => {
      void doSave().catch(() => undefined) // saveErr already captured
    }, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [draft, dirty, persisted, doSave])

  const errors = useMemo(() => (draft ? validateRateCard(draft) : []), [draft])

  if (loading) {
    return <div className="p-8 text-slate-500">Loading rate card draft…</div>
  }
  if (loadErr || !draft) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Could not load the rate card: {loadErr ?? 'no draft available'}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-6">
        {!persisted && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Rate-card table not found in Supabase — working from the built-in seed; edits are session-only until
            migration 0026 is applied.
          </div>
        )}
        {saveErr && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            Save error: {saveErr}
          </div>
        )}

        <OnPremCmGroup cm={draft.onprem_cm} update={update} />
        <SaasCmGroup saas={draft.saas_cm} fullCard={draft} update={update} />
        <EstateGroup estate={draft.estate} update={update} />
        <ExplainerCard />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <WorkedExample draft={draft} />
        <PublishBar
          instanceId={instanceId}
          errors={errors}
          persisted={persisted}
          dirty={dirty}
          saving={saving}
          onSaveDraft={doSave}
          onDraftReloaded={reloadDraft}
        />
      </aside>
    </div>
  )
}
