import { NavLink } from 'react-router-dom'
import { supabase } from '../utils/supabase.js'

const NAV = [
  { to: '/gap',        label: 'The Gap' },
  { to: '/projection', label: 'Projection' },
  { to: '/impact',     label: 'Impact' },
  { to: '/household',  label: 'Household' },
  { to: '/assumptions',label: 'Assumptions' },
]

export default function Layout({ children, scenarios, activeId, setActiveId, addScenario, duplicateScenario }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-white text-sm tracking-tight">Aussie Retirement Simulator</span>
          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  isActive
                    ? 'px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-gray-700'
                    : 'px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors'
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Scenario switcher */}
        <div className="flex items-center gap-2">
          <select
            className="input text-sm py-1.5"
            value={activeId}
            onChange={e => setActiveId(e.target.value)}
          >
            {scenarios.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button className="btn-ghost text-sm" onClick={() => addScenario(`Scenario ${scenarios.length + 1}`)}>
            + New
          </button>
          <button className="btn-ghost text-sm" onClick={() => duplicateScenario(activeId)}>
            Duplicate
          </button>
          <button
            className="btn-ghost text-sm"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>

      {/* Mandatory ASIC disclaimer — appears on all views */}
      <footer className="bg-gray-950 border-t border-gray-800 px-6 py-3">
        <p className="text-xs text-gray-600 max-w-4xl">
          This tool is for educational modelling only and does not constitute financial advice.
          Projections are based on assumptions you have entered and may not reflect actual outcomes.
          This tool does not recommend any specific financial product, fund, or investment platform.
          Consult a licensed financial adviser before making any financial decisions.
        </p>
      </footer>
    </div>
  )
}
