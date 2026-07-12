import { useEffect, useState } from 'react'
import AdminApp from './admin/AdminApp'
import ProposalsApp from './am/ProposalsApp'
import Login from './auth/Login'
import PublicCalculator from './components/PublicCalculator'
import { useAuth } from './auth/useAuth'
import { loadInstances } from './lib/config/instancesRepo'

/**
 * Resolves the instance the proposal builder works against: the template
 * instance when readable, else the first instance, else a fixed key so the
 * seed-rate-card / local-storage fallbacks still work for AM accounts whose
 * RLS cannot list instances.
 */
function ProposalsGate() {
  const [instanceId, setInstanceId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadInstances()
      .then((list) => {
        if (cancelled) return
        const inst = list.find((i) => i.is_template) ?? list[0]
        setInstanceId(inst?.id ?? 'default')
      })
      .catch(() => {
        if (!cancelled) setInstanceId('default')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!instanceId) {
    return <div className="p-8 text-slate-500">Loading proposals…</div>
  }
  return <ProposalsApp instanceId={instanceId} />
}

export default function App() {
  const { loading, session, role, user, signOut } = useAuth()
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // No-login instance calculator — prices server-side; never receives the rate card.
  const publicMatch = hash.match(/^#\/c\/([^/?#]+)/)
  if (publicMatch) {
    return <PublicCalculator token={decodeURIComponent(publicMatch[1])} />
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>
  }
  if (!session) {
    return <Login />
  }

  const isAdmin = role === 'admin'
  const onProposals = hash.startsWith('#/proposals')

  return (
    <div>
      <nav className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <span className="font-semibold text-perfios-blue">Perfios Pricing</span>
        {isAdmin && (
          <a
            href="#/"
            className={!onProposals ? 'font-semibold text-perfios-blue' : 'text-slate-500 hover:text-perfios-blue'}
          >
            Admin
          </a>
        )}
        <a
          href="#/proposals"
          className={onProposals ? 'font-semibold text-perfios-blue' : 'text-slate-500 hover:text-perfios-blue'}
        >
          Proposals
        </a>
        <span className="ml-auto text-xs text-slate-400">{user?.email}</span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Sign out
        </button>
      </nav>
      {onProposals ? (
        <ProposalsGate />
      ) : isAdmin ? (
        <AdminApp />
      ) : (
        <div className="mx-auto max-w-2xl p-8 text-slate-600">
          <p>You're signed in, but this account isn't an admin.</p>
          <p className="mt-2">
            Build a client proposal in the{' '}
            <a href="#/proposals" className="font-medium text-perfios-blue underline">
              Proposal Builder
            </a>
            , or open the pricing link shared with you to generate a quote.
          </p>
        </div>
      )}
    </div>
  )
}
