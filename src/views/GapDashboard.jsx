import { useMemo, useState } from 'react'
import { Tutorial, useTutorial, TutorialButton } from '../components/Tutorial.jsx'
import { applyRealNominal } from '../utils/format.js'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
  ComposedChart, Bar, Line, Cell,
} from 'recharts'
import { PRESERVATION_AGE } from '../constants/index.js'
import { runSimulation } from '../engine/simulationEngine.js'

function getGapYears(snapshots, scenario) {
  const { personA, personB } = scenario.household
  const birthYearA = personA.dateOfBirth ? new Date(personA.dateOfBirth).getFullYear() : null
  const birthYearB = personB.dateOfBirth ? new Date(personB.dateOfBirth).getFullYear() : null

  const retireYearA = birthYearA ? birthYearA + personA.retirementAge : null
  const retireYearB = birthYearB ? birthYearB + personB.retirementAge : null
  const preserveYearA = birthYearA ? birthYearA + PRESERVATION_AGE : null
  const preserveYearB = birthYearB ? birthYearB + PRESERVATION_AGE : null

  const gapStart = Math.min(retireYearA || Infinity, retireYearB || Infinity)
  const gapEnd = Math.max(preserveYearA || -Infinity, preserveYearB || -Infinity)

  if (!isFinite(gapStart) || !isFinite(gapEnd)) return { gapSnapshots: [], gapStart: null, gapEnd: null, preserveYearA, preserveYearB }

  return {
    gapSnapshots: snapshots.filter(s => s.year >= gapStart && s.year <= gapEnd),
    gapStart,
    gapEnd,
    preserveYearA,
    preserveYearB,
  }
}

function calcGapViability(gapSnapshots) {
  if (!gapSnapshots.length) return { status: 'unknown', buffer: 0 }

  const deficitSnaps = gapSnapshots.filter(s => s.isDeficit)
  const minLiquidity = Math.min(...gapSnapshots.map(s => s.totalLiquidAssets))
  const finalLiquidity = gapSnapshots[gapSnapshots.length - 1]?.totalLiquidAssets || 0

  if (deficitSnaps.length > 0 || minLiquidity < 0) {
    return {
      status: 'critical',
      buffer: minLiquidity,
      worstYear: gapSnapshots.find(s => s.totalLiquidAssets === minLiquidity)?.year,
      deficitCount: deficitSnaps.length,
    }
  }
  if (minLiquidity < 50_000) {
    return { status: 'at_risk', buffer: minLiquidity }
  }
  return { status: 'viable', buffer: finalLiquidity }
}

function ViabilityBadge({ status, buffer, stressed, deficitCount }) {
  const fmt = (n) => `$${Math.abs(Math.round(n / 1000))}k`
  const stressLabel = stressed ? ' (stressed)' : ''

  if (status === 'viable') {
    return (
      <span className="badge-viable">
        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
        GAP VIABLE — {fmt(buffer)} buffer at preservation age{stressLabel}
      </span>
    )
  }
  if (status === 'at_risk') {
    return (
      <span className="badge-at-risk">
        <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
        GAP AT RISK — buffer drops to {fmt(buffer)}{stressLabel}
      </span>
    )
  }
  if (status === 'critical') {
    return (
      <span className="badge-critical">
        <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
        GAP CRITICAL — liquid assets exhausted{deficitCount ? ` (${deficitCount}yr shortfall)` : ''}{stressLabel}
      </span>
    )
  }
  return <span className="badge-at-risk">No gap data — enter household details</span>
}

const GAP_TUTORIAL = [
  {
    title: 'What is "The Gap"?',
    body: 'The Gap is the period between your earliest retirement date and when super becomes accessible at preservation age (60). During this window you rely entirely on non-super liquid assets — cash, shares, and investment bonds — to fund living expenses.',
  },
  {
    title: 'Viability badge',
    body: 'The badge at the top right shows whether your liquid assets last the entire gap period. Green = viable with buffer, amber = tight, red = liquid assets exhausted before super unlocks.',
  },
  {
    title: 'Stress testing',
    body: 'Use the Stress Test sliders to see how rising expenses or falling returns affect your position. This helps you plan for worst-case scenarios without changing your saved data.',
  },
  {
    title: 'Retirement age sliders',
    body: 'Drag the retirement age sliders to find the earliest viable date. Each change re-runs the simulation instantly so you can see the impact in real time.',
  },
]

const AREA_COLORS = {
  cash: '#60a5fa',
  shares: '#34d399',
  bonds: '#a78bfa',
  superA: '#f59e0b',
  superB: '#fb923c',
}

