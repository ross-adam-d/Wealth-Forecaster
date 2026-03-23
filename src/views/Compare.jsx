import { useState, useMemo } from 'react'
import { runSimulation, solveRetirementDate } from '../engine/simulationEngine.js'

function fmt$(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

function computeMetrics(scenario) {
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

export default function Compare({ scenarios }) {
  const [idA, setIdA] = useState(scenarios[0]?.id || '')
  const [idB, setIdB] = useState(scenarios[1]?.id || scenarios[0]?.id || '')

  const scenarioA = scenarios.find(s => s.id === idA)
  const scenarioB = scenarios.find(s => s.id === idB)

  const metricsA = useMemo(() => computeMetrics(scenarioA), [scenarioA])
  const metricsB = useMemo(() => computeMetrics(scenarioB), [scenarioB])

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

  return (
    <div className="px-4 py-4 space-y-4">
      <GuideBox>
        Compare two scenarios head to head. Select a scenario in each column and see key metrics side by side.
        Green checkmarks indicate which scenario performs better for each metric. Adjust your scenarios in the
        Household and Assumptions pages, then return here to see the impact.
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
          <span className="text-sm font-semibold text-white">{metricsA?.name || '—'}</span>
          {metricsA && <span className={`${badgeCls(metricsA.viability)} text-xs`}>{badgeLabel(metricsA.viability)}</span>}
        </div>
        <div className="card flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{metricsB?.name || '—'}</span>
          {metricsB && <span className={`${badgeCls(metricsB.viability)} text-xs`}>{badgeLabel(metricsB.viability)}</span>}
        </div>
      </div>

      {/* Comparison table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-4 text-gray-500 font-medium w-1/3">Metric</th>
              <th className="text-right py-3 px-4 text-brand-400 font-medium w-1/3">{metricsA?.name || 'Scenario A'}</th>
              <th className="text-right py-3 px-4 text-brand-400 font-medium w-1/3">{metricsB?.name || 'Scenario B'}</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map(metric => {
              const valA = metricsA?.[metric.key]
              const valB = metricsB?.[metric.key]
              const [winA, winB] = isWinner(metric, valA, valB)
              return (
                <tr key={metric.key} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="py-2.5 px-4 text-gray-400">{metric.label}</td>
                  <td className={`py-2.5 px-4 text-right font-medium tabular-nums ${winA ? 'text-green-400' : 'text-gray-200'}`}>
                    {metricsA ? metric.format(valA) : '—'}
                    <WinIndicator isWinner={winA} />
                  </td>
                  <td className={`py-2.5 px-4 text-right font-medium tabular-nums ${winB ? 'text-green-400' : 'text-gray-200'}`}>
                    {metricsB ? metric.format(valB) : '—'}
                    <WinIndicator isWinner={winB} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Delta summary */}
      {metricsA && metricsB && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Difference</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'End net worth', delta: metricsA.netWorthAtEnd - metricsB.netWorthAtEnd },
              { label: 'Liquid at retirement', delta: (metricsA.liquidAtRetirement ?? 0) - (metricsB.liquidAtRetirement ?? 0) },
              { label: 'Deficit years', delta: metricsA.deficitCount - metricsB.deficitCount },
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
