import { useState, useMemo } from 'react'
import { Tutorial, useTutorial, TutorialButton } from '../components/Tutorial.jsx'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { runSimulation } from '../engine/simulationEngine.js'

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
    const personA = scenario.household.personA
    const birthYear = personA.dateOfBirth ? new Date(personA.dateOfBirth).getFullYear() : null
    const retireAge = personA.retirementAge ?? null
    const retireYear = (birthYear && retireAge) ? birthYear + retireAge : null
    const last = snaps[snaps.length - 1]
    const deficitYears = snaps.deficitYears || []
    const retireSnap = retireYear ? snaps.find(s => s.year === retireYear) : null
    const peakSnap = snaps.reduce((best, s) => s.totalNetWorth > best.totalNetWorth ? s : best, snaps[0])

    return {
      name: scenario.name,
      snaps,
      retirementYear: retireYear,
      retirementAge: retireAge,
      lastYear: last?.year ?? new Date().getFullYear(),
      peakYear: peakSnap?.year ?? new Date().getFullYear(),
      netWorthAtEnd: last?.totalNetWorth ?? 0,
      netWorthAtRetirement: retireSnap?.totalNetWorth ?? null,
      liquidAtRetirement: retireSnap?.totalLiquidAssets ?? null,
      liquidAtEnd: last?.totalLiquidAssets ?? 0,
      deficitCount: deficitYears.length,
      firstDeficitYear: snaps.firstDeficitYear ?? null,
      cumulativeDeficit: snaps.cumulativeDeficit ?? 0,
      peakNetWorth: peakSnap?.totalNetWorth ?? 0,
      viability: deficitYears.length === 0 ? 'viable' : deficitYears.length < 5 ? 'at-risk' : 'critical',
    }
  } catch {
    return null
  }
}

const METRICS = [
  { key: 'retirementYear',        label: 'Retirement year',            format: v => v ?? '—',                    better: 'lower' },
  { key: 'retirementAge',         label: 'Retirement age',             format: v => v ?? '—',                    better: 'lower' },
  { key: 'netWorthAtRetirement',  label: 'Net worth at retirement',     format: fmt$, better: 'higher', yearKey: 'retirementYear' },
  { key: 'liquidAtRetirement',    label: 'Liquid assets at retirement', format: fmt$, better: 'higher', yearKey: 'retirementYear' },
  { key: 'netWorthAtEnd',         label: 'Net worth at plan end',       format: fmt$, better: 'higher', yearKey: 'lastYear' },
  { key: 'liquidAtEnd',           label: 'Liquid assets at plan end',   format: fmt$, better: 'higher', yearKey: 'lastYear' },
  { key: 'peakNetWorth',          label: 'Peak net worth',              format: fmt$, better: 'higher', yearKey: 'peakYear' },
  { key: 'deficitCount',          label: 'Deficit years',               format: v => v || 'None',                better: 'lower' },
  { key: 'firstDeficitYear',      label: 'First deficit year',          format: v => v ?? 'None',                better: 'higher' },
  { key: 'cumulativeDeficit',     label: 'Cumulative shortfall',        format: v => v > 0 ? fmt$(v) : 'None',  better: 'lower' },
]

function NonViableIndicator({ show }) {
  if (!show) return null
  return <span className="ml-1.5 text-red-400 text-xs">&#x2717;</span>
}

const COMPARE_TUTORIAL = [
  {
    title: 'Compare Scenarios',
    body: 'This page lets you compare two saved scenarios side by side. Select one scenario in each column to see how they stack up on key metrics.',
  },
  {
    title: 'Metric comparison',
    body: 'Green checkmarks highlight which scenario performs better for each metric — retirement age, net worth, liquidity, and deficit years.',
  },
  {
    title: 'Overlay chart',
    body: 'The chart at the bottom overlays both scenarios on the same axes. Toggle between net worth, liquidity, and breakdown views to compare trends over time.',
  },
]

// Colours: A = brand blue, B = emerald
const COLOR_A = '#0ea5e9'  // brand-500
const COLOR_B = '#34d399'  // emerald-400

