import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildSnapshot } from '../lib/config/buildSnapshot'
import { validateDraft } from '../lib/config/validateDraft'
import { loadInstances, loadLiveVersions, type InstanceRow } from '../lib/config/instancesRepo'
import { useDraft } from './useDraft'
import FieldsEditor from './FieldsEditor'
import ModulesEditor from './ModulesEditor'
import CmTiersEditor from './CmTiersEditor'
import QuestionsEditor from './QuestionsEditor'
import SettingsEditor from './SettingsEditor'
import VersionHistory from './VersionHistory'
import PreviewPanel from './PreviewPanel'
import ValidationPanel from './ValidationPanel'
import InstancesManager from './InstancesManager'
import { btn, card, inp } from './styles'

type Tab = 'instances' | 'fields' | 'modules' | 'cm' | 'questions' | 'settings' | 'versions'

const TABS: { id: Tab; label: string }[] = [
  { id: 'instances', label: 'Instances' },
  { id: 'fields', label: 'Fields' },
  { id: 'modules', label: 'Modules' },
  { id: 'cm', label: 'CM Tiers' },
  { id: 'questions', label: 'Questions' },
  { id: 'settings', label: 'Settings' },
  { id: 'versions', label: 'Versions' },
]

export default function AdminApp() {
  const [instances, setInstances] = useState<InstanceRow[]>([])
  const [liveVersions, setLiveVersions] = useState<Record<string, number>>({})
  const [instanceId, setInstanceId] = useState<string | null>(null)
  const [instErr, setInstErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('instances')
  const [refreshKey, setRefreshKey] = useState(0)

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

  const d = useDraft(instanceId)
  const snapshot = useMemo(() => (d.draft ? buildSnapshot(d.draft) : null), [d.draft])
  const errors = useMemo(() => (d.draft ? validateDraft(d.draft) : []), [d.draft])

  const templateId = instances.find((i) => i.is_template)?.id ?? null
  const currentInstance = instances.find((i) => i.id === instanceId)

  if (instErr) {
    return <div className="mx-auto max-w-2xl p-8"><div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Could not load admin: {instErr}</div></div>
  }
  if (instances.length === 0) {
    return <div className="mx-auto max-w-2xl p-8 text-slate-500">Loading…</div>
  }

  async function onResetDraft() {
    if (!window.confirm('Discard all draft edits and reset to the current live version?')) return
    await d.reset()
    setRefreshKey((k) => k + 1)
  }

  const afterPublishOrRollback = () => {
    setRefreshKey((k) => k + 1)
    void reloadInstances()
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
        {tab !== 'instances' && <button type="button" className={btn} onClick={onResetDraft}>Reset draft to live</button>}
      </div>

      {d.opError && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">Save error: {d.opError}</div>}

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

      {tab === 'instances' ? (
        <InstancesManager
          instances={instances}
          liveVersions={liveVersions}
          templateId={templateId}
          selectedInstanceId={instanceId}
          onSelect={(id) => { setInstanceId(id); setTab('fields') }}
          onChanged={() => void reloadInstances()}
        />
      ) : d.loading || !d.draft || !snapshot || !instanceId ? (
        <div className="p-8 text-slate-500">Loading {currentInstance?.name ?? 'instance'} draft…</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
          <div className={card}>
            {tab === 'fields' && (
              <FieldsEditor fields={d.draft.fields} patchField={d.patchField} commitField={d.commitField} addField={d.addField} />
            )}
            {tab === 'modules' && (
              <ModulesEditor modules={d.draft.modules} fields={d.draft.fields} module_fields={d.draft.module_fields} patchModule={d.patchModule} commitModule={d.commitModule} toggleTag={d.toggleTag} />
            )}
            {tab === 'cm' && (
              <CmTiersEditor cm_tiers={d.draft.cm_tiers} patchTier={d.patchTier} commitTier={d.commitTier} addTier={d.addTier} />
            )}
            {tab === 'questions' && (
              <QuestionsEditor
                fields={d.draft.fields}
                informational={d.draft.informational_questions}
                patchField={d.patchField}
                commitField={d.commitField}
                patchInfo={d.patchInfo}
                commitInfo={d.commitInfo}
                addInfo={d.addInfo}
                deleteInfo={d.deleteInfo}
                reorderQuestions={d.reorderQuestions}
              />
            )}
            {tab === 'settings' && (
              <SettingsEditor settings={d.draft.settings} patchSettings={d.patchSettings} commitSettings={d.commitSettings} />
            )}
            {tab === 'versions' && (
              <VersionHistory instanceId={instanceId} refreshKey={refreshKey} onRolledBack={() => { void d.reload(); afterPublishOrRollback() }} />
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <PreviewPanel snapshot={snapshot} />
            <ValidationPanel instanceId={instanceId} snapshot={snapshot} errors={errors} onPublished={afterPublishOrRollback} />
          </aside>
        </div>
      )}
    </div>
  )
}
