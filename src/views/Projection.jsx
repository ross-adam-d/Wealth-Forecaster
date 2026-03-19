import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { useState } from 'react'
import { ILLUSTRATIVE_AGE_THRESHOLD } from '../constants/index.js'

function fmt$(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

function applyRealNominal(value, year, currentYear, inflationRate, isReal) {
  if (!isReal || value == null) return value
  const years = year - currentYear
  return value / Math.pow(1 + inflationRate, years)
}

export default function Projection({ snapshots, scenario, retirementDate }) {
  const [displayReal, setDisplayReal] = useState(true)
  const currentYear = new Date().getFullYear()
  const inflationRate = scenario.assumptions.inflationRate

  const transform = (value, year) =>
    applyRealNominal(value, year, currentYear, inflationRate, displayReal)

  // Net worth chart data
  const netWorthData = snapshots.map(s => {
    const isIllustrative = s.ageA != null && s.ageA >= ILLUSTRATIVE_AGE_THRESHOLD
    return {
      year: s.year,
      super: transform(s.superABalance + s.superBBalance, s.year),
      property: transform(s.totalPropertyValue, s.year),
      shares: transform(s.sharesValue, s.year),
      bonds: transform(s.bondLiquidity + s.bondPreTenYr, s.year),
      cash: transform(s.cashBuffer, s.year),
      mortgage: transform(-s.totalMortgageBalance, s.year),
      isIllustrative,
    }
  })

  // Cashflow chart data
  const cashflowData = snapshots.map(s => ({
    year: s.year,
    income: transform(s.totalIncome, s.year),
    outflows: transform(s.totalOutflows, s.year),
    net: transform(s.netCashflow, s.year),
    isDeficit: s.isDeficit,
  }))

  const retireYear = retirementDate?.retirementYear

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projection</h1>
          {retireYear && (
            <p className="text-gray-400 text-sm mt-1">
              Estimated retirement: <span className="text-white font-medium">{retireYear}</span>
              {retirementDate.retirementAge && ` (age ${retirementDate.retirementAge})`}
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-gray-400">Today's dollars</span>
          <button
            onClick={() => setDisplayReal(r => !r)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${displayReal ? 'bg-brand-600' : 'bg-gray-700'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${displayReal ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className="text-sm text-gray-400">
            {displayReal ? '(real)' : '(nominal)'}
          </span>
        </label>
      </div>

      {/* Net worth over time */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-1">Net Worth Over Time</h2>
        <p className="text-xs text-gray-600 mb-4">
          Y-axis: {displayReal ? "today's dollars" : "nominal (projected)"}
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={netWorthData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip
              formatter={(v, name) => [fmt$(v), name]}
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#f9fafb' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
            {retireYear && <ReferenceLine x={retireYear} stroke="#60a5fa" strokeDasharray="4 4" label={{ value: 'Retirement', fill: '#60a5fa', fontSize: 11 }} />}
            <Area type="monotone" dataKey="mortgage" stackId="2" stroke="#f87171" fill="#f87171" fillOpacity={0.4} name="Mortgage debt" />
            <Area type="monotone" dataKey="cash"     stackId="1" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.5} name="Cash" />
            <Area type="monotone" dataKey="bonds"    stackId="1" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.5} name="Bonds" />
            <Area type="monotone" dataKey="shares"   stackId="1" stroke="#34d399" fill="#34d399" fillOpacity={0.5} name="Shares" />
            <Area type="monotone" dataKey="property" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.5} name="Property (gross)" />
            <Area type="monotone" dataKey="super"    stackId="1" stroke="#fb923c" fill="#fb923c" fillOpacity={0.5} name="Super" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Annual cashflow */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Annual Cashflow</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={cashflowData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip
              formatter={(v, name) => [fmt$(v), name]}
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
            <Bar dataKey="income"   fill="#34d399" fillOpacity={0.8} name="Income (after tax)" />
            <Bar dataKey="outflows" fill="#f87171" fillOpacity={0.8} name="Total Outflows (expenses + mortgage)" />
            <Bar dataKey="net"      fill="#4ade80" fillOpacity={0.6} name="Net surplus / deficit" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Liquidity table */}
      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Liquidity Table</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-2 px-3 text-gray-500 font-medium">Year</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium">Liquid Assets</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium">Bonds (pre-10yr)</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium">Property equity</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium">Super (locked)</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium">Total net worth</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.filter((_, i) => i % 5 === 0 || i === snapshots.length - 1).map(s => {
              const isIllustrative = s.ageA != null && s.ageA >= ILLUSTRATIVE_AGE_THRESHOLD
              return (
                <tr key={s.year} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${isIllustrative ? 'opacity-50' : ''}`}>
                  <td className="py-2 px-3 text-gray-300">
                    {s.year}
                    {isIllustrative && <span className="ml-1 text-xs text-gray-600">illus.</span>}
                  </td>
                  <td className="py-2 px-3 text-right text-gray-200">{fmt$(transform(s.totalLiquidAssets, s.year))}</td>
                  <td className="py-2 px-3 text-right text-amber-400">{fmt$(transform(s.bondPreTenYr, s.year))}</td>
                  <td className="py-2 px-3 text-right text-gray-400">{fmt$(transform(s.propertyEquity, s.year))}</td>
                  <td className="py-2 px-3 text-right text-gray-500">
                    {s.superA?.isLocked || s.superB?.isLocked
                      ? fmt$(transform((s.superA?.isLocked ? s.superABalance : 0) + (s.superB?.isLocked ? s.superBBalance : 0), s.year))
                      : '—'
                    }
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-white">{fmt$(transform(s.totalNetWorth, s.year))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
