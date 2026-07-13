import { useCallback, useEffect, useState } from 'react'
import { loadInstances, loadLiveVersions, type InstanceRow } from '../lib/config/instancesRepo'
import InstancesManager from './InstancesManager'
import RateCardPage from './RateCardPage'
import { inp } from './styles'

type Tab = 'ratecard' | 'instances'

const TABS: { id: Tab; label: string }[] = [
  { id: 'ratecard', label: 'Rate Card' },
  { id: 'instances', label: 'Instances' },
]

export default function AdminApp() {
  const [instances, setInstances] = useState<InstanceRow[]>([])
  const [liveVersions, setLiveVersions] = useState<Record<string, number>>({})
  const [instanceId, setInstanceId] = useState<string | null>(null)
  const [instErr, setInstErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('ratecard')

  const reloadInstances = useCallback(async () => {
    try {
      const [list, lv] = await Promise.all([loadInstances(), loadLiveVersions()])
      setInstances(list)
      setLiveVersions(lv)
      setInstanceId((cur) => cur ?? (list.find((i) => i.is_template) ?? list[0])?.id ?? null)
      setInstErr(null)
    } catch (e) {
      setInstErr(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void reloadInstances()
  }, [reloadInstances])

  const templateId = instances.find((i) => i.is_template)?.id ?? null

  if (instErr) {
    return <div className="mx-auto max-w-2xl p-8"><div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Could not load admin: {instErr}</div></div>
  }
  if (instances.length === 0) {
    return <div className="mx-auto max-w-2xl p-8 text-slate-500">Loading…</div>
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-perfios-blue">Admin</h1>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            Editing
            <select className={inp} value={instanceId ?? ''} onChange={(e) => setInstanceId(e.target.value)}>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>{i.name}{i.is_template ? ' (Template)' : ''}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mb-3 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={'px-3 py-2 text-sm ' + (tab === t.id ? 'border-b-2 border-perfios-blue font-semibold text-perfios-blue' : 'text-slate-500')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ratecard' ? (
        instanceId ? (
          <RateCardPage instanceId={instanceId} />
        ) : (
          <div className="p-8 text-slate-500">Loading…</div>
        )
      ) : (
        <InstancesManager
          instances={instances}
          liveVersions={liveVersions}
          templateId={templateId}
          selectedInstanceId={instanceId}
          onSelect={(id) => { setInstanceId(id); setTab('ratecard') }}
          onChanged={() => void reloadInstances()}
        />
      )}
    </div>
  )
}
