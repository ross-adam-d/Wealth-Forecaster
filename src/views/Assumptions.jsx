import { useState } from 'react'
import {
  INFLATION_RATE, WAGE_GROWTH_RATE, SUPER_ACCUMULATION_RATE, SUPER_PENSION_RATE,
  SHARES_RETURN_RATE, PROPERTY_GROWTH_RATE, DIVIDEND_YIELD, DEFAULT_FRANKING_PCT,
  CONCESSIONAL_CAP, NON_CONCESSIONAL_CAP, PRESERVATION_AGE, MAX_SIMULATION_END_AGE,
} from '../constants/index.js'

function Row({ label, value, field, onUpdate, type = 'pct', min, max, step = 0.1 }) {
  const display = type === 'pct' ? `${(value * 100).toFixed(1)}%` : `${value}`

  return (
    <tr className="border-b border-gray-800/50">
      <td className="py-3 px-4 text-gray-300 text-sm">{label}</td>
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

export default function Assumptions({ scenario, updateScenario }) {
  const a = scenario.assumptions
  const update = (updates) => updateScenario({ assumptions: { ...a, ...updates } })

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <GuideBox>
        Assumptions drive every projection in the tool. The defaults are conservative and aligned with long-run historical averages — you should only change them if you have a specific reason to. Rate assumptions apply globally unless overridden by a rate period on a specific asset. The simulation end age controls how far out the projection runs; lower it to focus on the period you care about, or raise it to test longevity risk.
      </GuideBox>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Assumptions</h1>
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

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-800/30">
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Assumption</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Inflation rate" value={a.inflationRate} field="inflationRate" onUpdate={update} min={0.005} max={0.08} step={0.001} />
            <Row label="Wage growth" value={a.wageGrowthRate} field="wageGrowthRate" onUpdate={update} min={0.01} max={0.08} step={0.001} />
            <Row label="Super — accumulation rate" value={a.superAccumulationRate} field="superAccumulationRate" onUpdate={update} min={0.02} max={0.12} step={0.005} />
            <Row label="Super — pension phase rate" value={a.superPensionRate} field="superPensionRate" onUpdate={update} min={0.02} max={0.10} step={0.005} />
            <Row label="Share portfolio return" value={a.sharesReturnRate} field="sharesReturnRate" onUpdate={update} min={0.02} max={0.15} step={0.005} />
            <Row label="Property growth" value={a.propertyGrowthRate} field="propertyGrowthRate" onUpdate={update} min={0.01} max={0.10} step={0.005} />
            <Row label="Dividend yield" value={a.dividendYield} field="dividendYield" onUpdate={update} min={0.01} max={0.08} step={0.005} />
            <Row label="Franking credit %" value={a.frankingPct} field="frankingPct" onUpdate={update} min={0} max={1} step={0.05} />
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
