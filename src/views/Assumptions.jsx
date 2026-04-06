import { useState } from 'react'
import { Tutorial, useTutorial, TutorialButton } from '../components/Tutorial.jsx'
import {
  INFLATION_RATE, WAGE_GROWTH_RATE, SUPER_ACCUMULATION_RATE, SUPER_PENSION_RATE,
  SHARES_RETURN_RATE, PROPERTY_GROWTH_RATE, DIVIDEND_YIELD, DEFAULT_FRANKING_PCT,
  INVESTMENT_BOND_RETURN_RATE,
  CONCESSIONAL_CAP, NON_CONCESSIONAL_CAP, PRESERVATION_AGE, MAX_SIMULATION_END_AGE,
} from '../constants/index.js'

function Row({ label, value, field, onUpdate, type = 'pct', min, max, step = 0.1, hint }) {
  const display = type === 'pct' ? `${(value * 100).toFixed(1)}%` : `${value}`

  return (
    <tr className="border-b border-gray-800/50">
      <td className="py-3 px-4 text-sm">
        <span className="text-gray-300">{label}</span>
        {hint && <span className="block text-xs text-gray-600 mt-0.5">{hint}</span>}
      </td>
      <td className="py-3 px-4 text-right">
        {field ? (
          <div className="flex items-center justify-end gap-2">
            <input
              type="range"
              min={min ?? 0}
              max={max ?? (type === 'pct' ? 0.15 : 110)}
              step={step ?? (type === 'pct' ? 0.001 : 1)}
              value={value}
              onChange={e => onUpdate({ [field]: Number(e.target.value) })}
              className="w-32 accent-brand-500"
            />
            <span className="text-white text-sm font-mono w-14 text-right">{display}</span>
          </div>
        ) : (
          <span className="text-gray-500 text-sm">{display}</span>
        )}
      </td>
    </tr>
  )
}

function SectionHeader({ label }) {
  return (
    <tr className="bg-gray-800/20">
      <td colSpan={2} className="py-2 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</td>
    </tr>
  )
}

const ASSUMPTIONS_TUTORIAL = [
  {
    title: 'Start here: Assumptions',
    body: 'These assumptions drive every projection in the tool. Before exploring other pages, review the defaults here and adjust anything that doesn\'t match your situation — especially inflation, return rates, and simulation end age.',
  },
  {
    title: 'Conservative defaults',
    body: 'The defaults are aligned with long-run historical averages and ASIC guidance. You should only change them if you have a specific reason to — e.g., you expect higher growth or want to model a downturn.',
  },
  {
    title: 'Rate overrides',
    body: 'These rates apply globally across all assets. If you need a different rate for a specific asset or time period, you can set rate period overrides on the individual asset pages (Household tab).',
  },
  {
    title: 'Simulation end age',
    body: 'This controls how far out the projection runs. Lower it to focus on the period you care about, or raise it to test longevity risk. Values beyond age 100 are labelled illustrative.',
  },
]

