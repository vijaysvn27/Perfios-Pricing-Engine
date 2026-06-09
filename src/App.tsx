import { useEffect, useState } from 'react'
import Calculator from './components/Calculator'
import AdminApp from './admin/AdminApp'

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const isAdmin = hash.startsWith('#/admin')

  return (
    <div>
      <nav className="flex gap-4 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <a href="#/" className={isAdmin ? 'text-slate-500' : 'font-semibold text-perfios-blue'}>Calculator</a>
        <a href="#/admin" className={isAdmin ? 'font-semibold text-perfios-blue' : 'text-slate-500'}>Admin</a>
      </nav>
      {isAdmin ? <AdminApp /> : <Calculator />}
    </div>
  )
}
