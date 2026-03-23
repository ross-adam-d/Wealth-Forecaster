import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { runSimulation, solveRetirementDate } from '../engine/simulationEngine.js'

function fmt$(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

function computeResult(scenario) {
  if (!scenario) return null
  try {
    const snaps = runSimulation(scenario)
    const rd = solveRetirementDate(scenario)
    const last = snaps[snaps.length - 1]
    const deficitYears = snaps.deficitYears || []
    const retireYear = rd?.retirementYear ?? null
    const retireSnap = retireYear ? snaps.find(s => s.year === retireYear) : null

    return {
      name: scenario.name,
      snaps,
      retirementYear: retireYear,
      retirementAge: rd?.retirementAge ?? null,
      netWorthAtEnd: last?.totalNetWorth ?? 0,
      netWorthAtRetirement: retireSnap?.totalNetWorth ?? null,
      liquidAtRetirement: retireSnap?.totalLiquidAssets ?? null,
      liquidAtEnd: last?.totalLiquidAssets ?? 0,
      deficitCount: deficitYears.length,
      firstDeficitYear: snaps.firstDeficitYear ?? null,
      cumulativeDeficit: snaps.cumulativeDeficit ?? 0,
      peakNetWorth: Math.max(...snaps.map(s => s.totalNetWorth)),
      viability: deficitYears.length === 0 ? 'viable' : deficitYears.length < 5 ? 'at-risk' : 'critical',
    }
  } catch {
    return null
  }
}

const METRICS = [
  { key: 'retirementYear', label: 'Retirement year', format: v => v ?? '—', better: 'lower' },
  { key: 'retirementAge', label: 'Retirement age', format: v => v ?? '—', better: 'lower' },
  { key: 'netWorthAtRetirement', label: 'Net worth at retirement', format: fmt$, better: 'higher' },
  { key: 'liquidAtRetirement', label: 'Liquid assets at retirement', format: fmt$, better: 'higher' },
  { key: 'netWorthAtEnd', label: 'Net worth at plan end', format: fmt$, better: 'higher' },
  { key: 'liquidAtEnd', label: 'Liquid assets at plan end', format: fmt$, better: 'higher' },
  { key: 'peakNetWorth', label: 'Peak net worth', format: fmt$, better: 'higher' },
  { key: 'deficitCount', label: 'Deficit years', format: v => v || 'None', better: 'lower' },
  { key: 'firstDeficitYear', label: 'First deficit year', format: v => v ?? 'None', better: 'higher' },
  { key: 'cumulativeDeficit', label: 'Cumulative shortfall', format: v => v > 0 ? fmt$(v) : 'None', better: 'lower' },
]

function WinIndicator({ isWinner }) {
  if (!isWinner) return null
  return <span className="ml-1.5 text-green-400 text-xs">&#x2713;</span>
}

function GuideBox({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card">
      <button
        className="w-full flex items-center gap-1.5 text-left text-sm text-gray-500 hover:text-gray-300"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-xs">{open ? '▾' : '▸'}</span>
        How this page works
      </button>
      {open && <p className="mt-3 text-sm text-gray-400 leading-relaxed">{children}</p>}
    </div>
  )
}

// Colours: A = brand blue, B = emerald
const COLOR_A = '#0ea5e9'  // brand-500
const COLOR_B = '#34d399'  // emerald-400

export default function Compare({ scenarios, displayReal = true }) {
  const [idA, setIdA] = useState(scenarios[0]?.id || '')
  const [idB, setIdB] = useState(scenarios[1]?.id || scenarios[0]?.id || '')
  const [chartView, setChartView] = useState('networth') // networth | liquidity | breakdown
  const [chartRange, setChartRange] = useState('full')

  const scenarioA = scenarios.find(s => s.id === idA)
  const scenarioB = scenarios.find(s => s.id === idB)

  const resultA = useMemo(() => computeResult(scenarioA), [scenarioA])
  const resultB = useMemo(() => computeResult(scenarioB), [scenarioB])

  const currentYear = new Date().getFullYear()
  const inflationRate = scenarioA?.assumptions?.inflationRate ?? 0.025

  const transform = (value, year) => {
    if (!displayReal || value == null) return value
    return value / Math.pow(1 + inflationRate, year - currentYear)
  }

  // Merge both snapshot arrays into one keyed by year for the chart
  const chartData = useMemo(() => {
    if (!resultA?.snaps || !resultB?.snaps) return []
    const yearMap = new Map()

    for (const s of resultA.snaps) {
      yearMap.set(s.year, {
        year: s.year,
        nwA: transform(s.totalNetWorth, s.year),
        liqA: transform(Math.max(0, s.totalLiquidAssets), s.year),
        // Breakdown components for A
        cashA: transform(Math.max(0, s.cashBuffer), s.year),
        sharesA: transform(Math.max(0, s.sharesValue), s.year),
        bondsA: transform(Math.max(0, (s.bondLiquidity ?? 0) + (s.bondPreTenYr ?? 0)), s.year),
        otherA: transform(Math.max(0, s.totalOtherAssetsValue ?? 0), s.year),
        superA: transform(Math.max(0, s.superABalance + s.superBBalance), s.year),
        propA: transform(Math.max(0, s.totalPropertyValue ?? 0), s.year),
      })
    }

    for (const s of resultB.snaps) {
      const existing = yearMap.get(s.year) || { year: s.year }
      existing.nwB = transform(s.totalNetWorth, s.year)
      existing.liqB = transform(Math.max(0, s.totalLiquidAssets), s.year)
      // Breakdown components for B
      existing.cashB = transform(Math.max(0, s.cashBuffer), s.year)
      existing.sharesB = transform(Math.max(0, s.sharesValue), s.year)
      existing.bondsB = transform(Math.max(0, (s.bondLiquidity ?? 0) + (s.bondPreTenYr ?? 0)), s.year)
      existing.otherB = transform(Math.max(0, s.totalOtherAssetsValue ?? 0), s.year)
      existing.superB = transform(Math.max(0, s.superABalance + s.superBBalance), s.year)
      existing.propB = transform(Math.max(0, s.totalPropertyValue ?? 0), s.year)
      yearMap.set(s.year, existing)
    }

    return Array.from(yearMap.values()).sort((a, b) => a.year - b.year)
  }, [resultA, resultB, displayReal, inflationRate, currentYear])

  function rangeFilter(data) {
    if (chartRange === 'full') return data
    return data.filter(d => d.year <= currentYear + Number(chartRange))
  }

  const nameA = resultA?.name || 'Scenario A'
  const nameB = resultB?.name || 'Scenario B'

  const badgeCls = v => ({
    viable: 'badge-viable',
    'at-risk': 'badge-at-risk',
    critical: 'badge-critical',
  }[v] || 'badge-critical')

  const badgeLabel = v => ({
    viable: 'Viable',
    'at-risk': 'At Risk',
    critical: 'Not Viable',
  }[v] || 'Not Viable')

  function isWinner(metric, valA, valB) {
    if (valA == null || valB == null) return [false, false]
    const numA = typeof valA === 'number' ? valA : 0
    const numB = typeof valB === 'number' ? valB : 0
    if (numA === numB) return [false, false]
    if (metric.better === 'higher') return [numA > numB, numB > numA]
    if (metric.better === 'lower') return [numA < numB && numA !== 0, numB < numA && numB !== 0]
    return [false, false]
  }

  if (scenarios.length < 2) {
    return (
      <div className="px-6 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white">Compare Scenarios</h1>
        <div className="card">
          <p className="text-gray-400 text-sm">
            Create at least 2 scenarios to compare them side by side.
            Use the + New Scenario card above to add another.
          </p>
        </div>
      </div>
    )
  }

  const tooltipStyle = {
    contentStyle: { background: '#111827', border: '1px solid #374151', borderRadius: 8 },
    labelStyle: { color: '#f9fafb' },
  }

  return (
    <div className="px-4 py-4 space-y-4">
      <GuideBox>
        Compare two scenarios head to head. Select a scenario in each column and see key metrics side by side.
        Green checkmarks indicate which scenario performs better for each metric. The overlay chart shows both
        plans on the same axes — toggle between net worth, liquidity, and breakdown views.
      </GuideBox>

      <h1 className="text-2xl font-bold text-white">Compare Scenarios</h1>

      {/* Scenario selectors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Scenario A</label>
          <select className="input w-full" value={idA} onChange={e => setIdA(e.target.value)}>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Scenario B</label>
          <select className="input w-full" value={idB} onChange={e => setIdB(e.target.value)}>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* Viability badges */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLOR_A }} />
            <span className="text-sm font-semibold text-white">{nameA}</span>
          </div>
          {resultA && <span className={`${badgeCls(resultA.viability)} text-xs`}>{badgeLabel(resultA.viability)}</span>}
        </div>
        <div className="card flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLOR_B }} />
            <span className="text-sm font-semibold text-white">{nameB}</span>
          </div>
          {resultB && <span className={`${badgeCls(resultB.viability)} text-xs`}>{badgeLabel(resultB.viability)}</span>}
        </div>
      </div>

      {/* Overlay chart */}
      {resultA && resultB && chartData.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-300">
                {chartView === 'networth' ? 'Net Worth' : chartView === 'liquidity' ? 'Liquidity' : 'Breakdown'}
              </h2>
              <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
                {[
                  { id: 'networth', label: 'Net Worth' },
                  { id: 'liquidity', label: 'Liquidity' },
                  { id: 'breakdown', label: 'Breakdown' },
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
            <select
              value={chartRange}
              onChange={e => setChartRange(e.target.value)}
              className="input text-xs py-1 px-2 h-7"
            >
              <option value="10">Next 10 years</option>
              <option value="20">Next 20 years</option>
              <option value="40">Next 40 years</option>
              <option value="full">Full plan</option>
            </select>
          </div>
          <p className="text-xs text-gray-600 mb-4">
            Y-axis: {displayReal ? "today's dollars" : "nominal (projected)"}
          </p>

          <ResponsiveContainer width="100%" height={320}>
            {chartView === 'networth' ? (
              <AreaChart data={rangeFilter(chartData)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip formatter={(v, name) => [fmt$(v), name]} {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                {resultA.retirementYear && <ReferenceLine x={resultA.retirementYear} stroke={COLOR_A} strokeDasharray="4 4" strokeOpacity={0.5} />}
                {resultB.retirementYear && resultB.retirementYear !== resultA.retirementYear && (
                  <ReferenceLine x={resultB.retirementYear} stroke={COLOR_B} strokeDasharray="4 4" strokeOpacity={0.5} />
                )}
                <Area type="monotone" dataKey="nwA" stroke={COLOR_A} fill={COLOR_A} fillOpacity={0.15} strokeWidth={2} name={nameA} dot={false} />
                <Area type="monotone" dataKey="nwB" stroke={COLOR_B} fill={COLOR_B} fillOpacity={0.15} strokeWidth={2} name={nameB} dot={false} />
              </AreaChart>
            ) : chartView === 'liquidity' ? (
              <AreaChart data={rangeFilter(chartData)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip formatter={(v, name) => [fmt$(v), name]} {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                {resultA.retirementYear && <ReferenceLine x={resultA.retirementYear} stroke={COLOR_A} strokeDasharray="4 4" strokeOpacity={0.5} />}
                {resultB.retirementYear && resultB.retirementYear !== resultA.retirementYear && (
                  <ReferenceLine x={resultB.retirementYear} stroke={COLOR_B} strokeDasharray="4 4" strokeOpacity={0.5} />
                )}
                <Area type="monotone" dataKey="liqA" stroke={COLOR_A} fill={COLOR_A} fillOpacity={0.15} strokeWidth={2} name={nameA} dot={false} />
                <Area type="monotone" dataKey="liqB" stroke={COLOR_B} fill={COLOR_B} fillOpacity={0.15} strokeWidth={2} name={nameB} dot={false} />
              </AreaChart>
            ) : (
              <AreaChart data={rangeFilter(chartData)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip formatter={(v, name) => [fmt$(v), name]} {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                {/* A — solid lines */}
                <Area type="monotone" dataKey="cashA" stackId="a" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.4} name={`${nameA} Cash`} />
                <Area type="monotone" dataKey="sharesA" stackId="a" stroke="#34d399" fill="#34d399" fillOpacity={0.4} name={`${nameA} Shares`} />
                <Area type="monotone" dataKey="bondsA" stackId="a" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.4} name={`${nameA} Bonds`} />
                <Area type="monotone" dataKey="otherA" stackId="a" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.4} name={`${nameA} Other`} />
                <Area type="monotone" dataKey="superA" stackId="a" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.4} name={`${nameA} Super`} />
                <Area type="monotone" dataKey="propA" stackId="a" stroke="#fb923c" fill="#fb923c" fillOpacity={0.4} name={`${nameA} Property`} />
                {/* B — dashed lines, lower opacity */}
                <Area type="monotone" dataKey="cashB" stackId="b" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.15} strokeDasharray="4 4" name={`${nameB} Cash`} />
                <Area type="monotone" dataKey="sharesB" stackId="b" stroke="#34d399" fill="#34d399" fillOpacity={0.15} strokeDasharray="4 4" name={`${nameB} Shares`} />
                <Area type="monotone" dataKey="bondsB" stackId="b" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.15} strokeDasharray="4 4" name={`${nameB} Bonds`} />
                <Area type="monotone" dataKey="otherB" stackId="b" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.15} strokeDasharray="4 4" name={`${nameB} Other`} />
                <Area type="monotone" dataKey="superB" stackId="b" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeDasharray="4 4" name={`${nameB} Super`} />
                <Area type="monotone" dataKey="propB" stackId="b" stroke="#fb923c" fill="#fb923c" fillOpacity={0.15} strokeDasharray="4 4" name={`${nameB} Property`} />
              </AreaChart>
            )}
          </ResponsiveContainer>
          {chartView === 'breakdown' && (
            <p className="mt-2 text-xs text-gray-600">
              Solid fills = {nameA}. Dashed = {nameB}. Same colours per asset class.
            </p>
          )}
        </div>
      )}

      {/* Comparison table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-4 text-gray-500 font-medium w-1/3">Metric</th>
              <th className="text-right py-3 px-4 text-brand-400 font-medium w-1/3">{nameA}</th>
              <th className="text-right py-3 px-4 text-brand-400 font-medium w-1/3">{nameB}</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map(metric => {
              const valA = resultA?.[metric.key]
              const valB = resultB?.[metric.key]
              const [winA, winB] = isWinner(metric, valA, valB)
              return (
                <tr key={metric.key} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="py-2.5 px-4 text-gray-400">{metric.label}</td>
                  <td className={`py-2.5 px-4 text-right font-medium tabular-nums ${winA ? 'text-green-400' : 'text-gray-200'}`}>
                    {resultA ? metric.format(valA) : '—'}
                    <WinIndicator isWinner={winA} />
                  </td>
                  <td className={`py-2.5 px-4 text-right font-medium tabular-nums ${winB ? 'text-green-400' : 'text-gray-200'}`}>
                    {resultB ? metric.format(valB) : '—'}
                    <WinIndicator isWinner={winB} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Delta summary */}
      {resultA && resultB && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Difference</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'End net worth', delta: resultA.netWorthAtEnd - resultB.netWorthAtEnd },
              { label: 'Liquid at retirement', delta: (resultA.liquidAtRetirement ?? 0) - (resultB.liquidAtRetirement ?? 0) },
              { label: 'Deficit years', delta: resultA.deficitCount - resultB.deficitCount },
            ].map(({ label, delta }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-lg font-bold ${
                  delta === 0 ? 'text-gray-400'
                    : label === 'Deficit years'
                      ? (delta < 0 ? 'text-green-400' : 'text-red-400')
                      : (delta > 0 ? 'text-green-400' : 'text-red-400')
                }`}>
                  {label === 'Deficit years'
                    ? (delta === 0 ? '0' : `${delta > 0 ? '+' : ''}${delta}`)
                    : (delta === 0 ? '$0' : `${delta > 0 ? '+' : ''}${fmt$(delta)}`)
                  }
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">A vs B</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
