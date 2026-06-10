import { useEffect, useState } from 'react'
import AdminApp from './admin/AdminApp'
import Login from './auth/Login'
import PublicCalculator from './components/PublicCalculator'
import { useAuth } from './auth/useAuth'

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

  return (
    <div>
      <nav className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <span className="font-semibold text-perfios-blue">Perfios Pricing</span>
        <span className="ml-auto text-xs text-slate-400">{user?.email}</span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Sign out
        </button>
      </nav>
      {isAdmin ? (
        <AdminApp />
      ) : (
        <div className="mx-auto max-w-2xl p-8 text-slate-600">
          You're signed in, but this account isn't an admin. Open the pricing link shared with you to
          generate a quote.
        </div>
      )}
    </div>
  )
}
