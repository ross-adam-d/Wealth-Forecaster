import { NavLink, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
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

export default function Layout({ children, scenarios, activeId, setActiveId, addScenario, duplicateScenario, deleteScenario, renameScenario, displayReal, setDisplayReal, snapshots, isLight, toggleTheme }) {
  const mainRef = useRef(null)
  const { pathname } = useLocation()
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [pathname])
  const deficitYears = snapshots?.deficitYears || []
  const firstDeficitYear = snapshots?.firstDeficitYear
  const cumulativeDeficit = snapshots?.cumulativeDeficit || 0

  const [showWelcome, , closeWelcome] = useTutorial('welcomeTutorialSeen')

  // Manual pin/hide for scenario cards
  const [cardsPinned, setCardsPinned] = useState(true)
  // Mobile nav menu
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="h-screen flex flex-col">
      {showWelcome && <Tutorial steps={WELCOME_STEPS} onClose={closeWelcome} />}
      {/* LIQUIDITY EXHAUSTION BANNER — persistent, impossible to miss */}
      {deficitYears.length > 0 && (
        <div className="bg-red-900 border-b-2 border-red-500 px-4 py-3 flex items-center gap-3">
          <span className="text-red-200 text-2xl font-bold leading-none">!</span>
          <div className="flex-1 min-w-0">
            <p className="text-red-100 font-bold text-sm">
              PLAN NOT VIABLE — Liquidity exhausted in {firstDeficitYear}
            </p>
            <p className="text-red-300 text-xs mt-0.5">
              {deficitYears.length} deficit year{deficitYears.length > 1 ? 's' : ''} detected
              {cumulativeDeficit > 0 && ` · $${Math.round(cumulativeDeficit / 1000)}k cumulative shortfall`}.
              {' '}Adjust retirement age, expenses, or asset allocation to close the gap.
            </p>
          </div>
          <NavLink to="/gap" className="text-xs font-semibold text-red-200 bg-red-800 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0">
            View Gap
          </NavLink>
        </div>
      )}

      {/* Top nav */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-white text-sm tracking-tight whitespace-nowrap hidden sm:block">Aussie Retirement Simulator</span>
          <span className="font-semibold text-white text-sm tracking-tight whitespace-nowrap sm:hidden">ARS</span>
          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-0.5">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  isActive
                    ? 'px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-gray-700 whitespace-nowrap'
                    : 'px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors whitespace-nowrap'
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(m => !m)}
            className="sm:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="4" y1="4" x2="14" y2="14"/>
                <line x1="14" y1="4" x2="4" y2="14"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="3" y1="5" x2="15" y2="5"/>
                <line x1="3" y1="9" x2="15" y2="9"/>
                <line x1="3" y1="13" x2="15" y2="13"/>
              </svg>
            )}
          </button>
          {/* Scenario cards pin/hide toggle */}
          <button
            onClick={() => setCardsPinned(p => !p)}
            className={`text-xs font-medium flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition-colors ${
              cardsPinned
                ? 'bg-brand-600/20 text-brand-400 border-brand-600/40 hover:bg-brand-600/30'
                : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
            }`}
            title={cardsPinned ? 'Hide scenarios' : 'Show scenarios'}
          >
            <span className="text-xs">{cardsPinned ? '▾' : '▸'}</span>
            <span className="hidden sm:inline">Scenarios</span>
          </button>
          {/* Real/nominal toggle */}
          {setDisplayReal && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <span className="text-xs text-gray-500 hidden sm:inline">Today's $</span>
              <button
                onClick={() => setDisplayReal(r => !r)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${displayReal ? 'bg-brand-600' : 'bg-gray-700'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${displayReal ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
          )}
          {/* Light/dark toggle */}
          {toggleTheme && (
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {isLight ? (
                /* Moon icon */
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/>
                </svg>
              ) : (
                /* Sun icon */
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z"/>
                </svg>
              )}
            </button>
          )}
          <button
            className="btn-ghost text-xs hidden sm:block"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Mobile nav dropdown */}
      {mobileMenuOpen && (
        <div className="sm:hidden bg-gray-900 border-b border-gray-800 px-2 py-2 flex flex-col gap-0.5">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                isActive
                  ? 'block px-3 py-2.5 rounded-lg text-sm font-medium text-white bg-gray-700'
                  : 'block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors'
              }
            >
              {label}
            </NavLink>
          ))}
          <button
            className="block w-full text-left px-3 py-2.5 text-sm text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            onClick={() => { setMobileMenuOpen(false); supabase.auth.signOut() }}
          >
            Sign out
          </button>
        </div>
      )}

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
          displayReal={displayReal}
        />
      </div>

      {/* Main content */}
      <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto">
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
