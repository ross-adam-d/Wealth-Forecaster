import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { supabase } from '../utils/supabase.js'
import ScenarioCards from './ScenarioCards.jsx'
import { Tutorial, useTutorial } from './Tutorial.jsx'

const WELCOME_STEPS = [
  {
    title: 'Welcome to Aussie Retirement Simulator',
    body: 'This tool projects your financial future from today through retirement and beyond. It models super, shares, property, investment bonds, expenses, tax, and age pension — all in one place.',
  },
  {
    title: 'Start with Assumptions',
    body: 'Head to the Assumptions page first — it controls the rates and thresholds that drive every projection. The defaults are sensible, but review them to make sure they match your expectations.',
  },
  {
    title: 'Then fill in your Household',
    body: 'Next, go to Household to enter your personal details, salary, super balances, property, shares, and expenses. The more accurate your inputs, the more useful the projections.',
  },
  {
    title: 'Explore the tools',
    body: 'Once your data is in, explore The Gap (pre-super runway), Projection (full timeline), Impact (what-if sliders), Compare (side-by-side scenarios), and Goal (target retirement age planner). Each page has a "?" button for a quick guide.',
  },
]

const NAV = [
  { to: '/gap',        label: 'The Gap' },
  { to: '/projection', label: 'Projection' },
  { to: '/impact',     label: 'Impact' },
  { to: '/compare',    label: 'Compare' },
  { to: '/goal',       label: 'Goal' },
  { to: '/household',  label: 'Household' },
  { to: '/assumptions',label: 'Assumptions' },
]

export default function Layout({ children, scenarios, activeId, setActiveId, addScenario, duplicateScenario, deleteScenario, renameScenario, displayReal, setDisplayReal, snapshots }) {
  const deficitYears = snapshots?.deficitYears || []
  const firstDeficitYear = snapshots?.firstDeficitYear
  const cumulativeDeficit = snapshots?.cumulativeDeficit || 0

  const [showWelcome, , closeWelcome] = useTutorial('welcomeTutorialSeen')

  // Manual pin/hide for scenario cards
  const [cardsPinned, setCardsPinned] = useState(true)

  return (
    <div className="h-screen flex flex-col">
      {showWelcome && <Tutorial steps={WELCOME_STEPS} onClose={closeWelcome} />}
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

        <div className="flex items-center gap-3">
          {/* Scenario cards pin/hide toggle */}
          <button
            onClick={() => setCardsPinned(p => !p)}
            className={`text-xs font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors ${
              cardsPinned
                ? 'bg-brand-600/20 text-brand-400 border-brand-600/40 hover:bg-brand-600/30'
                : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
            }`}
            title={cardsPinned ? 'Hide scenarios' : 'Show scenarios'}
          >
            <span className="text-xs">{cardsPinned ? '▾' : '▸'}</span>
            Scenarios
          </button>
          {/* Real/nominal toggle */}
          {setDisplayReal && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <span className="text-xs text-gray-500">Today's $</span>
              <button
                onClick={() => setDisplayReal(r => !r)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${displayReal ? 'bg-brand-600' : 'bg-gray-700'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${displayReal ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
          )}
          <button
            className="btn-ghost text-sm"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Scenario cards strip — manual pin/hide */}
      <div
        className="bg-gray-950 border-b border-gray-800 px-6 overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: cardsPinned ? '200px' : '0px',
          paddingTop: cardsPinned ? '12px' : '0px',
          paddingBottom: cardsPinned ? '12px' : '0px',
          opacity: cardsPinned ? 1 : 0,
          borderBottomWidth: cardsPinned ? '1px' : '0px',
        }}
      >
        <ScenarioCards
          scenarios={scenarios}
          activeId={activeId}
          setActiveId={setActiveId}
          addScenario={addScenario}
          duplicateScenario={duplicateScenario}
          deleteScenario={deleteScenario}
          renameScenario={renameScenario}
        />
      </div>

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
