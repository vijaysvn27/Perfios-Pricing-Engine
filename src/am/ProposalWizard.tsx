// AM Proposal Wizard (§7 of the revamp design): four steps — Deal, Scope,
// Commercials, Present & Export — with a persistent live price panel that
// recomputes on every input change against the loaded published rate card.
import { useEffect, useMemo, useState } from 'react'
import { price } from '../lib/engine2/engine2'
import { loadPublishedRateCard, type PublishedRateCard } from '../lib/rateCard/repo'
import {
  newProposalId,
  saveProposal,
  type ProposalDraft,
  type ProposalInputs,
  type ProposalRow,
} from '../lib/proposal/proposalsRepo'
import { btn, card } from '../admin/styles'
import PricePanel from './PricePanel'
import Step1Deal from './steps/Step1Deal'
import Step2Scope from './steps/Step2Scope'
import Step3Commercials from './steps/Step3Commercials'
import Step4Present from './steps/Step4Present'
import { defaultInputs, emptyTotals, totalsFromResult } from './wizardLogic'

interface Props {
  instanceId: string
  /** Existing proposal to edit, or null for a fresh one. */
  initial: ProposalRow | null
  onBack: () => void
  /** Called after every successful save so the list can refresh. */
  onSaved: (persisted: boolean) => void
  /** Step to open on (0-3), e.g. 1 = Scope after a questionnaire import. */
  initialStep?: number
}

const STEPS = ['Deal', 'Scope', 'Commercials', 'Present & Export'] as const

function newDraft(instanceId: string): ProposalDraft {
  return {
    id: newProposalId(),
    instance_id: instanceId,
    customer_name: '',
    channel: 'direct',
    internal_notes: '',
    validity_days: 60,
    inputs: defaultInputs(60),
    rate_card_version: 0,
    totals: emptyTotals(),
    discount_shown: true,
  }
}

/** Rows saved before a schema addition may miss the newer input fields —
 * layer them over the defaults so the wizard always has a complete shape. */
function draftFromRow(row: ProposalRow): ProposalDraft {
  return {
    id: row.id,
    instance_id: row.instance_id,
    customer_name: row.customer_name,
    channel: row.channel,
    internal_notes: row.internal_notes,
    validity_days: row.validity_days,
    inputs: { ...defaultInputs(row.validity_days), ...row.inputs },
    rate_card_version: row.rate_card_version,
    totals: row.totals,
    discount_shown: row.discount_shown,
  }
}

export default function ProposalWizard({ instanceId, initial, onBack, onSaved, initialStep }: Props) {
  const [rc, setRc] = useState<PublishedRateCard | null>(null)
  const [rcError, setRcError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProposalDraft>(() =>
    initial ? draftFromRow(initial) : newDraft(instanceId),
  )
  const [step, setStep] = useState(() => Math.min(Math.max(initialStep ?? 0, 0), STEPS.length - 1))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [savedTick, setSavedTick] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadPublishedRateCard(instanceId)
      .then((loaded) => {
        if (!cancelled) setRc(loaded)
      })
      .catch((e: unknown) => {
        if (!cancelled) setRcError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [instanceId])

  const update = useMemo(
    () => (patch: Partial<ProposalDraft>) => setDraft((d) => ({ ...d, ...patch })),
    [],
  )
  const updateInputs = useMemo(
    () => (patch: Partial<ProposalInputs>) => setDraft((d) => ({ ...d, inputs: { ...d.inputs, ...patch } })),
    [],
  )

  /** Throwing variant — Step 4 uses it so exports abort when saving fails. */
  async function handleSave(): Promise<void> {
    if (!rc) return
    setSaving(true)
    setSaveError(null)
    try {
      // Totals snapshot follows the selected mode (compare keeps all three in
      // the render; the summary row in the list shows the primary choice).
      const priced = price(rc.card, draft.inputs)
      const toSave: ProposalDraft = {
        ...draft,
        totals: totalsFromResult(priced),
        rate_card_version: rc.version,
      }
      const res = await saveProposal(toSave)
      setDraft((d) => ({ ...d, totals: toSave.totals, rate_card_version: rc.version }))
      setPersisted(res.persisted)
      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 1500)
      onSaved(res.persisted)
    } finally {
      setSaving(false)
    }
  }

  /** Non-throwing variant for the footer Save button. */
  async function saveSafely(): Promise<void> {
    try {
      await handleSave()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  if (rcError) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Could not load the rate card: {rcError}
        </div>
      </div>
    )
  }
  if (!rc) {
    return <div className="p-8 text-sm text-slate-500">Loading rate card…</div>
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          ← Proposals
        </button>
        <h1 className="text-lg font-semibold text-perfios-blue">
          {draft.customer_name.trim() || 'New proposal'}
        </h1>
        {savedTick && <span className="text-xs text-perfios-green">Saved ✓</span>}
      </div>

      {persisted === false && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Proposals table not migrated — saved locally in this browser only.
        </div>
      )}
      {saveError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Save failed: {saveError}
        </div>
      )}

      <ol className="mb-4 flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(i)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                i === step
                  ? 'bg-perfios-blue text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-perfios-blue'
              }`}
            >
              {i + 1}. {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
        <div>
          {step === 0 && <Step1Deal draft={draft} update={update} />}
          {step === 1 && <Step2Scope draft={draft} rateCard={rc.card} updateInputs={updateInputs} />}
          {step === 2 && <Step3Commercials draft={draft} update={update} updateInputs={updateInputs} />}
          {step === 3 && (
            <Step4Present draft={draft} rateCard={rc.card} updateInputs={updateInputs} onSave={handleSave} saving={saving} />
          )}

          <div className={`mt-4 flex items-center justify-between ${card}`}>
            <button
              type="button"
              className={btn}
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </button>
            <button type="button" className={btn} disabled={saving} onClick={() => void saveSafely()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className={btn}
              disabled={step === STEPS.length - 1}
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            >
              Next
            </button>
          </div>
        </div>

        <PricePanel card={rc.card} version={rc.version} source={rc.source} inputs={draft.inputs} />
      </div>
    </div>
  )
}
