import { useState, useMemo } from 'react'
import { useSimulation } from '../hooks/useSimulation.js'
import { solveRetirementDate } from '../engine/simulationEngine.js'

function GuideBox({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-800 px-4 py-3">
      <button
        className="w-full flex items-center gap-1.5 text-left text-xs text-gray-500 hover:text-gray-300"
        onClick={() => setOpen(o => !o)}
      >
        <span>{open ? '▾' : '▸'}</span>
        How this page works
      </button>
      {open && <p className="mt-2 text-xs text-gray-400 leading-relaxed">{children}</p>}
    </div>
  )
}

const LEVER_GROUPS = [
  {
    id: 'interest_rates',
    label: 'Interest Rates',
    levers: [
      { id: 'globalRate', label: 'Global rate override', type: 'slider', min: -3, max: 3, step: 0.25, unit: '%', default: 0 },
    ],
  },
  {
    id: 'expenses',
    label: 'Expenses',
    levers: [
      { id: 'discretionary', label: 'Discretionary expenses', type: 'slider', min: -50, max: 50, step: 5, unit: '%', default: 0 },
      { id: 'fixed', label: 'Fixed expenses', type: 'slider', min: -20, max: 20, step: 5, unit: '%', default: 0 },
    ],
  },
  {
    id: 'returns',
    label: 'Investment Returns',
    levers: [
      { id: 'sharesReturn', label: 'Share portfolio', type: 'slider', min: 4, max: 12, step: 0.5, unit: '%', default: 8 },
      { id: 'superReturn', label: 'Super accumulation', type: 'slider', min: 4, max: 10, step: 0.5, unit: '%', default: 7 },
      { id: 'propertyGrowth', label: 'Property growth', type: 'slider', min: 2, max: 8, step: 0.5, unit: '%', default: 4 },
      { id: 'inflation', label: 'Inflation', type: 'slider', min: 1.5, max: 5, step: 0.5, unit: '%', default: 2.5 },
    ],
  },
  {
    id: 'salary',
    label: 'Salary / Income',
    levers: [
      { id: 'salaryA', label: 'Person A salary', type: 'slider', min: -30, max: 50, step: 5, unit: '%', default: 0 },
      { id: 'salaryB', label: 'Person B salary', type: 'slider', min: -30, max: 50, step: 5, unit: '%', default: 0 },
    ],
  },
  {
    id: 'retirement_age',
    label: 'Retirement Age',
    levers: [
      { id: 'retireAgeA', label: 'Person A retirement age', type: 'slider', min: 45, max: 70, step: 1, unit: 'yrs', default: 60 },
      { id: 'retireAgeB', label: 'Person B retirement age', type: 'slider', min: 45, max: 70, step: 1, unit: 'yrs', default: 60 },
    ],
  },
  {
    id: 'contributions',
    label: 'Contribution Rates',
    levers: [
      { id: 'salarySacrificePct', label: 'Salary sacrifice %', type: 'slider', min: 0, max: 15, step: 1, unit: '%', default: 0 },
    ],
  },
]