function fmt$(n) {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

function fmtDelta(stressed, base) {
  const delta = stressed - base
  if (Math.abs(delta) < 500) return null
  const sign = delta >= 0 ? '+' : '−'
  const abs = Math.abs(delta)
  const str = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(1)}M` : abs >= 1_000 ? `$${Math.round(abs / 1_000)}k` : `$${Math.round(abs)}`
  return { label: `${sign}${str}`, positive: delta >= 0 }
}

// Shift all rate periods by delta for stress testing
function shiftRatePeriods(ratePeriods, delta) {
  return ratePeriods.map(p => ({ ...p, rate: Math.max(0, p.rate + delta) }))
}

function buildStressedScenario(scenario, stressReturn) {
  if (stressReturn === 0) return scenario
  return {
    ...scenario,
    shares: {
      ...scenario.shares,
      ratePeriods: shiftRatePeriods(scenario.shares.ratePeriods, stressReturn),
    },
    super: scenario.super.map(s => ({
      ...s,
      ratePeriods: shiftRatePeriods(s.ratePeriods, stressReturn),
    })),
    investmentBonds: scenario.investmentBonds.map(b => ({
      ...b,
      ratePeriods: shiftRatePeriods(b.ratePeriods, stressReturn),
    })),
  }
}

export default function GapDashboard({ snapshots, scenario, updateScenario, displayReal = true }) {
  const [showTutorial, setShowTutorial, closeTutorial] = useTutorial('gapTutorialSeen', { waitFor: 'welcomeTutorialSeen' })
  const [stressExpenses, setStressExpenses] = useState(0)   // fractional: -0.20 to +0.30
  const [stressReturn, setStressReturn] = useState(0)        // fractional delta on return rates
  const [showPartTime, setShowPartTime] = useState(false)
  const [chartView, setChartView] = useState('breakdown')    // 'breakdown' | 'total' | 'cashflow'
  const [gapChartRange, setGapChartRange] = useState('full')

  const isStressed = stressExpenses !== 0 || stressReturn !== 0
  const gapCurrentYearForTransform = new Date().getFullYear()
  const gapInflationRate = scenario?.assumptions?.inflationRate ?? 0.025
  const transform = (value, year) => applyRealNominal(value, year, gapCurrentYearForTransform, gapInflationRate, displayReal)

  // Base gap data
  const { gapSnapshots, gapStart, gapEnd, preserveYearA, preserveYearB } = useMemo(
    () => getGapYears(snapshots, scenario),
    [snapshots, scenario]
  )

  // Stressed simulation — runs only when sliders are non-zero
  const stressedGapSnapshots = useMemo(() => {
    if (!isStressed || !scenario) return null
    try {
      const sc = buildStressedScenario(scenario, stressReturn)
      const leverAdjustments = stressExpenses !== 0
        ? { expenses: { discretionary: stressExpenses, fixed: stressExpenses } }
        : {}
      const all = runSimulation(sc, { leverAdjustments })
      return getGapYears(all, scenario).gapSnapshots
    } catch {
      return null
    }
  }, [scenario, stressExpenses, stressReturn, isStressed])

  const activeGapSnapshots = (isStressed && stressedGapSnapshots) ? stressedGapSnapshots : gapSnapshots

  const viability = useMemo(() => calcGapViability(activeGapSnapshots), [activeGapSnapshots])

  // Index base snapshots by year for delta column
  const baseByYear = useMemo(() => {
    const map = {}
    gapSnapshots.forEach(s => { map[s.year] = s })
    return map
  }, [gapSnapshots])

  const gapCurrentYear = new Date().getFullYear()
  const rangedGapSnapshots = gapChartRange === 'full'
    ? activeGapSnapshots
    : activeGapSnapshots.filter(s => s.year <= gapCurrentYear + Number(gapChartRange))
  const chartData = rangedGapSnapshots.map(s => ({
    year: s.year,
    // Breakdown view
    cash: Math.max(0, transform(s.cashBuffer, s.year)),
    shares: Math.max(0, transform(s.sharesValue, s.year)),
    treasuryBonds: Math.max(0, transform(s.treasuryBondsValue ?? 0, s.year)),
    commodities: Math.max(0, transform(s.commoditiesValue ?? 0, s.year)),
    bonds: Math.max(0, transform(s.bondLiquidity + s.bondPreTenYr, s.year)),
    superA: s.superAUnlocked ? Math.max(0, transform(s.superABalance, s.year)) : 0,
    superB: s.superBUnlocked ? Math.max(0, transform(s.superBBalance, s.year)) : 0,
    mortgage: -(transform(s.totalMortgageBalance || 0, s.year)),
    debts: -(transform(s.totalDebtBalance || 0, s.year)),
    // Total liquidity view
    totalLiquid: Math.max(0, transform(s.totalLiquidAssets, s.year)),
    // Cashflow view
    income: transform(s.totalIncome, s.year),
    outflows: transform(s.totalOutflows, s.year),
    net: transform(s.netCashflow, s.year),
  }))

  const baseReturnRate = scenario?.assumptions?.sharesReturnRate ?? 0.08
  const currentReturnRate = baseReturnRate + stressReturn

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {showTutorial && <Tutorial steps={GAP_TUTORIAL} onClose={closeTutorial} />}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">The Gap</h1>
            <TutorialButton onClick={() => setShowTutorial(true)} />
          </div>
          <p className="text-gray-400 text-sm mt-1">
            {gapStart && gapEnd
              ? `${gapStart} — ${gapEnd} · ${gapEnd - gapStart} years before super unlocks`
              : 'Enter retirement ages and dates of birth to see the gap period'}
          </p>
        </div>
        <ViabilityBadge status={viability.status} buffer={viability.buffer} stressed={isStressed} deficitCount={viability.deficitCount} />
      </div>

      {/* Liquidity exhaustion warning */}
      {(() => {
        const deficitSnaps = activeGapSnapshots.filter(s => s.isDeficit)
        if (!deficitSnaps.length) return null
        const first = deficitSnaps[0]
        const cumulative = deficitSnaps[deficitSnaps.length - 1]?.cumulativeDeficit || 0
        return (
          <div className="bg-red-950 border-2 border-red-600 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="text-red-400 text-4xl font-black leading-none mt-0.5">!</div>
              <div>
                <h2 className="text-red-300 font-bold text-lg">Liquidity Exhausted — Plan Not Viable</h2>
                <p className="text-red-400 text-sm mt-2 leading-relaxed">
                  All liquid assets (cash, shares, bonds{first.superAUnlocked || first.superBUnlocked ? ', accessible super' : ''}) are
                  depleted by <span className="text-red-200 font-bold">{first.year}</span>
                  {first.ageA != null && <> (age {first.ageA}{first.ageB != null ? `/${first.ageB}` : ''})</>}.
                  {deficitSnaps.length > 1 && <> The plan runs {deficitSnaps.length} years in deficit.</>}
                  {cumulative > 0 && <> Cumulative shortfall: <span className="text-red-200 font-bold">${Math.round(cumulative / 1000)}k</span>.</>}
                </p>
                <p className="text-red-500 text-xs mt-3">
                  To make this plan viable: delay retirement, reduce expenses, increase savings rate, or adjust asset allocation.
                </p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Runway chart */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-300">Gap Period Analysis</h2>
          <div className="flex flex-wrap items-center gap-2">
            {isStressed && (
              <span className="text-xs text-amber-400 bg-amber-900/30 border border-amber-800 rounded px-2 py-0.5">
                Stress active
              </span>
            )}
            {/* Range selector */}
            <select
              value={gapChartRange}
              onChange={e => setGapChartRange(e.target.value)}
              className="input text-xs py-1 px-2 h-7"
            >
              <option value="10">Next 10 yrs</option>
              <option value="20">Next 20 yrs</option>
              <option value="40">Next 40 yrs</option>
              <option value="full">Full gap</option>
            </select>
            {/* Chart view toggles */}
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
              {[
                { id: 'breakdown', label: 'Breakdown' },
                { id: 'total', label: 'Liquidity' },
                { id: 'cashflow', label: 'Cashflow' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setChartView(id)}
                  className={`text-xs px-3 py-1 rounded-md transition-colors ${
                    chartView === id
                      ? 'bg-brand-600 text-white font-medium'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chartData.length > 0 ? (
          <div className="overflow-x-auto">
          <div style={{ minWidth: '580px' }}>
          <ResponsiveContainer width="100%" height={340}>
            {chartView === 'breakdown' ? (
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip
                  formatter={(v, name) => [fmt$(v), name]}
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#f9fafb' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                <Area type="monotone" dataKey="mortgage" stackId="2" stroke="#f87171" fill="#f87171" fillOpacity={0.4} name="Mortgage debt" />
                <Area type="monotone" dataKey="debts"    stackId="2" stroke="#fb923c" fill="#fb923c" fillOpacity={0.4} name="Other debts" />
                <Area type="monotone" dataKey="cash"           stackId="1" stroke={AREA_COLORS.cash}   fill={AREA_COLORS.cash}   fillOpacity={0.5} name="Cash" />
                <Area type="monotone" dataKey="shares"         stackId="1" stroke={AREA_COLORS.shares} fill={AREA_COLORS.shares} fillOpacity={0.5} name="Shares" />
                <Area type="monotone" dataKey="treasuryBonds"  stackId="1" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.5} name="Treasury Bonds" />
                <Area type="monotone" dataKey="commodities"    stackId="1" stroke="#f472b6" fill="#f472b6" fillOpacity={0.5} name="Commodities" />
                <Area type="monotone" dataKey="bonds"          stackId="1" stroke={AREA_COLORS.bonds}  fill={AREA_COLORS.bonds}  fillOpacity={0.5} name="Tax-Def. Bonds" />
                <Area type="monotone" dataKey="superA" stackId="1" stroke={AREA_COLORS.superA} fill={AREA_COLORS.superA} fillOpacity={0.5} name="Super A (unlocked)" />
                <Area type="monotone" dataKey="superB" stackId="1" stroke={AREA_COLORS.superB} fill={AREA_COLORS.superB} fillOpacity={0.5} name="Super B (unlocked)" />
                {preserveYearA && <ReferenceLine x={preserveYearA} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'A preserved', fill: '#f59e0b', fontSize: 11 }} />}
                {preserveYearB && <ReferenceLine x={preserveYearB} stroke="#fb923c" strokeDasharray="4 4" label={{ value: 'B preserved', fill: '#fb923c', fontSize: 11 }} />}
              </AreaChart>
            ) : chartView === 'total' ? (
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip
                  formatter={(v, name) => [fmt$(v), name]}
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#f9fafb' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                <Area
                  type="monotone"
                  dataKey="totalLiquid"
                  stroke="#4ade80"
                  fill="#4ade80"
                  fillOpacity={0.25}
                  name="Total liquid assets"
                  strokeWidth={2}
                />
                {preserveYearA && <ReferenceLine x={preserveYearA} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'A preserved', fill: '#f59e0b', fontSize: 11 }} />}
                {preserveYearB && <ReferenceLine x={preserveYearB} stroke="#fb923c" strokeDasharray="4 4" label={{ value: 'B preserved', fill: '#fb923c', fontSize: 11 }} />}
                <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
              </AreaChart>
            ) : (
              /* Cashflow view: grouped bars for income/outflows + line for net */
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip
                  formatter={(v, name) => [fmt$(v), name]}
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#f9fafb' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                <Bar dataKey="income" name="Income (after tax)" fill="#0ea5e9" fillOpacity={0.75} radius={[2, 2, 0, 0]} />
                <Bar dataKey="outflows" name="Outflows (inc. mortgage)" fill="#f87171" fillOpacity={0.75} radius={[2, 2, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Net cashflow"
                  strokeWidth={2}
                  dot={false}
                  stroke="#4ade80"
                />
                {preserveYearA && <ReferenceLine x={preserveYearA} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'A preserved', fill: '#f59e0b', fontSize: 11 }} />}
                {preserveYearB && <ReferenceLine x={preserveYearB} stroke="#fb923c" strokeDasharray="4 4" label={{ value: 'B preserved', fill: '#fb923c', fontSize: 11 }} />}
              </ComposedChart>
            )}
          </ResponsiveContainer>
          </div>
          </div>
        ) : (
          <div className="h-[340px] flex items-center justify-center text-gray-600">
            Enter household details to see gap runway
          </div>
        )}
      </div>

      {/* Retirement age sliders */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Retirement Age</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {['personA', 'personB'].map(key => {
            const person = scenario.household[key]
            const label = person.name || (key === 'personA' ? 'Person A' : 'Person B')
            const age = person.retirementAge ?? 60
            return (
              <div key={key}>
                <div className="flex justify-between mb-1">
                  <label className="label mb-0">{label}</label>
                  <span className="text-sm font-semibold text-white">Age {age}</span>
                </div>
                <input
                  type="range" min={35} max={70} step={1}
                  value={age}
                  onChange={e => updateScenario({
                    household: {
                      ...scenario.household,
                      [key]: { ...person, retirementAge: Number(e.target.value) },
                    }
                  })}
                  className="w-full accent-brand-500"
                />
                <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                  <span>35</span>
                  <span>70</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Stress test panel */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Stress Test</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div>
            <div className="flex justify-between mb-1">
              <label className="label mb-0">Expenses adjustment</label>
              <span className={`text-xs font-medium ${stressExpenses > 0 ? 'text-amber-400' : stressExpenses < 0 ? 'text-green-400' : 'text-gray-500'}`}>
                {stressExpenses >= 0 ? '+' : ''}{Math.round(stressExpenses * 100)}%
              </span>
            </div>
            <input
              type="range" min={-20} max={30} step={1}
              value={Math.round(stressExpenses * 100)}
              onChange={e => setStressExpenses(Number(e.target.value) / 100)}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-0.5">
              <span>−20%</span>
              <span>+30%</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="label mb-0">Portfolio return</label>
              <span className={`text-xs font-medium ${stressReturn < 0 ? 'text-red-400' : stressReturn > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                {(currentReturnRate * 100).toFixed(1)}%
                {stressReturn !== 0 && (
                  <span className="text-gray-600 ml-1">
                    ({stressReturn > 0 ? '+' : ''}{(stressReturn * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
            <input
              type="range" min={4} max={10} step={0.5}
              value={(currentReturnRate * 100).toFixed(1)}
              onChange={e => setStressReturn(Number(e.target.value) / 100 - baseReturnRate)}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-0.5">
              <span>4%</span>
              <span>10%</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="label">Part-time income</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showPartTime}
                onChange={e => setShowPartTime(e.target.checked)}
                className="accent-brand-500"
              />
              <span className="text-sm text-gray-300">Include part-time income during gap</span>
            </label>
            <p className="text-xs text-gray-500">Configure in Household → Retirement income</p>
          </div>
        </div>

        {isStressed && (
          <button
            onClick={() => { setStressExpenses(0); setStressReturn(0) }}
            className="mt-4 text-xs text-gray-500 hover:text-gray-300 underline"
          >
            Reset stress test
          </button>
        )}
      </div>

      {/* Year-by-year cashflow table */}
      {activeGapSnapshots.length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">
            Year-by-Year Cashflow — Gap Period
            {isStressed && <span className="ml-2 text-xs text-amber-400 font-normal">(stressed scenario)</span>}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Year</th>
                <th className="text-right py-2 px-3 text-gray-500 font-medium">Income (after tax)</th>
                <th className="text-right py-2 px-3 text-gray-500 font-medium">Outflows (inc. mortgage)</th>
                <th className="text-right py-2 px-3 text-gray-500 font-medium">Net</th>
                <th className="text-right py-2 px-3 text-gray-500 font-medium">Liquid Assets</th>
                {isStressed && <th className="text-right py-2 px-3 text-gray-500 font-medium">Δ vs Base</th>}
              </tr>
            </thead>
            <tbody>
              {activeGapSnapshots.map(s => {
                const base = baseByYear[s.year]
                const delta = (isStressed && base) ? fmtDelta(transform(s.totalLiquidAssets, s.year), transform(base.totalLiquidAssets, s.year)) : null
                return (
                  <tr key={s.year} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${s.isDeficit ? 'bg-red-950/40' : ''}`}>
                    <td className={`py-2 px-3 ${s.isDeficit ? 'text-red-300 font-bold' : 'text-gray-300'}`}>
                      {s.year}{s.isDeficit && ' !!'}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300">{fmt$(transform(s.totalIncome, s.year))}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{fmt$(transform(s.totalOutflows, s.year))}</td>
                    <td className={`py-2 px-3 text-right font-medium ${s.isDeficit ? 'text-red-400' : 'text-green-400'}`}>
                      {s.isDeficit ? '−' : '+'}{fmt$(Math.abs(transform(s.netCashflow, s.year)))}
                    </td>
                    <td className={`py-2 px-3 text-right font-medium ${s.totalLiquidAssets < 50_000 ? 'text-amber-400' : 'text-gray-200'}`}>
                      {fmt$(transform(s.totalLiquidAssets, s.year))}
                    </td>
                    {isStressed && (
                      <td className={`py-2 px-3 text-right text-xs font-medium ${delta ? (delta.positive ? 'text-green-400' : 'text-red-400') : 'text-gray-600'}`}>
                        {delta ? delta.label : '—'}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Partner gap phases */}
      {gapStart && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Solo Gap Phase</h3>
            <p className="text-sm text-gray-300">One person retired, one still earning. Reduced but manageable risk.</p>
          </div>
          <div className="card border-amber-800">
            <h3 className="text-xs font-semibold text-amber-500 uppercase tracking-wide mb-2">Joint Gap Phase</h3>
            <p className="text-sm text-gray-300">Both retired, both pre-preservation. Maximum risk window.</p>
          </div>
          <div className="card">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Super Unlock</h3>
            <p className="text-sm text-gray-300">
              {preserveYearA && `Person A: ${preserveYearA}. `}
              {preserveYearB && `Person B: ${preserveYearB}.`}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
