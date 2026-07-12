// Step 2 — Scope: deployment mode (or compare-all-three), DP base Year 1 /
// Year 2, module toggles (disabled on SaaS: CM-only), and estate quantities.
// Question wording mirrors the finalized DPDP Pricing Questionnaire style:
// short question + one-line "why we ask" hint. Estate rows come from the
// LOADED rate card (keys/labels from estate.rates), never hardcoded.
import type { DeploymentMode, RateCard } from '../../lib/engine2/types'
import type { ProposalDraft, ProposalInputs } from '../../lib/proposal/proposalsRepo'
import { card, inp, toNum } from '../../admin/styles'
import {
  DP_BASE_Y1_QUESTION,
  DP_BASE_Y2_QUESTION,
  MODE_LABELS,
  SAAS_MODULE_NOTE,
  estateQuestion,
  visibleEstateRates,
  type ModuleFlags,
} from '../wizardLogic'

interface Props {
  draft: ProposalDraft
  rateCard: RateCard
  updateInputs: (patch: Partial<ProposalInputs>) => void
}

const MODES: DeploymentMode[] = ['onprem', 'hybrid', 'saas']

const MODULE_META: { key: keyof ModuleFlags; label: string; hint: string }[] = [
  { key: 'dspm', label: 'DSPM', hint: 'Data security posture across databases, cloud and file stores.' },
  { key: 'dam', label: 'DAM', hint: 'Database activity monitoring on structured datasets.' },
  { key: 'endpoint', label: 'Endpoint', hint: 'Endpoint discovery / DLP on laptops and desktops.' },
]

function indianCountHint(n: number): string {
  return n > 0 ? `= ${n.toLocaleString('en-IN')} data principals` : 'Enter a count — Indian grouping shown here.'
}

export default function Step2Scope({ draft, rateCard, updateInputs }: Props) {
  const { inputs } = draft
  const isSaas = inputs.deployment_mode === 'saas'
  const estateRates = visibleEstateRates(rateCard.estate.rates, inputs.deployment_mode, inputs.modules)

  function setQty(rateKey: string, value: string) {
    const n = Math.max(0, Math.trunc(toNum(value)))
    updateInputs({ estate_quantities: { ...inputs.estate_quantities, [rateKey]: n } })
  }

  function toggleModule(key: keyof ModuleFlags) {
    updateInputs({ modules: { ...inputs.modules, [key]: !inputs.modules[key] } })
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <span className="text-sm font-medium text-slate-700">Deployment mode</span>
        <p className="text-xs text-slate-400">Where the platform runs — this changes the whole pricing shape.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MODES.map((m) => (
            <label
              key={m}
              className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition ${
                inputs.deployment_mode === m
                  ? 'border-perfios-blue bg-perfios-blue text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-perfios-blue'
              }`}
            >
              <input
                type="radio"
                name="deployment_mode"
                className="sr-only"
                checked={inputs.deployment_mode === m}
                onChange={() => updateInputs({ deployment_mode: m })}
              />
              {MODE_LABELS[m]}
            </label>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={inputs.compare_all_modes}
            onChange={(e) => updateInputs({ compare_all_modes: e.target.checked })}
          />
          Compare all three
          <span className="text-xs text-slate-400">— price On-Prem, Hybrid and SaaS side by side.</span>
        </label>
      </div>

      <div className={`${card} space-y-4`}>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">{DP_BASE_Y1_QUESTION.question}</span>
          <p className="text-xs text-slate-400">{DP_BASE_Y1_QUESTION.why}</p>
          <input
            type="number"
            min={0}
            step={1}
            value={inputs.dp_base_y1}
            onChange={(e) => updateInputs({ dp_base_y1: Math.max(0, Math.trunc(toNum(e.target.value))) })}
            className={`mt-1 w-44 text-right ${inp}`}
          />
          <span className="ml-2 text-xs text-slate-400">{indianCountHint(inputs.dp_base_y1)}</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">{DP_BASE_Y2_QUESTION.question}</span>
          <p className="text-xs text-slate-400">{DP_BASE_Y2_QUESTION.why}</p>
          <input
            type="number"
            min={0}
            step={1}
            value={inputs.dp_base_y2}
            onChange={(e) => updateInputs({ dp_base_y2: Math.max(0, Math.trunc(toNum(e.target.value))) })}
            className={`mt-1 w-44 text-right ${inp}`}
          />
          <span className="ml-2 text-xs text-slate-400">{indianCountHint(inputs.dp_base_y2)}</span>
        </label>
      </div>

      <div className={card}>
        <span className="text-sm font-medium text-slate-700">Which add-on modules are in scope?</span>
        <p className="text-xs text-slate-400">Consent Manager is always included; these extend coverage.</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MODULE_META.map((m) => {
            const on = inputs.modules[m.key] && !isSaas
            return (
              <button
                key={m.key}
                type="button"
                disabled={isSaas}
                onClick={() => toggleModule(m.key)}
                className={`rounded-lg border px-4 py-3 text-left transition ${
                  on
                    ? 'border-perfios-blue bg-perfios-blue text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-perfios-blue'
                } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200`}
              >
                <span className="text-sm font-medium">{m.label}</span>
                <span className={`mt-0.5 block text-xs ${on ? 'text-white/80' : 'text-slate-400'}`}>
                  {isSaas ? SAAS_MODULE_NOTE : m.hint}
                </span>
              </button>
            )
          })}
        </div>
        {isSaas && <p className="mt-2 text-xs text-amber-600">{SAAS_MODULE_NOTE}.</p>}
      </div>

      {estateRates.length > 0 && (
        <div className={card}>
          <span className="text-sm font-medium text-slate-700">Estate sizing</span>
          <p className="mb-2 text-xs text-slate-400">
            Ballpark counts are fine — these size the selected modules.
          </p>
          <div className="divide-y divide-slate-100">
            {estateRates.map((rate) => {
              const q = estateQuestion(rate)
              return (
                <div key={rate.rate_key} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-700">
                      {q.question}
                      {rate.provisional && (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                          provisional rate
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {q.why} <span className="text-slate-300">·</span> {rate.label}, {rate.unit}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={inputs.estate_quantities[rate.rate_key] ?? 0}
                    onChange={(e) => setQty(rate.rate_key, e.target.value)}
                    className={`w-28 shrink-0 text-right ${inp}`}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
