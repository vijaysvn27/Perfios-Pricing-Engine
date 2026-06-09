import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from './useAuth'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await signIn(email.trim(), password)
    if (error) setError(error)
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-perfios-blue">Perfios Pricing</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">Sign in to continue.</p>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-slate-600">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-perfios-blue focus:outline-none"
          />
        </label>

        <label className="mb-5 block text-sm">
          <span className="mb-1 block text-slate-600">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-perfios-blue focus:outline-none"
          />
        </label>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-perfios-blue px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Accounts are provisioned by your administrator.
        </p>
      </form>
    </div>
  )
}