export default function Compare({ scenarios, displayReal = true }) {
  const [showTutorial, setShowTutorial, closeTutorial] = useTutorial('compareTutorialSeen', { waitFor: 'welcomeTutorialSeen' })
  const [idA, setIdA] = useState(scenarios[0]?.id || '')
  const [idB, setIdB] = useState(scenarios[1]?.id || scenarios[0]?.id || '')
  const [chartView, setChartView] = useState('networth') // networth | liquidity
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
        tbA: transform(Math.max(0, s.treasuryBondsValue ?? 0), s.year),
        commA: transform(Math.max(0, s.commoditiesValue ?? 0), s.year),
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
      existing.tbB = transform(Math.max(0, s.treasuryBondsValue ?? 0), s.year)
      existing.commB = transform(Math.max(0, s.commoditiesValue ?? 0), s.year)
      existing.bondsB = transform(Math.max(0, (s.bondLiquidity ?? 0) + (s.bondPreTenYr ?? 0)), s.year)
      existing.otherB = transform(Math.max(0, s.totalOtherAssetsValue ?? 0), s.year)
      existing.superB = transform(Math.max(0, s.superABalance + s.superBBalance), s.year)
      existing.propB = transform(Math.max(0, s.totalPropertyValue ?? 0), s.year)
      yearMap.set(s.year, existing)
    }

    return Array.from(yearMap.values()).sort((a, b) => a.year - b.year)
  }, [resultA, resultB, displayReal, inflationRate, currentYear])

  // Determine the plan end year (last year of the longer scenario)
  const planEndYear = useMemo(() => {
    const lastA = resultA?.snaps?.[resultA.snaps.length - 1]?.year ?? currentYear
    const lastB = resultB?.snaps?.[resultB.snaps.length - 1]?.year ?? currentYear
    return Math.max(lastA, lastB)
  }, [resultA, resultB, currentYear])

  function rangeFilter(data) {
    if (chartRange === 'full') return data.filter(d => d.year <= planEndYear)
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
      {showTutorial && <Tutorial steps={COMPARE_TUTORIAL} onClose={closeTutorial} />}

      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-white">Compare Scenarios</h1>
        <TutorialButton onClick={() => setShowTutorial(true)} />
      </div>

      {/* Scenario selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                {chartView === 'networth' ? 'Net Worth' : 'Liquidity'}
              </h2>
              <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
                {[
                  { id: 'networth', label: 'Net Worth' },
                  { id: 'liquidity', label: 'Liquidity' },
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
            <LineChart data={rangeFilter(chartData)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="year" type="number" domain={['dataMin', 'dataMax']} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip formatter={(v, name) => [fmt$(v), name]} {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
              {resultA.retirementYear && <ReferenceLine x={resultA.retirementYear} stroke={COLOR_A} strokeDasharray="4 4" strokeOpacity={0.5} />}
              {resultB.retirementYear && resultB.retirementYear !== resultA.retirementYear && (
                <ReferenceLine x={resultB.retirementYear} stroke={COLOR_B} strokeDasharray="4 4" strokeOpacity={0.5} />
              )}
              <Line
                type="monotone"
                dataKey={chartView === 'networth' ? 'nwA' : 'liqA'}
                stroke={COLOR_A}
                strokeWidth={2.5}
                name={nameA}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey={chartView === 'networth' ? 'nwB' : 'liqB'}
                stroke={COLOR_B}
                strokeWidth={2.5}
                name={nameB}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
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
              const rawA = resultA?.[metric.key]
              const rawB = resultB?.[metric.key]
              // Apply real/nominal transform to monetary metrics using the relevant year
              const yearA = metric.yearKey ? resultA?.[metric.yearKey] : null
              const yearB = metric.yearKey ? resultB?.[metric.yearKey] : null
              const valA = (metric.yearKey && yearA != null) ? transform(rawA, yearA) : rawA
              const valB = (metric.yearKey && yearB != null) ? transform(rawB, yearB) : rawB
              // Only flag non-viable: deficit years > 0, or has a first deficit year, or has cumulative shortfall
              const nonViableA = (metric.key === 'deficitCount' && rawA > 0)
                || (metric.key === 'firstDeficitYear' && rawA != null)
                || (metric.key === 'cumulativeDeficit' && rawA > 0)
              const nonViableB = (metric.key === 'deficitCount' && rawB > 0)
                || (metric.key === 'firstDeficitYear' && rawB != null)
                || (metric.key === 'cumulativeDeficit' && rawB > 0)
              return (
                <tr key={metric.key} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="py-2.5 px-4 text-gray-400">{metric.label}</td>
                  <td className={`py-2.5 px-4 text-right font-medium tabular-nums ${nonViableA ? 'text-red-400' : 'text-gray-200'}`}>
                    {resultA ? metric.format(valA) : '—'}
                    <NonViableIndicator show={nonViableA} />
                  </td>
                  <td className={`py-2.5 px-4 text-right font-medium tabular-nums ${nonViableB ? 'text-red-400' : 'text-gray-200'}`}>
                    {resultB ? metric.format(valB) : '—'}
                    <NonViableIndicator show={nonViableB} />
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
              { label: 'End net worth', delta: transform(resultA.netWorthAtEnd, resultA.lastYear) - transform(resultB.netWorthAtEnd, resultB.lastYear) },
              { label: 'Liquid at retirement', delta: transform(resultA.liquidAtRetirement ?? 0, resultA.retirementYear ?? resultA.lastYear) - transform(resultB.liquidAtRetirement ?? 0, resultB.retirementYear ?? resultB.lastYear) },
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
