import { useState, useMemo } from 'react'
import { runSimulation } from '../engine/simulationEngine.js'
import { Tutorial, useTutorial, TutorialButton } from '../components/Tutorial.jsx'
import { applyRealNominal } from '../utils/format.js'

function fmt$(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

const TUTORIAL_STEPS = [
  {
    title: 'Welcome to Goal Planner',
    body: 'This tool lets you set a target retirement age and explore what it would take to make it viable. Everything here is a live scratchpad — your saved scenarios are never changed.',
  },
  {
    title: 'Set your target age',
    body: 'Use the big number in the centre, the +/- buttons, or the slider to pick your ideal retirement age. The number turns green when the plan is viable, red when it\'s not.',
  },
  {
    title: 'Adjust the levers',
    body: 'Use the sliders on the left to tweak pre/post-retirement expenses, pre-retirement income, and investment returns. Toggle between $ and % for expenses and income.',
  },
  {
    title: 'Read the metrics',
    body: 'The cards below the age show liquid assets at retirement, minimum lifetime liquidity, deficit years, and more. Green = healthy, amber = tight, red = problem.',
  },
  {
    title: 'Choose a baseline',
    body: 'If you have multiple scenarios, use the dropdown at the top of the lever panel to pick which one to start from. The baseline comparison line shows the earliest viable age without any adjustments.',
  },
]

const LEVER_DEFS = [
  {
    id: 'preRetirementExpenses',
    label: 'Pre-retirement expenses',
    group: 'expenses',
    min: -50, max: 50, step: 5, defaultPct: 0,
    minDollar: -50000, maxDollar: 50000, stepDollar: 2500,
  },
  {
    id: 'postRetirementExpenses',
    label: 'Post-retirement expenses',
    group: 'expenses',
    min: -50, max: 50, step: 5, defaultPct: 0,
    minDollar: -50000, maxDollar: 50000, stepDollar: 2500,
  },
  {
    id: 'preRetirementIncome',
    label: 'Pre-retirement income',
    group: 'income',
    min: -30, max: 50, step: 5, defaultPct: 0,
    minDollar: -50000, maxDollar: 100000, stepDollar: 5000,
  },
  {
    id: 'preRetirementReturns',
    label: 'Pre-retirement returns',
    group: 'returns',
    min: -3, max: 5, step: 0.25, defaultPct: 0,
  },
  {
    id: 'postRetirementReturns',
    label: 'Post-retirement returns',
    group: 'returns',
    min: -3, max: 5, step: 0.25, defaultPct: 0,
  },
]

export default function RetirementGoal({ scenarios, scenario, displayReal = true }) {
  const [showTutorial, setShowTutorial, closeTutorial] = useTutorial('goalTutorialSeen', { waitFor: 'welcomeTutorialSeen' })

  // Baseline scenario selector
  const [baselineId, setBaselineId] = useState(null)
  const baselineScenario = useMemo(() => {
    if (!baselineId) return scenario
    return scenarios?.find(s => s.id === baselineId) || scenario
  }, [baselineId, scenarios, scenario])

  const personA = baselineScenario?.household?.personA
  const birthYearA = personA?.dateOfBirth ? new Date(personA.dateOfBirth).getFullYear() : null

  // Target retirement age — initialise from scenario
  const [targetAge, setTargetAge] = useState(() => personA?.retirementAge || 60)

  // Lever modes: 'pct' or 'dollar'
  const [leverModes, setLeverModes] = useState(() => {
    const modes = {}
    LEVER_DEFS.forEach(l => { modes[l.id] = 'pct' })
    return modes
  })

  // Lever values (percentage values stored as raw numbers, dollar values stored as raw numbers)
  const [leverValues, setLeverValues] = useState(() => {
    const vals = {}
    LEVER_DEFS.forEach(l => { vals[l.id] = { pct: l.defaultPct, dollar: 0 } })
    return vals
  })

  const setLeverValue = (id, mode, value) => {
    setLeverValues(prev => ({
      ...prev,
      [id]: { ...prev[id], [mode]: value },
    }))
  }

  const toggleMode = (id) => {
    setLeverModes(prev => ({
      ...prev,
      [id]: prev[id] === 'pct' ? 'dollar' : 'pct',
    }))
  }

  const resetAll = () => {
    const vals = {}
    LEVER_DEFS.forEach(l => { vals[l.id] = { pct: l.defaultPct, dollar: 0 } })
    setLeverValues(vals)
  }

  // Get the active value for a lever
  const getLeverValue = (id) => {
    const mode = leverModes[id]
    return leverValues[id]?.[mode] ?? 0
  }

  // Build adjusted scenario + lever adjustments
  const { adjustedSnapshots, baselineSnapshots } = useMemo(() => {
    if (!baselineScenario?.household) return { adjustedSnapshots: [], baselineSnapshots: [] }

    // Baseline run with current scenario retirement age
    const baseSnaps = runSimulation(baselineScenario)

    // Compute total baseline expenses for $ → % conversion
    const baseFirstYear = baseSnaps[0]
    const baseAnnualExpenses = baseFirstYear?.totalExpenses || 50000

    // Build expense adjustments — convert $ to % if needed
    function resolveExpenseAdj(leverId) {
      const mode = leverModes[leverId]
      const val = leverValues[leverId]?.[mode] ?? 0
      if (val === 0) return 0
      if (mode === 'pct') return val / 100
      // Dollar mode: convert to % of baseline annual expenses
      return baseAnnualExpenses > 0 ? val / baseAnnualExpenses : 0
    }

    const preExpAdj = resolveExpenseAdj('preRetirementExpenses')
    const postExpAdj = resolveExpenseAdj('postRetirementExpenses')
    const incomeMode = leverModes['preRetirementIncome']
    const incomeRawVal = leverValues['preRetirementIncome']?.[incomeMode] ?? 0
    const preReturnAdj = getLeverValue('preRetirementReturns') / 100
    const postReturnAdj = getLeverValue('postRetirementReturns') / 100

    // Build return overrides — delta applied to base assumptions
    const baseAssumptions = baselineScenario.assumptions || {}
    const preReturnOverride = preReturnAdj !== 0 ? {
      sharesReturnRate: (baseAssumptions.sharesReturnRate || 0.045) + preReturnAdj,
      superAccumulationRate: (baseAssumptions.superAccumulationRate || 0.07) + preReturnAdj,
    } : {}
    const postReturnOverride = postReturnAdj !== 0 ? {
      sharesReturnRate: (baseAssumptions.sharesReturnRate || 0.045) + postReturnAdj,
      superAccumulationRate: (baseAssumptions.superAccumulationRate || 0.07) + postReturnAdj,
      superPensionRate: (baseAssumptions.superPensionRate || 0.06) + postReturnAdj,
    } : {}

    // Build adjusted scenario with target retirement age + income adjustment
    // In $ mode: add flat dollar amount to Person A only (avoids tax-bracket distortion)
    // In % mode: apply proportionally to both people
    const salaryA = baselineScenario.household.personA.currentSalary || 0
    const salaryB = baselineScenario.household.personB?.currentSalary || 0
    let adjSalaryA = salaryA
    let adjSalaryB = salaryB
    if (incomeRawVal !== 0) {
      if (incomeMode === 'dollar') {
        adjSalaryA = salaryA + incomeRawVal
      } else {
        const pctAdj = incomeRawVal / 100
        adjSalaryA = salaryA * (1 + pctAdj)
        adjSalaryB = salaryB * (1 + pctAdj)
      }
    }

    const adjScenario = {
      ...baselineScenario,
      household: {
        ...baselineScenario.household,
        personA: {
          ...baselineScenario.household.personA,
          retirementAge: targetAge,
          currentSalary: adjSalaryA,
        },
        personB: {
          ...baselineScenario.household.personB,
          currentSalary: adjSalaryB,
        },
      },
    }

    const leverAdjustments = {
      expenses: {
        preRetirement: { discretionary: preExpAdj, fixed: preExpAdj },
        postRetirement: { discretionary: postExpAdj, fixed: postExpAdj },
      },
      returns: {
        preRetirement: Object.keys(preReturnOverride).length > 0 ? preReturnOverride : undefined,
        postRetirement: Object.keys(postReturnOverride).length > 0 ? postReturnOverride : undefined,
      },
    }

    const adjSnaps = runSimulation(adjScenario, { leverAdjustments })

    return { adjustedSnapshots: adjSnaps, baselineSnapshots: baseSnaps }
  }, [baselineScenario, targetAge, leverModes, leverValues])

  // Viability
  const isViable = adjustedSnapshots.length > 0 && !adjustedSnapshots.some(s => s.totalLiquidAssets < 0)
  const deficitYears = adjustedSnapshots.deficitYears || []
  const minLiquidity = adjustedSnapshots.length > 0
    ? Math.min(...adjustedSnapshots.map(s => s.totalLiquidAssets ?? 0))
    : 0

  // Real/nominal transform
  const currentYear = new Date().getFullYear()
  const inflationRate = baselineScenario?.assumptions?.inflationRate ?? 0.025
  const tfm = (value, year) => applyRealNominal(value, year, currentYear, inflationRate, displayReal)

  // Supporting metrics
  const retireSnap = adjustedSnapshots.find(s => s.year === (birthYearA ? birthYearA + targetAge : null))
  const lastSnap = adjustedSnapshots[adjustedSnapshots.length - 1]
  const peakNetWorth = adjustedSnapshots.length > 0
    ? Math.max(...adjustedSnapshots.map(s => tfm(s.totalNetWorth || 0, s.year)))
    : 0

  // Baseline retirement solve for comparison
  const baselineRetireAge = useMemo(() => {
    if (!baselineSnapshots.length || !birthYearA || !baselineScenario?.household) return null
    for (let age = 40; age <= 70; age++) {
      const testScenario = {
        ...baselineScenario,
        household: {
          ...baselineScenario.household,
          personA: { ...baselineScenario.household.personA, retirementAge: age },
        },
      }
      const snaps = runSimulation(testScenario)
      if (!snaps.some(s => s.totalLiquidAssets < 0)) return age
    }
    return null
  }, [baselineScenario, baselineSnapshots, birthYearA])

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-8rem)]">
      {showTutorial && <Tutorial steps={TUTORIAL_STEPS} onClose={closeTutorial} />}

      {/* Left panel: levers */}
      <div className="w-full lg:w-80 bg-gray-900 border-b lg:border-b-0 lg:border-r border-gray-800 overflow-y-auto lg:flex-shrink-0">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Adjust Levers</h2>
          <div className="flex items-center gap-2">
            <TutorialButton onClick={() => setShowTutorial(true)} />
            <button onClick={resetAll} className="btn-ghost text-xs">Reset</button>
          </div>
        </div>

        {/* Baseline scenario selector */}
        {scenarios && scenarios.length > 1 && (
          <div className="px-4 pt-4 pb-2">
            <label className="text-xs text-gray-500 uppercase tracking-wide font-semibold block mb-2">Baseline Scenario</label>
            <select
              value={baselineId || ''}
              onChange={e => setBaselineId(e.target.value || null)}
              className="input w-full text-sm"
            >
              <option value="">Current scenario</option>
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>{s.name || s.id}</option>
              ))}
            </select>
          </div>
        )}

        <div className="p-4 space-y-5">
          {/* Expenses group */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Expenses</h3>
            <div className="space-y-4">
              {LEVER_DEFS.filter(l => l.group === 'expenses').map(lever => (
                <LeverSlider
                  key={lever.id}
                  lever={lever}
                  mode={leverModes[lever.id]}
                  value={leverValues[lever.id]?.[leverModes[lever.id]] ?? 0}
                  onToggle={() => toggleMode(lever.id)}
                  onChange={v => setLeverValue(lever.id, leverModes[lever.id], v)}
                  showToggle
                />
              ))}
            </div>
          </div>

          {/* Income group */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Income</h3>
            <div className="space-y-4">
              {LEVER_DEFS.filter(l => l.group === 'income').map(lever => (
                <LeverSlider
                  key={lever.id}
                  lever={lever}
                  mode={leverModes[lever.id]}
                  value={leverValues[lever.id]?.[leverModes[lever.id]] ?? 0}
                  onToggle={() => toggleMode(lever.id)}
                  onChange={v => setLeverValue(lever.id, leverModes[lever.id], v)}
                  showToggle
                />
              ))}
            </div>
          </div>

          {/* Returns group */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Investment Returns</h3>
            <div className="space-y-4">
              {LEVER_DEFS.filter(l => l.group === 'returns').map(lever => (
                <LeverSlider
                  key={lever.id}
                  lever={lever}
                  mode="pct"
                  value={leverValues[lever.id]?.pct ?? 0}
                  onChange={v => setLeverValue(lever.id, 'pct', v)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right panel: hero + metrics */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Hero: target age */}
        <div className="card text-center py-8">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Target Retirement Age</p>
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={() => setTargetAge(a => Math.max(40, a - 1))}
              className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 text-white text-xl font-bold transition flex items-center justify-center"
            >
              −
            </button>
            <div className={`text-6xl font-bold tabular-nums transition-colors duration-300 ${
              isViable ? 'text-green-400' : 'text-red-400'
            }`}>
              {targetAge}
            </div>
            <button
              onClick={() => setTargetAge(a => Math.min(70, a + 1))}
              className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 text-white text-xl font-bold transition flex items-center justify-center"
            >
              +
            </button>
          </div>
          <input
            type="range"
            min={40}
            max={70}
            step={1}
            value={targetAge}
            onChange={e => setTargetAge(Number(e.target.value))}
            className="w-64 accent-brand-500 mx-auto block"
          />
          <div className="flex justify-between text-xs text-gray-600 w-64 mx-auto mt-1">
            <span>40</span>
            <span>55</span>
            <span>70</span>
          </div>

          {/* Viability badge */}
          <div className="mt-5">
            {isViable ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-green-900/50 text-green-400 border border-green-800">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                Plan Viable
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-red-900/50 text-red-400 border border-red-800">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                Not Viable — {deficitYears.length} deficit year{deficitYears.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Baseline comparison */}
          {baselineRetireAge != null && (
            <p className="text-xs text-gray-500 mt-3">
              Baseline earliest viable retirement: <span className="text-gray-300 font-medium">{baselineRetireAge}</span>
              {targetAge < baselineRetireAge && (
                <span className="text-amber-400 ml-1">({baselineRetireAge - targetAge} year{baselineRetireAge - targetAge !== 1 ? 's' : ''} earlier than baseline)</span>
              )}
              {targetAge > baselineRetireAge && (
                <span className="text-green-400 ml-1">({targetAge - baselineRetireAge} year{targetAge - baselineRetireAge !== 1 ? 's' : ''} later — more buffer)</span>
              )}
            </p>
          )}
        </div>

        {/* Supporting metrics */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Key Metrics at Age {targetAge}</h2>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              label="Liquid assets at retirement"
              value={fmt$(retireSnap ? tfm(retireSnap.totalLiquidAssets, retireSnap.year) : null)}
              status={retireSnap?.totalLiquidAssets > 0 ? 'good' : 'bad'}
            />
            <MetricCard
              label="Net worth at retirement"
              value={fmt$(retireSnap ? tfm(retireSnap.totalNetWorth, retireSnap.year) : null)}
              status={retireSnap?.totalNetWorth > 0 ? 'good' : 'bad'}
            />
            <MetricCard
              label="Minimum liquidity (lifetime)"
              value={fmt$(minLiquidity)}
              status={minLiquidity >= 50000 ? 'good' : minLiquidity >= 0 ? 'warn' : 'bad'}
            />
            <MetricCard
              label="Net worth at end"
              value={fmt$(lastSnap ? tfm(lastSnap.totalNetWorth, lastSnap.year) : null)}
              status={lastSnap?.totalNetWorth > 0 ? 'good' : 'bad'}
            />
            <MetricCard
              label="Peak net worth"
              value={fmt$(peakNetWorth)}
            />
            <MetricCard
              label="Deficit years"
              value={deficitYears.length}
              status={deficitYears.length === 0 ? 'good' : 'bad'}
            />
          </div>
        </div>

        <p className="text-xs text-gray-600">
          This is a live scratchpad — your base scenario is unchanged. Adjust sliders to explore what changes would make your target retirement age viable.
        </p>
      </div>
    </div>
  )
}

function MetricCard({ label, value, status }) {
  const color = status === 'good' ? 'text-green-400'
    : status === 'warn' ? 'text-amber-400'
    : status === 'bad' ? 'text-red-400'
    : 'text-white'

  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
    </div>
  )
}

function LeverSlider({ lever, mode, value, onToggle, onChange, showToggle }) {
  const isPct = mode === 'pct'
  const min = isPct ? lever.min : lever.minDollar
  const max = isPct ? lever.max : lever.maxDollar
  const step = isPct ? lever.step : lever.stepDollar

  // Format display value
  const displayValue = isPct
    ? `${value >= 0 ? '+' : ''}${value}%`
    : `${value >= 0 ? '+' : ''}$${Math.abs(value).toLocaleString()}`

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-xs text-gray-400">{lever.label}</label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-200 font-mono">{displayValue}</span>
          {showToggle && (
            <button
              onClick={onToggle}
              className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition"
            >
              {isPct ? '%' : '$'}
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-brand-500"
      />
      <div className="flex justify-between text-xs text-gray-600 mt-0.5">
        <span>{isPct ? `${min}%` : `$${min.toLocaleString()}`}</span>
        <span>{isPct ? `${max}%` : `$${max.toLocaleString()}`}</span>
      </div>
    </div>
  )
}
