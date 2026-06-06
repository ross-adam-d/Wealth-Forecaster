import { useMemo, useState, useEffect, useRef } from 'react'
import { Tutorial, useTutorial, TutorialButton } from '../components/Tutorial.jsx'
import { applyRealNominal } from '../utils/format.js'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
  ComposedChart, Bar, Line, Cell,
} from 'recharts'
import { PRESERVATION_AGE } from '../constants/index.js'
import { runSimulation } from '../engine/simulationEngine.js'
import ChartFullscreen from '../components/ChartFullscreen.jsx'

const isTouchDevice = typeof window !== 'undefined' && (
  'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.matchMedia('(hover: none)').matches
)

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

  if (!isFinite(gapStart) || !isFinite(gapEnd)) return { gapSnapshots: [], gapStart: null, gapEnd: null, preserveYearA, preserveYearB, noGap: false }

  // No gap: earliest retirement is at or after preservation age — super already accessible
  if (gapStart >= gapEnd) return { gapSnapshots: [], gapStart, gapEnd, preserveYearA, preserveYearB, noGap: true }

  return {
    gapSnapshots: snapshots.filter(s => s.year >= gapStart && s.year <= gapEnd),
    gapStart,
    gapEnd,
    preserveYearA,
    preserveYearB,
    noGap: false,
  }
}

function calcGapViability(gapSnapshots) {
  if (!gapSnapshots.length) return { status: 'unknown', buffer: 0 }

  // Exclude the preservation year snapshot — at that point super unlocks, inflating liquidAssets.
  // We want to measure pre-super liquidity only.
  const prePreservation = gapSnapshots.slice(0, -1)
  const measureSnaps = prePreservation.length > 0 ? prePreservation : gapSnapshots

  const minLiquidity = Math.min(...measureSnaps.map(s => s.totalLiquidAssets))

  // CRITICAL only when liquid assets actually reach zero — a negative cashflow year (isDeficit)
  // where shares/bonds still carry positive value is NOT an exhaustion event.
  const exhaustedSnaps = measureSnaps.filter(s => s.totalLiquidAssets <= 0)
  if (exhaustedSnaps.length > 0 || minLiquidity < 0) {
    return {
      status: 'critical',
      buffer: minLiquidity,
      worstYear: measureSnaps.find(s => s.totalLiquidAssets === minLiquidity)?.year,
      deficitCount: exhaustedSnaps.length,
    }
  }
  if (minLiquidity < 50_000) {
    return { status: 'at_risk', buffer: minLiquidity }
  }
  return { status: 'viable', buffer: minLiquidity }
}

