import { NavLink } from 'react-router-dom'
import { supabase } from '../utils/supabase.js'

const NAV = [
  { to: '/gap',        label: 'The Gap' },
  { to: '/projection', label: 'Projection' },
  { to: '/impact',     label: 'Impact' },
  { to: '/household',  label: 'Household' },
  { to: '/assumptions',label: 'Assumptions' },
]

export default function Layout({ children, scenarios, activeId, setActiveId, addScenario, duplicateScenario, displayReal, setDisplayReal, snapshots }) {
  const deficitYears = snapshots?.deficitYears || []
  const firstDeficitYear = snapshots?.firstDeficitYear
  const cumulativeDeficit = snapshots?.cumulativeDeficit || 0

  return (
    <div className="h-screen flex flex-col">
      {/* LIQUIDITY EXHAUSTION BANNER — persistent, impossible to miss */}
      {deficitYears.length > 0 && (
        <div className="bg-red-900 border-b-2 border-red-500 px-6 py-3 flex items-center gap-3">
          <span className="text-red-200 text-2xl font-bold leading-none">!</span>
          <div className="flex-1">
            <p className="text-red-100 font-bold text-sm">
              PLAN NOT VIABLE — Liquidity exhausted in {firstDeficitYear}
            </p>
            <p className="text-red-300 text-xs mt-0.5">
              {deficitYears.length} deficit year{deficitYears.length > 1 ? 's' : ''} detected
              {cumulativeDeficit > 0 && ` · $${Math.round(cumulativeDeficit / 1000)}k cumulative shortfall`}.
              {' '}Adjust retirement age, expenses, or asset allocation to close the gap.
            </p>
          </div>
          <NavLink to="/gap" className="text-xs font-semibold text-red-200 bg-red-800 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
            View Gap Analysis
          </NavLink>
        </div>
      )}

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

        {/* Real/nominal toggle */}
        {setDisplayReal && (
          <label className="flex items-center gap-1.5 cursor-pointer mr-2">
            <span className="text-xs text-gray-500">Today's $</span>
            <button
              onClick={() => setDisplayReal(r => !r)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${displayReal ? 'bg-brand-600' : 'bg-gray-700'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${displayReal ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </label>
        )}

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
      <main className="flex-1 min-h-0 overflow-y-auto">
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