export default function Assumptions({ scenario, updateScenario }) {
  const [showTutorial, setShowTutorial, closeTutorial] = useTutorial('assumptionsTutorialSeen', { waitFor: 'welcomeTutorialSeen' })
  const a = scenario.assumptions
  const update = (updates) => updateScenario({ assumptions: { ...a, ...updates } })

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {showTutorial && <Tutorial steps={ASSUMPTIONS_TUTORIAL} onClose={closeTutorial} />}

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Assumptions</h1>
            <TutorialButton onClick={() => setShowTutorial(true)} />
          </div>
          <p className="text-sm text-gray-400 mt-1">
            All assumptions are overridable per scenario. Defaults align with ASIC guidance.
          </p>
        </div>
        <div>
          <label className="label">Simulation end age</label>
          <input
            className="input w-28"
            type="number"
            min={70}
            max={MAX_SIMULATION_END_AGE}
            value={scenario.simulationEndAge}
            onChange={e => updateScenario({ simulationEndAge: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-800/30">
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assumption</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</th>
            </tr>
          </thead>
          <tbody>
            <SectionHeader label="Economy" />
            <Row label="Inflation rate" value={a.inflationRate} field="inflationRate" onUpdate={update} min={0.005} max={0.08} step={0.001} />
            <Row label="Wage growth" value={a.wageGrowthRate} field="wageGrowthRate" onUpdate={update} min={0.01} max={0.08} step={0.001} />

            <SectionHeader label="Superannuation" />
            <Row label="Accumulation rate" value={a.superAccumulationRate} field="superAccumulationRate" onUpdate={update} min={0.02} max={0.12} step={0.005}
              hint="Total return (growth + reinvested dividends). Dividends are internal to the fund." />
            <Row label="Pension phase rate" value={a.superPensionRate} field="superPensionRate" onUpdate={update} min={0.02} max={0.10} step={0.005}
              hint="Total return during pension phase (typically lower-risk allocation)." />

            <SectionHeader label="Share Portfolio" />
            <Row label="Capital growth" value={a.sharesReturnRate} field="sharesReturnRate" onUpdate={update} min={0} max={0.15} step={0.005}
              hint="Share price appreciation only. Dividends are added separately below." />
            <Row label="Dividend yield" value={a.dividendYield} field="dividendYield" onUpdate={update} min={0} max={0.08} step={0.005}
              hint="Cash dividends paid out as household income and taxed via franking credits." />
            <Row label="Franking credit %" value={a.frankingPct} field="frankingPct" onUpdate={update} min={0} max={1} step={0.05}
              hint="Proportion of dividends that are franked (carry imputation credits)." />

            <SectionHeader label="Property" />
            <Row label="Property growth" value={a.propertyGrowthRate} field="propertyGrowthRate" onUpdate={update} min={0.01} max={0.10} step={0.005}
              hint="Annual capital growth. Rental income is entered per property." />

            <SectionHeader label="Treasury / Corporate Bonds" />
            <Row label="Capital growth" value={a.treasuryBondsReturnRate} field="treasuryBondsReturnRate" onUpdate={update} min={0} max={0.10} step={0.005}
              hint="Bond price appreciation. Coupon income is added separately." />
            <Row label="Coupon rate" value={a.treasuryBondsCouponRate} field="treasuryBondsCouponRate" onUpdate={update} min={0} max={0.08} step={0.005}
              hint="Annual coupon payment taxed as ordinary income (no franking)." />

            <SectionHeader label="Commodities" />
            <Row label="Return rate" value={a.commoditiesReturnRate} field="commoditiesReturnRate" onUpdate={update} min={-0.05} max={0.15} step={0.005}
              hint="Pure capital growth — no income component." />

            <SectionHeader label="Tax-Deferred Bonds (10yr)" />
            <Row label="Gross return rate" value={a.investmentBondRate ?? 0.07} field="investmentBondRate" onUpdate={update} min={0.02} max={0.12} step={0.005}
              hint="Gross return before 30% internal tax. Net return ≈ rate × 0.70." />
          </tbody>
        </table>
      </div>

      {/* Fixed / legislative values — read only */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Legislative Values (read-only)</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            ['Preservation age', `${PRESERVATION_AGE} (fixed by law)`],
            ['Concessional cap', `$${CONCESSIONAL_CAP.toLocaleString()} (FY2025)`],
            ['Non-concessional cap', `$${NON_CONCESSIONAL_CAP.toLocaleString()} (FY2025)`],
            ['FBT rate', '47%'],
            ['FBT gross-up (type 1)', '2.0802'],
            ['Investment bond internal tax', '30%'],
            ['SG rate', '11.5% → 12% from 1 July 2025'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between py-1.5 border-b border-gray-800/50">
              <span className="text-gray-500">{label}</span>
              <span className="text-gray-300 font-mono text-xs">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
