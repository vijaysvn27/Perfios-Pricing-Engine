import type { CmModel, Settings } from '../lib/engine'
import { card, inp, toNum } from './styles'

interface Props {
  settings: Settings
  patchSettings: (patch: Partial<Settings>) => void
  commitSettings: () => void
}

export default function SettingsEditor({ settings, patchSettings, commitSettings }: Props) {
  // Commit discrete (toggle/select) changes on the next tick so state is set first.
  const commitSoon = () => setTimeout(commitSettings, 0)

  return (
    <div className={`${card} space-y-4`}>
      <label className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-700">
          Year 2 includes deployment
          <span className="block text-xs text-slate-400">Off = deployment is one-time (the sheet bug-fix).</span>
        </span>
        <input
          type="checkbox"
          checked={settings.y2_includes_deployment}
          onChange={(e) => { patchSettings({ y2_includes_deployment: e.target.checked }); commitSoon() }}
        />
      </label>

      <label className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-700">Consent Manager model</span>
        <select
          className={inp}
          value={settings.cm_model}
          onChange={(e) => { patchSettings({ cm_model: e.target.value as CmModel }); commitSoon() }}
        >
          <option value="perpetual">perpetual</option>
          <option value="subscription">subscription</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-700">Deployment % (composite, applied once to the combined base)</span>
        <input
          type="number" min={0} step={0.01} className={`${inp} w-24 text-right`}
          value={settings.deployment_pct}
          onChange={(e) => patchSettings({ deployment_pct: toNum(e.target.value) })}
          onBlur={commitSettings}
        />
      </label>

      <label className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-700">AMC % (composite, applied to the recurring base)</span>
        <input
          type="number" min={0} step={0.01} className={`${inp} w-24 text-right`}
          value={settings.amc_pct}
          onChange={(e) => patchSettings({ amc_pct: toNum(e.target.value) })}
          onBlur={commitSettings}
        />
      </label>

      <label className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-700">Rounding</span>
        <select
          className={inp}
          value={settings.rounding}
          onChange={(e) => { patchSettings({ rounding: e.target.value }); commitSoon() }}
        >
          <option value="half_up">half_up</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-4">
        <span className="text-sm text-slate-700">Currency</span>
        <input
          className={`${inp} w-24`}
          value={settings.currency}
          onChange={(e) => patchSettings({ currency: e.target.value })}
          onBlur={commitSettings}
        />
      </label>
    </div>
  )
}