function ViabilityBadge({ status, buffer, stressed, deficitCount }) {
  const stressLabel = stressed ? ' (stressed)' : ''

  if (status === 'no_gap') {
    return (
      <span className="badge-viable">
        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
        NO GAP — super accessible at retirement
      </span>
    )
  }
  if (status === 'viable') {
    return (
      <span className="badge-viable">
        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
        GAP VIABLE — pre-super liquidity stays above {fmt$(buffer)}{stressLabel}
      </span>
    )
  }
  if (status === 'at_risk') {
    return (
      <span className="badge-at-risk">
        <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
        GAP AT RISK — buffer drops to {fmt$(buffer)}{stressLabel}
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

const AREA_COLORS_DARK  = { cash: '#60a5fa', shares: '#34d399', bonds: '#a78bfa', superA: '#0ea5e9', superB: '#38bdf8' }
const AREA_COLORS_LIGHT = { cash: '#2563eb', shares: '#059669', bonds: '#7c3aed', superA: '#0369a1', superB: '#0284c7' }

function SimpleTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const items = payload.filter(p => (p.value || 0) > 0)
  const total = items.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: '8px 12px', minWidth: 170 }}>
      <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{label}</p>
      {items.map(p => (
        <p key={p.dataKey} style={{ color: p.fill || p.stroke || '#9ca3af', fontSize: 12, margin: '2px 0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{p.name}</span><span style={{ fontWeight: 600 }}>{fmt$(p.value)}</span>
        </p>
      ))}
      {items.length > 1 && (
        <p style={{ color: '#f9fafb', fontSize: 13, fontWeight: 600, margin: '5px 0 0', borderTop: '1px solid #374151', paddingTop: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span>Total</span><span>{fmt$(total)}</span>
        </p>
      )}
    </div>
  )
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

export default function GapDashboard({ snapshots, scenario, updateScenario, displayReal = true, isLight = false }) {
  const [showTutorial, setShowTutorial, closeTutorial] = useTutorial('gapTutorialSeen', { waitFor: 'welcomeTutorialSeen' })
  const [stressExpenses, setStressExpenses] = useState(0)   // dollar delta (today's $), $2k steps
  const [stressReturn, setStressReturn] = useState(0)        // fractional delta on capital growth rate
  const [showPartTime, setShowPartTime] = useState(false)
  const [chartView, setChartView] = useState('breakdown')    // 'breakdown' | 'total' | 'cashflow'
  const [gapChartRange, setGapChartRange] = useState('full')
  const [tableOpen, setTableOpen] = useState(true)
  const fillOp       = isLight ? 1.0  : 0.5
  const fillOpDebt   = isLight ? 0.95 : 0.4
  const fillOpSingle = isLight ? 1.0  : 0.25
  const gridColor    = isLight ? '#e5e7eb' : '#1f2937'
  const tickColor    = isLight ? '#374151' : '#9ca3af'
  const cd = (dark, light) => isLight ? light : dark
  const AREA_COLORS = isLight ? AREA_COLORS_LIGHT : AREA_COLORS_DARK

  // Scratchpad retirement ages — local state only, never persisted to scenario
  const savedRetireA = scenario.household?.personA?.retirementAge ?? 60
  const savedRetireB = scenario.household?.personB?.retirementAge ?? 60
  const [scratchRetireA, setScratchRetireA] = useState(savedRetireA)
  const [scratchRetireB, setScratchRetireB] = useState(savedRetireB)
  // Sync scratchpad when the scenario loads from Supabase (retirementAge may be undefined on
  // first render before async load completes). Only update if user hasn't manually diverged.
  const prevSavedA = useRef(savedRetireA)
  const prevSavedB = useRef(savedRetireB)
  useEffect(() => {
    setScratchRetireA(prev => prev === prevSavedA.current ? savedRetireA : prev)
    setScratchRetireB(prev => prev === prevSavedB.current ? savedRetireB : prev)
    prevSavedA.current = savedRetireA
    prevSavedB.current = savedRetireB
  }, [savedRetireA, savedRetireB])

  const isStressed = stressExpenses !== 0 || stressReturn !== 0
    || scratchRetireA !== savedRetireA || scratchRetireB !== savedRetireB
  const gapCurrentYearForTransform = new Date().getFullYear()
  const gapInflationRate = scenario?.assumptions?.inflationRate ?? 0.025
  const transform = (value, year) => applyRealNominal(value, year, gapCurrentYearForTransform, gapInflationRate, displayReal)

  // Base gap data
  const { gapSnapshots, gapStart, gapEnd, preserveYearA, preserveYearB, noGap } = useMemo(
    () => getGapYears(snapshots, scenario),
    [snapshots, scenario]
  )

  // Stressed simulation — scratchpad only, never touches saved scenario
  const stressedGapSnapshots = useMemo(() => {
    if (!isStressed || !scenario) return null
    try {
      // Apply all three scratchpad levers: return rates, retirement ages, expenses
      let sc = buildStressedScenario(scenario, stressReturn)
      sc = {
        ...sc,
        household: {
          ...sc.household,
          personA: { ...sc.household.personA, retirementAge: scratchRetireA },
          personB: { ...sc.household.personB, retirementAge: scratchRetireB },
        },
      }
      const leverAdjustments = stressExpenses !== 0
        ? { expenses: { dollarDelta: stressExpenses } }
        : {}
      const all = runSimulation(sc, { leverAdjustments })
      return getGapYears(all, sc).gapSnapshots  // use sc so gap period matches scratchpad ages
    } catch {
      return null
    }
  }, [scenario, stressExpenses, stressReturn, scratchRetireA, scratchRetireB, isStressed])

  const activeGapSnapshots = (isStressed && stressedGapSnapshots) ? stressedGapSnapshots : gapSnapshots

  const viability = useMemo(() => noGap ? { status: 'no_gap', buffer: 0 } : calcGapViability(activeGapSnapshots), [activeGapSnapshots, noGap])

  // Index base snapshots by year — used for delta column and base-overlay chart line
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
    // Base-scenario overlay for comparison when stressed (null when not stressed)
    baseLiquid: isStressed && baseByYear[s.year] != null
      ? Math.max(0, transform(baseByYear[s.year].totalLiquidAssets, s.year))
      : null,
    // Cashflow view
    income: transform(s.totalIncome, s.year),
    outflows: transform(s.totalOutflows, s.year),
    net: transform(s.netCashflow, s.year),
  }))

  const sharesGrowthRate = scenario?.assumptions?.sharesReturnRate ?? 0.07
  const dividendYieldRate = scenario?.assumptions?.dividendYield ?? 0.04
  const baseTotalReturn = sharesGrowthRate + dividendYieldRate  // total return = capital growth + dividends
  const currentTotalReturn = baseTotalReturn + stressReturn
  // Dynamic slider bounds: ±8pp around base, floored at 1%
  const returnSliderMin = Math.max(1, Math.round((baseTotalReturn * 100 - 8) * 2) / 2)
  const returnSliderMax = Math.round((baseTotalReturn * 100 + 8) * 2) / 2

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
            {noGap
              ? `Retire at ${gapStart} — super already accessible (preservation age ${gapEnd})`
              : gapStart && gapEnd
                ? `${gapStart} — ${gapEnd} · ${gapEnd - gapStart} years before super unlocks`
                : 'Enter retirement ages and dates of birth to see the gap period'}
          </p>
        </div>
        <ViabilityBadge status={viability.status} buffer={viability.buffer} stressed={isStressed} deficitCount={viability.deficitCount} />
      </div>

      {/* Liquidity exhaustion warning — only when assets actually reach zero */}
      {(() => {
        const deficitSnaps = activeGapSnapshots.filter(s => s.totalLiquidAssets <= 0)
        if (!deficitSnaps.length) return null
        const first = deficitSnaps[0]
        // Sum of actual negative balances as the real shortfall figure
        const cumulative = deficitSnaps.reduce((sum, s) => sum + Math.abs(Math.min(0, s.totalLiquidAssets)), 0)
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
                  {cumulative > 0 && <> Cumulative shortfall: <span className="text-red-200 font-bold">{fmt$(cumulative)}</span>.</>}
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
          <ChartFullscreen title="Gap Period Analysis">
            {(isFullscreen) => (
              <div className={isFullscreen ? 'h-full' : 'overflow-x-auto'}>
                <div style={isFullscreen ? { height: '100%' } : { minWidth: '580px' }}>
                  <ResponsiveContainer width="100%" height={isFullscreen ? '100%' : 340}>
                    {chartView === 'breakdown' ? (
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                        <XAxis dataKey="year" tick={{ fill: tickColor, fontSize: 12 }} />
                        <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: tickColor, fontSize: 11 }} width={isTouchDevice ? 40 : 56} />
                        <Tooltip content={<SimpleTooltip />} position={{ y: 10 }} />
                        <Legend wrapperStyle={{ fontSize: 12, color: tickColor }} />
                        <Area type="monotone" dataKey="mortgage" stackId="2" stroke={cd('#f87171','#dc2626')} fill={cd('#f87171','#dc2626')} fillOpacity={fillOpDebt} name="Mortgage debt" />
                        <Area type="monotone" dataKey="debts"    stackId="2" stroke={cd('#fb923c','#ea580c')} fill={cd('#fb923c','#ea580c')} fillOpacity={fillOpDebt} name="Other debts" />
                        <Area type="monotone" dataKey="cash"           stackId="1" stroke={AREA_COLORS.cash}   fill={AREA_COLORS.cash}   fillOpacity={fillOp} name="Cash" />
                        <Area type="monotone" dataKey="shares"         stackId="1" stroke={AREA_COLORS.shares} fill={AREA_COLORS.shares} fillOpacity={fillOp} name="Shares" />
                        <Area type="monotone" dataKey="treasuryBonds"  stackId="1" stroke={cd('#22d3ee','#0891b2')} fill={cd('#22d3ee','#0891b2')} fillOpacity={fillOp} name="Treasury Bonds" />
                        <Area type="monotone" dataKey="commodities"    stackId="1" stroke={cd('#f472b6','#db2777')} fill={cd('#f472b6','#db2777')} fillOpacity={fillOp} name="Commodities" />
                        <Area type="monotone" dataKey="bonds"          stackId="1" stroke={AREA_COLORS.bonds}  fill={AREA_COLORS.bonds}  fillOpacity={fillOp} name="Tax-Def. Bonds" />
                        <Area type="monotone" dataKey="superA" stackId="1" stroke={AREA_COLORS.superA} fill={AREA_COLORS.superA} fillOpacity={fillOp} name="Super A (unlocked)" />
                        <Area type="monotone" dataKey="superB" stackId="1" stroke={AREA_COLORS.superB} fill={AREA_COLORS.superB} fillOpacity={fillOp} name="Super B (unlocked)" />
                        {preserveYearA && <ReferenceLine x={preserveYearA} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'A preserved', fill: '#f59e0b', fontSize: 11 }} />}
                        {preserveYearB && <ReferenceLine x={preserveYearB} stroke="#fb923c" strokeDasharray="4 4" label={{ value: 'B preserved', fill: '#fb923c', fontSize: 11 }} />}
                      </AreaChart>
                    ) : chartView === 'total' ? (
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                        <XAxis dataKey="year" tick={{ fill: tickColor, fontSize: 12 }} />
                        <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: tickColor, fontSize: 11 }} width={isTouchDevice ? 40 : 56} />
                        <Tooltip content={<SimpleTooltip />} position={{ y: 10 }} />
                        <Legend wrapperStyle={{ fontSize: 12, color: tickColor }} />
                        <Area type="monotone" dataKey="totalLiquid" stroke={cd('#4ade80','#16a34a')} fill={cd('#4ade80','#16a34a')} fillOpacity={fillOpSingle} name="Stressed liquidity" strokeWidth={2} />
                        {isStressed && <Area type="monotone" dataKey="baseLiquid" stroke={cd('#9ca3af','#6b7280')} fill="none" strokeDasharray="5 3" strokeWidth={1.5} name="Base (saved) liquidity" dot={false} />}
                        {preserveYearA && <ReferenceLine x={preserveYearA} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'A preserved', fill: '#f59e0b', fontSize: 11 }} />}
                        {preserveYearB && <ReferenceLine x={preserveYearB} stroke="#fb923c" strokeDasharray="4 4" label={{ value: 'B preserved', fill: '#fb923c', fontSize: 11 }} />}
                        <ReferenceLine y={0} stroke={cd('#ef4444','#dc2626')} strokeDasharray="3 3" label={{ value: '$0', fill: cd('#ef4444','#dc2626'), fontSize: 10 }} />
                      </AreaChart>
                    ) : (
                      <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                        <XAxis dataKey="year" tick={{ fill: tickColor, fontSize: 12 }} />
                        <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: tickColor, fontSize: 11 }} width={isTouchDevice ? 40 : 56} />
                        <Tooltip content={<SimpleTooltip />} position={{ y: 10 }} />
                        <Legend wrapperStyle={{ fontSize: 12, color: tickColor }} />
                        <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
                        <Bar dataKey="income" name="Income (after tax)" fill={cd('#0ea5e9','#0369a1')} fillOpacity={isLight ? 1.0 : 0.75} radius={[2, 2, 0, 0]} />
                        <Bar dataKey="outflows" name="Outflows (inc. mortgage)" fill={cd('#f87171','#dc2626')} fillOpacity={isLight ? 1.0 : 0.75} radius={[2, 2, 0, 0]} />
                        <Line type="monotone" dataKey="net" name="Net cashflow" strokeWidth={2} dot={false} stroke={cd('#4ade80','#16a34a')} />
                        {preserveYearA && <ReferenceLine x={preserveYearA} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'A preserved', fill: '#f59e0b', fontSize: 11 }} />}
                        {preserveYearB && <ReferenceLine x={preserveYearB} stroke="#fb923c" strokeDasharray="4 4" label={{ value: 'B preserved', fill: '#fb923c', fontSize: 11 }} />}
                      </ComposedChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </ChartFullscreen>
        ) : noGap ? (
          <div className="h-[340px] flex flex-col items-center justify-center gap-3 text-center px-6">
            <span className="text-green-400 text-4xl">✓</span>
            <p className="text-gray-300 font-medium">No gap period — you retire after super preservation age</p>
            <p className="text-gray-500 text-sm max-w-md">
              Super is already accessible when you retire. There is no window where you need to fund living expenses without super. Use the Projection tab to review your full financial picture.
            </p>
          </div>
        ) : (
          <div className="h-[340px] flex items-center justify-center text-gray-600">
            Enter household details to see gap runway
          </div>
        )}
      </div>

      {/* Retirement age sliders — scratchpad only */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-300">Retirement Age</h2>
          <span className="text-xs text-gray-600">Scratchpad — changes here don't update your profile</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { key: 'personA', scratch: scratchRetireA, setScratch: setScratchRetireA, saved: savedRetireA },
            { key: 'personB', scratch: scratchRetireB, setScratch: setScratchRetireB, saved: savedRetireB },
          ].map(({ key, scratch, setScratch, saved }) => {
            const person = scenario.household[key]
            const label = person.name || (key === 'personA' ? 'Person A' : 'Person B')
            const changed = scratch !== saved
            return (
              <div key={key}>
                <div className="flex justify-between mb-1">
                  <label className="label mb-0">{label}</label>
                  <div className="flex items-center gap-2">
                    {changed && (
                      <span className="text-xs text-amber-500">
                        was {saved} · saved
                      </span>
                    )}
                    <span className="text-sm font-semibold text-white">Age {scratch}</span>
                  </div>
                </div>
                <input
                  type="range" min={35} max={70} step={1}
                  value={scratch}
                  onChange={e => setScratch(Number(e.target.value))}
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
                {stressExpenses === 0
                  ? '±$0'
                  : `${stressExpenses > 0 ? '+' : '−'}${fmt$(Math.abs(stressExpenses))}/yr`}
              </span>
            </div>
            <input
              type="range" min={-20000} max={20000} step={2000}
              value={stressExpenses}
              onChange={e => setStressExpenses(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-0.5">
              <span>−$20k</span>
              <span>+$20k</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="label mb-0">Portfolio return</label>
              <span className={`text-xs font-medium ${stressReturn < 0 ? 'text-red-400' : stressReturn > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                {(currentTotalReturn * 100).toFixed(1)}%
                {stressReturn !== 0 && (
                  <span className="text-gray-600 ml-1">
                    ({stressReturn > 0 ? '+' : ''}{(stressReturn * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
            <input
              type="range" min={returnSliderMin} max={returnSliderMax} step={0.5}
              value={(currentTotalReturn * 100).toFixed(1)}
              onChange={e => setStressReturn(Number(e.target.value) / 100 - baseTotalReturn)}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-0.5">
              <span>{returnSliderMin}%</span>
              <span className="text-gray-500">{(baseTotalReturn * 100).toFixed(1)}% base</span>
              <span>{returnSliderMax}%</span>
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
            onClick={() => {
              setStressExpenses(0)
              setStressReturn(0)
              setScratchRetireA(savedRetireA)
              setScratchRetireB(savedRetireB)
            }}
            className="mt-4 text-xs text-gray-500 hover:text-gray-300 underline"
          >
            Reset all scratchpad adjustments
          </button>
        )}
      </div>

      {/* Year-by-year cashflow table */}
      {activeGapSnapshots.length > 0 && (
        <div className="rounded-xl overflow-hidden">
          <button
            className="flex items-center justify-between w-full text-left px-1 py-1"
            onClick={() => setTableOpen(o => !o)}
          >
            <h2 className="text-sm font-semibold text-gray-300">
              Year-by-Year Cashflow — Gap Period
              {isStressed && <span className="ml-2 text-xs text-amber-400 font-normal">(stressed scenario)</span>}
            </h2>
            <span className="text-gray-500 text-xs ml-4 flex-shrink-0">{tableOpen ? '▾' : '▸'}</span>
          </button>
          {tableOpen && <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800/50">
                <th className="text-left py-2 px-2 sm:px-3 text-gray-500 font-medium">Year</th>
                <th className="text-right py-2 px-2 sm:px-3 text-gray-500 font-medium">Income (after tax)</th>
                <th className="text-right py-2 px-2 sm:px-3 text-gray-500 font-medium">Outflows (inc. mortgage)</th>
                <th className="text-right py-2 px-2 sm:px-3 text-gray-500 font-medium">Net</th>
                <th className="text-right py-2 px-2 sm:px-3 text-gray-500 font-medium">Liquid Assets</th>
                {isStressed && <th className="text-right py-2 px-2 sm:px-3 text-gray-500 font-medium">Δ vs Base</th>}
              </tr>
            </thead>
            <tbody>
              {activeGapSnapshots.map(s => {
                const base = baseByYear[s.year]
                const delta = (isStressed && base) ? fmtDelta(transform(s.totalLiquidAssets, s.year), transform(base.totalLiquidAssets, s.year)) : null
                const exhausted = s.totalLiquidAssets <= 0
                const cashflowTight = s.isDeficit && !exhausted
                return (
                  <tr key={s.year} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${exhausted ? 'bg-red-950/40' : cashflowTight ? 'bg-amber-950/20' : ''}`}>
                    <td className={`py-2 px-3 ${exhausted ? 'text-red-300 font-bold' : cashflowTight ? 'text-amber-400 font-medium' : 'text-gray-300'}`}>
                      {s.year}{exhausted ? ' !!' : cashflowTight ? ' ~' : ''}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-300">{fmt$(transform(s.totalIncome, s.year))}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{fmt$(transform(s.totalOutflows, s.year))}</td>
                    <td className={`py-2 px-3 text-right font-medium ${exhausted ? 'text-red-400' : s.netCashflow < 0 ? 'text-amber-400' : 'text-green-400'}`}>
                      {s.netCashflow < 0 ? '−' : '+'}{fmt$(Math.abs(transform(s.netCashflow, s.year)))}
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
          </div>}
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
