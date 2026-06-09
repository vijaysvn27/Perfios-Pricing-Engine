import { useEffect, useState } from 'react'
import Calculator from './components/Calculator'
import AdminApp from './admin/AdminApp'
import Login from './auth/Login'
import { useAuth } from './auth/useAuth'

export default function App() {
  const { loading, session, role, user, signOut } = useAuth()
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const isAdmin = role === 'admin'
  const wantsAdmin = hash.startsWith('#/admin')

  // Bounce a non-admin away from the admin route.
  useEffect(() => {
    if (session && role && !isAdmin && wantsAdmin) {
      window.location.hash = '#/'
    }
  }, [session, role, isAdmin, wantsAdmin])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>
  }
  if (!session) {
    return <Login />
  }

  const showAdmin = wantsAdmin && isAdmin

  return (
    <div>
      <nav className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <a href="#/" className={showAdmin ? 'text-slate-500' : 'font-semibold text-perfios-blue'}>Calculator</a>
        {isAdmin && (
          <a href="#/admin" className={showAdmin ? 'font-semibold text-perfios-blue' : 'text-slate-500'}>Admin</a>
        )}
        <span className="ml-auto text-xs text-slate-400">{user?.email}</span>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Sign out
        </button>
      </nav>
      {showAdmin ? <AdminApp /> : <Calculator />}
    </div>
  )
}
