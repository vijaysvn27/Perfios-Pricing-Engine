import { useEffect, useMemo, useState } from 'react'
import { buildSnapshot } from '../lib/config/buildSnapshot'
import { validateDraft } from '../lib/config/validateDraft'
import { loadInstances, type InstanceRow } from '../lib/config/instancesRepo'
import { useDraft } from './useDraft'
import FieldsEditor from './FieldsEditor'
import ModulesEditor from './ModulesEditor'
import CmTiersEditor from './CmTiersEditor'
import SettingsEditor from './SettingsEditor'
import VersionHistory from './VersionHistory'
import PreviewPanel from './PreviewPanel'
import ValidationPanel from './ValidationPanel'
import { btn, card } from './styles'

type Tab = 'fields' | 'modules' | 'cm' | 'settings' | 'versions'

const TABS: { id: Tab; label: string }[] = [
  { id: 'fields', label: 'Fields' },
  { id: 'modules', label: 'Modules' },
  { id: 'cm', label: 'CM Tiers' },
  { id: 'settings', label: 'Settings' },
  { id: 'versions', label: 'Versions' },
]

export default function AdminApp() {
  const [instances, setInstances] = useState<InstanceRow[]>([])
  const [instanceId, setInstanceId] = useState<string | null>(null)
  const [instErr, setInstErr] = useState<string | null>(null)

  useEffect(() => {
    loadInstances()
      .then((list) => {
        setInstances(list)
        // Default to the Template instance (selector to switch arrives in Step 4).
        const tmpl = list.find((i) => i.is_template) ?? list[0]
        setInstanceId(tmpl?.id ?? null)
      })
      .catch((e: unknown) => setInstErr(e instanceof Error ? e.message : String(e)))
  }, [])

  const d = useDraft(instanceId)
  const [tab, setTab] = useState<Tab>('fields')
  const [refreshKey, setRefreshKey] = useState(0)

  const snapshot = useMemo(() => (d.draft ? buildSnapshot(d.draft) : null), [d.draft])
  const errors = useMemo(() => (d.draft ? validateDraft(d.draft) : []), [d.draft])

  const currentInstance = instances.find((i) => i.id === instanceId)

  if (instErr || d.error) {
    return <div className="mx-auto max-w-2xl p-8"><div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Could not load admin: {instErr ?? d.error}</div></div>
  }
  if (!instanceId || d.loading || !d.draft || !snapshot) {
    return <div className="mx-auto max-w-2xl p-8 text-slate-500">Loading…</div>
  }

  async function onResetDraft() {
    if (!window.confirm('Discard all draft edits and reset to the current live version?')) return
    await d.reset()
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-perfios-blue">
          Admin — {currentInstance?.name ?? 'pricing configuration'}
          {currentInstance?.is_template && <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">Template</span>}
        </h1>
        <button type="button" className={btn} onClick={onResetDraft}>Reset draft to live</button>
      </div>

      {d.opError && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">Save error: {d.opError}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
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
            {tab === 'settings' && (
              <SettingsEditor settings={d.draft.settings} patchSettings={d.patchSettings} commitSettings={d.commitSettings} />
            )}
            {tab === 'versions' && (
              <VersionHistory instanceId={instanceId} refreshKey={refreshKey} onRolledBack={() => { void d.reload(); setRefreshKey((k) => k + 1) }} />
            )}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <PreviewPanel snapshot={snapshot} />
          <ValidationPanel instanceId={instanceId} snapshot={snapshot} errors={errors} onPublished={() => setRefreshKey((k) => k + 1)} />
        </aside>
      </div>
    </div>
  )
}