function fmt$(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

function DeltaChip({ base, adjusted }) {
  if (base == null || adjusted == null) return null
  const delta = adjusted - base
  if (Math.abs(delta) < 100) return null
  const positive = delta > 0
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${positive ? 'text-green-400 bg-green-900/30' : 'text-red-400 bg-red-900/30'}`}>
      {positive ? '+' : ''}{fmt$(delta)}
    </span>
  )
}

function MonthsDelta({ baseYear, adjustedYear }) {
  if (!baseYear || !adjustedYear) return null
  const months = (baseYear - adjustedYear) * 12
  if (months === 0) return <span className="text-gray-500 text-sm">No change</span>
  const earlier = months > 0
  return (
    <span className={`text-2xl font-bold ${earlier ? 'text-green-400' : 'text-red-400'}`}>
      {earlier ? '↑' : '↓'} {Math.abs(months)} months {earlier ? 'earlier' : 'later'}
    </span>
  )
}

export default function ImpactAnalyser({ scenario, snapshots, retirementDate }) {
  const [levers, setLevers] = useState(() => {
    const defaults = {}
    LEVER_GROUPS.forEach(g => g.levers.forEach(l => { defaults[l.id] = l.default }))
    return defaults
  })

  // Build adjusted scenario from levers
  const adjustedScenario = useMemo(() => {
    if (!scenario) return null
    return {
      ...scenario,
      household: {
        ...scenario.household,
        personA: {
          ...scenario.household.personA,
          currentSalary: scenario.household.personA.currentSalary * (1 + (levers.salaryA || 0) / 100),
          retirementAge: levers.retireAgeA || scenario.household.personA.retirementAge,
        },
        personB: {
          ...scenario.household.personB,
          currentSalary: scenario.household.personB.currentSalary * (1 + (levers.salaryB || 0) / 100),
          retirementAge: levers.retireAgeB || scenario.household.personB.retirementAge,
        },
      },
      assumptions: {
        ...scenario.assumptions,
        sharesReturnRate: (levers.sharesReturn || 8) / 100,
        superAccumulationRate: (levers.superReturn || 7) / 100,
        propertyGrowthRate: (levers.propertyGrowth || 4) / 100,
        inflationRate: (levers.inflation || 2.5) / 100,
      },
    }
  }, [scenario, levers])

  const { snapshots: adjustedSnapshots, retirementDate: adjustedRetirementDate } = useSimulation(adjustedScenario, {
    expenses: { discretionary: (levers.discretionary || 0) / 100, fixed: (levers.fixed || 0) / 100 },
  })

  // Summary metrics comparison
  const baseLastSnap = snapshots[snapshots.length - 1]
  const adjLastSnap = adjustedSnapshots[adjustedSnapshots.length - 1]

  const basePeakNetWorth = Math.max(...snapshots.map(s => s.totalNetWorth || 0))
  const adjPeakNetWorth = Math.max(...adjustedSnapshots.map(s => s.totalNetWorth || 0))

  const setLever = (id, value) => setLevers(prev => ({ ...prev, [id]: value }))

  const resetLevers = () => {
    const defaults = {}
    LEVER_GROUPS.forEach(g => g.levers.forEach(l => { defaults[l.id] = l.default }))
    setLevers(defaults)
  }

  return (
    <div className="flex h-[calc(100vh-8rem)]">

      {/* Left: lever panel */}
      <div className="w-80 bg-gray-900 border-r border-gray-800 overflow-y-auto flex-shrink-0">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Levers</h2>
          <button onClick={resetLevers} className="btn-ghost text-xs">Reset</button>
        </div>
        <GuideBox>
          Adjust the levers to see how changes affect your retirement date and wealth outcomes. The results panel on the right updates in real time. The headline metric shows how many months earlier or later you could retire. This is a live scratchpad — your base scenario is unchanged.
        </GuideBox>

        <div className="p-4 space-y-6">
          {LEVER_GROUPS.map(group => (
            <div key={group.id}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{group.label}</h3>
              <div className="space-y-4">
                {group.levers.map(lever => (
                  <div key={lever.id}>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs text-gray-400">{lever.label}</label>
                      <span className="text-xs text-gray-200 font-mono">
                        {lever.type === 'slider' && `${levers[lever.id] ?? lever.default}${lever.unit}`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={lever.min}
                      max={lever.max}
                      step={lever.step}
                      value={levers[lever.id] ?? lever.default}
                      onChange={e => setLever(lever.id, Number(e.target.value))}
                      className="w-full accent-brand-500"
                    />
                    <div className="flex justify-between text-xs text-gray-600 mt-0.5">
                      <span>{lever.min}{lever.unit}</span>
                      <span>{lever.max}{lever.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: diff view */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Headline metric */}
        <div className="card text-center py-8">
          <p className="text-gray-500 text-sm mb-2">Retirement date delta</p>
          <MonthsDelta baseYear={retirementDate?.retirementYear} adjustedYear={adjustedRetirementDate?.retirementYear} />
          <div className="flex justify-center gap-12 mt-4 text-sm text-gray-400">
            <div>
              <div className="text-xs text-gray-600 mb-0.5">Base</div>
              <div className="text-white font-medium">{retirementDate?.retirementYear ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-0.5">Adjusted</div>
              <div className="text-white font-medium">{adjustedRetirementDate?.retirementYear ?? '—'}</div>
            </div>
          </div>
        </div>

        {/* Supporting metrics table */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Supporting Metrics</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-2 text-gray-500 font-medium">Metric</th>
                <th className="text-right py-2 text-gray-500 font-medium">Base</th>
                <th className="text-right py-2 text-gray-500 font-medium">Adjusted</th>
                <th className="text-right py-2 text-gray-500 font-medium">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {[
                { label: 'Retirement year', base: retirementDate?.retirementYear, adj: adjustedRetirementDate?.retirementYear, format: v => v ?? '—' },
                { label: 'Peak net worth', base: basePeakNetWorth, adj: adjPeakNetWorth, format: fmt$ },
                { label: 'Super A at retirement', base: snapshots.find(s => s.retiredA)?.superABalance, adj: adjustedSnapshots.find(s => s.retiredA)?.superABalance, format: fmt$ },
                { label: 'Super B at retirement', base: snapshots.find(s => s.retiredB)?.superBBalance, adj: adjustedSnapshots.find(s => s.retiredB)?.superBBalance, format: fmt$ },
              ].map(row => (
                <tr key={row.label}>
                  <td className="py-2 text-gray-400">{row.label}</td>
                  <td className="py-2 text-right text-gray-200">{row.format(row.base)}</td>
                  <td className="py-2 text-right text-gray-200">{row.format(row.adj)}</td>
                  <td className="py-2 text-right">
                    {typeof row.base === 'number' && typeof row.adj === 'number'
                      ? <DeltaChip base={row.base} adjusted={row.adj} />
                      : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-600">
          Adjusted values are a live scratchpad — save as new scenario to preserve them.
        </p>
      </div>
    </div>
  )
}
