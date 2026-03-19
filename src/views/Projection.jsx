import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { useState, useMemo } from 'react'
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

export default function Projection({ snapshots, scenario, retirementDate }) {
  const [displayReal, setDisplayReal] = useState(true)
  const [showAllYears, setShowAllYears] = useState(false)
  const [cashflowDetailOpen, setCashflowDetailOpen] = useState(false)
  const currentYear = new Date().getFullYear()
  const inflationRate = scenario.assumptions.inflationRate

  const transform = (value, year) =>
    applyRealNominal(value, year, currentYear, inflationRate, displayReal)

  const personAName = scenario.household.personA.name || 'Person A'
  const personBName = scenario.household.personB.name || 'Person B'

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

  // ── Cashflow detail table ────────────────────────────────────────────
  const INCOME_COLS = useMemo(() => [
    { key: 'salaryA',         label: `${personAName} take-home` },
    { key: 'salaryB',         label: `${personBName} take-home` },
    { key: 'rentalIncome',    label: 'Rental income' },
    { key: 'dividends',       label: 'Dividends & franking' },
    { key: 'superDrawdownA',  label: `Super drawdown (${personAName})` },
    { key: 'superDrawdownB',  label: `Super drawdown (${personBName})` },
    { key: 'bondWithdrawals', label: 'Bond withdrawals' },
    { key: 'propertySale',    label: 'Property sale' },
  ], [personAName, personBName])

  const EXPENSE_COLS = [
    { key: 'livingExpenses', label: 'Living expenses' },
    { key: 'mortgage',       label: 'Mortgage repayments' },
  ]

  const detailRows = useMemo(() => snapshots.map(s => {
    const rentalIncome = s.propertyResults?.reduce(
      (sum, r) => sum + (r.netRentalIncomeLoss > 0 ? r.netRentalIncomeLoss : 0), 0) ?? 0
    const mortgage = s.totalOutflows - s.totalExpenses
    return {
      year: s.year, ageA: s.ageA, ageB: s.ageB,
      retiredA: s.retiredA, retiredB: s.retiredB, isDeficit: s.isDeficit,
      salaryA:         s.taxA?.netTakeHome ?? 0,
      salaryB:         s.taxB?.netTakeHome ?? 0,
      rentalIncome,
      dividends:       (s.sharesResult?.cashDividend ?? 0) + (s.taxA?.frankingRefund ?? 0),
      superDrawdownA:  s.superA?.drawdown ?? 0,
      superDrawdownB:  s.superB?.drawdown ?? 0,
      bondWithdrawals: s.bondResults?.reduce((sum, r) => sum + r.withdrawal, 0) ?? 0,
      propertySale:    s.propertyResults?.reduce((sum, r) => sum + (r.saleProceeds || 0), 0) ?? 0,
      totalIncome:     s.totalIncome,
      livingExpenses:  s.totalExpenses,
      mortgage:        Math.max(0, mortgage),
      totalOutflows:   s.totalOutflows,
      netCashflow:     s.netCashflow,
      cashBuffer:      s.cashBuffer,
    }
  }), [snapshots])

  // Only show columns that have at least one non-trivial value
  const visibleIncomeCols  = INCOME_COLS.filter(col => detailRows.some(r => r[col.key] > 500))
  const visibleExpenseCols = EXPENSE_COLS.filter(col => detailRows.some(r => r[col.key] > 500))

  // Filter to 5-yr steps when not showing all (always include current, retirement, and final year)
  const lastYear = snapshots[snapshots.length - 1]?.year
  const filteredDetailRows = useMemo(() => {
    if (showAllYears) return detailRows
    return detailRows.filter(r =>
      r.year % 5 === 0 ||
      r.year === currentYear ||
      r.year === retireYear ||
      r.year === lastYear
    )
  }, [detailRows, showAllYears, currentYear, retireYear, lastYear])

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Guide */}
      <GuideBox>
        Projection shows your full financial picture from today to simulation end age — net worth, cashflow, and a detailed liquidity table. The net worth chart tracks all assets (super, shares, property equity) and liabilities (mortgage) year by year. Toggle "Today's dollars" to strip out inflation and see values in real purchasing power terms. Years beyond age 100 are illustrative. The estimated retirement year is the earliest age at which your plan remains solvent through to the end of the simulation.
      </GuideBox>

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
            {snapshots.map(s => {
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

      {/* Cashflow Detail table */}
      <div className="card">
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={() => setCashflowDetailOpen(o => !o)}
        >
          <div>
            <span className="text-sm font-semibold text-gray-300">Cashflow Detail</span>
            <span className="ml-2 text-xs text-gray-600">every income and expense stream, year by year</span>
          </div>
          <span className="text-gray-500 text-xs">{cashflowDetailOpen ? '▾' : '▸'}</span>
        </button>

        {cashflowDetailOpen && (
          <div className="mt-5">
            {/* Controls */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500">
                Values in {displayReal ? "today's dollars (real)" : 'nominal dollars'}.
                Deficit years highlighted in red.
              </p>
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllYears}
                  onChange={e => setShowAllYears(e.target.checked)}
                  className="accent-brand-500"
                />
                Show all years
                <span className="text-gray-600">(default: 5-yr steps)</span>
              </label>
            </div>

            {/* overflow-auto (both axes) + max-h so thead can stick vertically */}
            <div className="overflow-auto max-h-[480px]">
              <table className="text-xs w-full border-collapse">
                <thead>
                  {/* Group header row — sticky at top:0 */}
                  <tr className="border-b border-gray-700">
                    <th
                      rowSpan={2}
                      className="sticky left-0 top-0 z-30 bg-gray-900 text-left py-2 px-3 text-gray-600 font-medium min-w-[90px] shadow-[2px_0_0_#1f2937]"
                    >
                      Year
                    </th>
                    <th
                      colSpan={visibleIncomeCols.length + 1}
                      className="sticky top-0 z-20 bg-gray-900 py-2 px-3 text-center text-sky-400 font-semibold border-l border-gray-700 tracking-wide"
                    >
                      INCOME
                    </th>
                    <th
                      colSpan={visibleExpenseCols.length + 1}
                      className="sticky top-0 z-20 bg-gray-900 py-2 px-3 text-center text-red-400 font-semibold border-l border-gray-700 tracking-wide"
                    >
                      EXPENSES
                    </th>
                    <th
                      colSpan={2}
                      className="sticky top-0 z-20 bg-gray-900 py-2 px-3 text-center text-gray-400 font-semibold border-l border-gray-700 tracking-wide"
                    >
                      NET
                    </th>
                  </tr>
                  {/* Column header row — sticky at top:33px (below first row) */}
                  <tr className="border-b border-gray-700">
                    {visibleIncomeCols.map((col, i) => (
                      <th
                        key={col.key}
                        style={{ top: '33px' }}
                        className={`sticky z-20 bg-gray-900 py-2 px-3 text-right text-gray-500 font-medium whitespace-nowrap ${i === 0 ? 'border-l border-gray-700' : ''}`}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th style={{ top: '33px' }} className="sticky z-20 bg-gray-900 py-2 px-3 text-right text-sky-400 font-semibold whitespace-nowrap">
                      Total income
                    </th>
                    {visibleExpenseCols.map((col, i) => (
                      <th
                        key={col.key}
                        style={{ top: '33px' }}
                        className={`sticky z-20 bg-gray-900 py-2 px-3 text-right text-gray-500 font-medium whitespace-nowrap ${i === 0 ? 'border-l border-gray-700' : ''}`}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th style={{ top: '33px' }} className="sticky z-20 bg-gray-900 py-2 px-3 text-right text-red-400 font-semibold whitespace-nowrap">
                      Total outflows
                    </th>
                    <th style={{ top: '33px' }} className="sticky z-20 bg-gray-900 py-2 px-3 text-right text-gray-400 font-semibold whitespace-nowrap border-l border-gray-700">
                      Net cashflow
                    </th>
                    <th style={{ top: '33px' }} className="sticky z-20 bg-gray-900 py-2 px-3 text-right text-gray-500 font-medium whitespace-nowrap">
                      Cash buffer
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDetailRows.map(r => {
                    const isRetireYear = r.year === retireYear
                    const isIllustrative = r.ageA != null && r.ageA >= ILLUSTRATIVE_AGE_THRESHOLD
                    const rowBg = r.isDeficit ? 'bg-red-900/10' : isRetireYear ? 'bg-blue-900/10' : ''
                    const stickyBg = r.isDeficit ? 'bg-red-950' : isRetireYear ? 'bg-blue-950' : 'bg-gray-900'
                    const rowCls = `border-b border-gray-800/40 hover:bg-gray-800/20 ${rowBg} ${isIllustrative ? 'opacity-50' : ''}`

                    return (
                      <tr key={r.year} className={rowCls}>
                        {/* Sticky year cell */}
                        <td className={`sticky left-0 z-10 py-2 px-3 font-medium whitespace-nowrap ${stickyBg}`}>
                          <span className="text-gray-300">{r.year}</span>
                          {r.ageA != null && (
                            <span className="ml-1.5 text-gray-600">
                              {r.ageA}{r.ageB != null ? `/${r.ageB}` : ''}
                            </span>
                          )}
                          {isRetireYear && <span className="ml-1 text-blue-400">●</span>}
                          {r.isDeficit && <span className="ml-1 text-red-400">!</span>}
                        </td>

                        {/* Income cols */}
                        {visibleIncomeCols.map((col, i) => (
                          <td
                            key={col.key}
                            className={`py-2 px-3 text-right tabular-nums ${i === 0 ? 'border-l border-gray-800' : ''} ${r[col.key] > 500 ? 'text-gray-300' : 'text-gray-600'}`}
                          >
                            {r[col.key] > 500 ? fmt$(transform(r[col.key], r.year)) : '—'}
                          </td>
                        ))}
                        <td className="py-2 px-3 text-right font-semibold text-sky-400 tabular-nums">
                          {fmt$(transform(r.totalIncome, r.year))}
                        </td>

                        {/* Expense cols */}
                        {visibleExpenseCols.map((col, i) => (
                          <td
                            key={col.key}
                            className={`py-2 px-3 text-right tabular-nums ${i === 0 ? 'border-l border-gray-800' : ''} ${r[col.key] > 500 ? 'text-gray-300' : 'text-gray-600'}`}
                          >
                            {r[col.key] > 500 ? fmt$(transform(r[col.key], r.year)) : '—'}
                          </td>
                        ))}
                        <td className="py-2 px-3 text-right font-semibold text-red-400 tabular-nums">
                          {fmt$(transform(r.totalOutflows, r.year))}
                        </td>

                        {/* Net */}
                        <td className={`py-2 px-3 text-right font-semibold tabular-nums border-l border-gray-800 ${r.isDeficit ? 'text-red-400' : 'text-green-400'}`}>
                          {r.isDeficit ? '−' : '+'}{fmt$(Math.abs(transform(r.netCashflow, r.year)))}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-400 tabular-nums">
                          {fmt$(transform(r.cashBuffer, r.year))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-gray-600">
              ● Estimated retirement year &nbsp;·&nbsp;
              ! Deficit — liquid assets drawn down to cover shortfall &nbsp;·&nbsp;
              Ages shown as A / B
            </p>
          </div>
        )}
      </div>

    </div>
  )
}
