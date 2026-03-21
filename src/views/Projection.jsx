import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { useState, useMemo } from 'react'
import { ILLUSTRATIVE_AGE_THRESHOLD } from '../constants/index.js'
import CashflowSankey from '../components/CashflowSankey.jsx'

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

export default function Projection({ snapshots, scenario, retirementDate, displayReal = true }) {
  const [showAllYears, setShowAllYears] = useState(false)
  const [cashflowDetailOpen, setCashflowDetailOpen] = useState(false)
  const [sankeyOpen, setSankeyOpen] = useState(false)
  const [sankeyYearIdx, setSankeyYearIdx] = useState(0)
  const [netWorthRange, setNetWorthRange] = useState('full')
  const [cashflowRange, setCashflowRange] = useState('full')
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
      debts: transform(-(s.totalDebtBalance || 0), s.year),
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

  function rangeFilter(snaps, range) {
    if (range === 'full') return snaps
    return snaps.filter(s => s.year <= currentYear + Number(range))
  }

  // ── Cashflow detail table ────────────────────────────────────────────
  const INCOME_COLS = useMemo(() => [
    { key: 'grossSalaryA',   label: `${personAName} gross` },
    { key: 'grossSalaryB',   label: `${personBName} gross` },
    { key: 'employerSuperA', label: `Emp super A` },
    { key: 'employerSuperB', label: `Emp super B` },
    { key: 'rentalNet',      label: 'Net rental', signed: true },
    { key: 'dividends',      label: 'Dividends' },
    { key: 'propertySale',   label: 'Prop sale' },
    { key: 'otherIncome',    label: 'Other income' },
  ], [personAName, personBName])

  const EXPENSE_COLS = useMemo(() => [
    { key: 'taxA',           label: `Tax A` },
    { key: 'taxB',           label: `Tax B` },
    { key: 'superAccumA',    label: `Super A` },
    { key: 'superAccumB',    label: `Super B` },
    { key: 'sharesContrib',    label: 'Shares contrib' },
    { key: 'bondContributions', label: 'Bond contrib' },
    { key: 'otherContrib',   label: 'Other contrib' },
    { key: 'livingExpenses', label: 'Expenses' },
    { key: 'mortgage',       label: 'Mortgage' },
    { key: 'debtRepayments', label: 'Debt repay' },
  ], [])

  const ASSET_COLS = useMemo(() => [
    { key: 'superABal',     label: `Super A` },
    { key: 'superBBal',     label: `Super B` },
    { key: 'sharesBal',     label: 'Shares' },
    { key: 'bondsBal',      label: 'Bonds' },
    { key: 'otherAssetsBal', label: 'Other assets' },
    { key: 'cashBal',       label: 'Cash' },
    { key: 'debtsBal',      label: 'Debts', signed: true },
    { key: 'liquidAssets',  label: 'Liquid assets', isTotal: true },
  ], [])

  const detailRows = useMemo(() => snapshots.map(s => {
    const rentalNet = s.propertyResults?.reduce(
      (sum, r) => sum + r.netRentalIncomeLoss, 0) ?? 0
    const mortgage = s.totalOutflows - s.totalExpenses
    const bondW = s.bondResults?.reduce((sum, r) => sum + r.withdrawal, 0) ?? 0
    return {
      year: s.year, ageA: s.ageA, ageB: s.ageB,
      retiredA: s.retiredA, retiredB: s.retiredB, isDeficit: s.isDeficit,
      // Income (gross flows — no asset drawdowns)
      grossSalaryA:    s.salaryA ?? 0,
      grossSalaryB:    s.salaryB ?? 0,
      employerSuperA:  s.employerContribA ?? 0,
      employerSuperB:  s.employerContribB ?? 0,
      rentalNet,
      dividends:       (s.sharesResult?.cashDividend ?? 0) + (s.taxA?.frankingRefund ?? 0),
      propertySale:    s.propertyResults?.reduce((sum, r) => sum + (r.saleProceeds || 0), 0) ?? 0,
      otherIncome:     s.totalOtherIncome ?? 0,
      // Expenses (including tax + super accum)
      taxA:            s.taxA?.totalTaxPayable ?? 0,
      taxB:            s.taxB?.totalTaxPayable ?? 0,
      superAccumA:     s.superA?.inPensionPhase ? 0 : (s.superA?.contributions ?? 0),
      superAccumB:     s.superB?.inPensionPhase ? 0 : (s.superB?.contributions ?? 0),
      sharesContrib:     s.sharesContribution ?? 0,
      bondContributions: s.totalBondContributions ?? 0,
      otherContrib:      s.totalOtherAssetContributions ?? 0,
      livingExpenses:  s.totalExpenses,
      mortgage:        Math.max(0, mortgage),
      debtRepayments:  s.totalDebtRepayments ?? 0,
      // Asset balances
      superABal:       s.superABalance ?? 0,
      superBBal:       s.superBBalance ?? 0,
      sharesBal:       s.sharesValue ?? 0,
      bondsBal:        (s.bondLiquidity ?? 0) + (s.bondPreTenYr ?? 0),
      otherAssetsBal:  s.totalOtherAssetsValue ?? 0,
      cashBal:         s.cashBuffer ?? 0,
      debtsBal:        -(s.totalDebtBalance ?? 0),
      liquidAssets:    s.totalLiquidAssets,
      // Net
      netCashflow:     s.netCashflow,
      assetDrawdowns:  (s.sharesDrawdown ?? 0) + bondW + (s.cashDrawdown ?? 0) + (s.superAExtra ?? 0) + (s.superBExtra ?? 0),
    }
  }), [snapshots])

  // Show column if any year has a non-trivial value; signed cols (rentalNet) use Math.abs
  const visibleIncomeCols  = INCOME_COLS.filter(col =>
    detailRows.some(r => Math.abs(r[col.key]) > 500)
  )
  const visibleExpenseCols = EXPENSE_COLS.filter(col => detailRows.some(r => r[col.key] > 500))
  const visibleAssetCols = ASSET_COLS.filter(col =>
    col.isTotal || detailRows.some(r => Math.abs(r[col.key]) > 500)
  )

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
    <div className="px-4 py-4 space-y-4">

      {/* Liquidity exhaustion warning */}
      {(() => {
        const deficitSnaps = snapshots.filter(s => s.isDeficit)
        if (!deficitSnaps.length) return null
        const first = deficitSnaps[0]
        const cumulative = deficitSnaps[deficitSnaps.length - 1]?.cumulativeDeficit || 0
        return (
          <div className="bg-red-950 border-2 border-red-600 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="text-red-400 text-4xl font-black leading-none mt-0.5">!</div>
              <div>
                <h2 className="text-red-300 font-bold text-lg">Liquidity Exhausted — Plan Not Viable</h2>
                <p className="text-red-400 text-sm mt-2 leading-relaxed">
                  All liquid assets are depleted by <span className="text-red-200 font-bold">{first.year}</span>
                  {first.ageA != null && <> (age {first.ageA}{first.ageB != null ? `/${first.ageB}` : ''})</>}.
                  {deficitSnaps.length > 1 && <> The plan runs {deficitSnaps.length} years in deficit.</>}
                  {cumulative > 0 && <> Cumulative shortfall: <span className="text-red-200 font-bold">${Math.round(cumulative / 1000)}k</span>.</>}
                </p>
                <p className="text-red-500 text-xs mt-3">
                  Deficit years are highlighted in red in the charts and tables below.
                </p>
              </div>
            </div>
          </div>
        )
      })()}

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

        <span className="text-xs text-gray-500">
          {displayReal ? "Today's dollars (real)" : 'Nominal dollars'}
        </span>
      </div>

      {/* Net worth over time */}
      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-300">Net Worth Over Time</h2>
          <select
            value={netWorthRange}
            onChange={e => setNetWorthRange(e.target.value)}
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
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={rangeFilter(netWorthData, netWorthRange)}>
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
            <Area type="monotone" dataKey="debts"    stackId="2" stroke="#fb923c" fill="#fb923c" fillOpacity={0.4} name="Other debts" />
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-300">Annual Cashflow</h2>
          <select
            value={cashflowRange}
            onChange={e => setCashflowRange(e.target.value)}
            className="input text-xs py-1 px-2 h-7"
          >
            <option value="10">Next 10 years</option>
            <option value="20">Next 20 years</option>
            <option value="40">Next 40 years</option>
            <option value="full">Full plan</option>
          </select>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={rangeFilter(cashflowData, cashflowRange)}>
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
              <th className="text-right py-2 px-3 text-gray-500 font-medium">Debts</th>
              <th className="text-right py-2 px-3 text-gray-500 font-medium">Total net worth</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map(s => {
              const isIllustrative = s.ageA != null && s.ageA >= ILLUSTRATIVE_AGE_THRESHOLD
              return (
                <tr key={s.year} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${isIllustrative ? 'opacity-50' : ''} ${s.isDeficit ? 'bg-red-950/40' : ''}`}>
                  <td className={`py-2 px-3 ${s.isDeficit ? 'text-red-300 font-bold' : 'text-gray-300'}`}>
                    {s.year}{s.isDeficit && ' !!'}
                    {isIllustrative && <span className="ml-1 text-xs text-gray-600">illus.</span>}
                  </td>
                  <td className={`py-2 px-3 text-right ${s.isDeficit ? 'text-red-400 font-bold' : 'text-gray-200'}`}>
                    {fmt$(transform(s.totalLiquidAssets, s.year))}
                    {s.isDeficit && <span className="ml-1">!!!</span>}
                  </td>
                  <td className="py-2 px-3 text-right text-amber-400">{fmt$(transform(s.bondPreTenYr, s.year))}</td>
                  <td className="py-2 px-3 text-right text-gray-400">{fmt$(transform(s.propertyEquity, s.year))}</td>
                  <td className="py-2 px-3 text-right text-gray-500">
                    {s.superA?.isLocked || s.superB?.isLocked
                      ? fmt$(transform((s.superA?.isLocked ? s.superABalance : 0) + (s.superB?.isLocked ? s.superBBalance : 0), s.year))
                      : '—'
                    }
                  </td>
                  <td className="py-2 px-3 text-right text-red-400">
                    {(s.totalDebtBalance || 0) > 0 ? `-${fmt$(transform(s.totalDebtBalance, s.year))}` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-white">{fmt$(transform(s.totalNetWorth, s.year))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Cashflow Flow diagram */}
      <div className="card">
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={() => setSankeyOpen(o => !o)}
        >
          <div>
            <span className="text-sm font-semibold text-gray-300">Cashflow Flow</span>
            <span className="ml-2 text-xs text-gray-600">income → tax → expenses for any year</span>
          </div>
          <span className="text-gray-500 text-xs">{sankeyOpen ? '▾' : '▸'}</span>
        </button>

        {sankeyOpen && (
          <div className="mt-5">
            {/* Year selector */}
            <div className="flex items-center gap-4 mb-5">
              <label className="text-xs text-gray-500 whitespace-nowrap">Year</label>
              <input
                type="range"
                min={0}
                max={snapshots.length - 1}
                step={1}
                value={sankeyYearIdx}
                onChange={e => setSankeyYearIdx(Number(e.target.value))}
                className="flex-1 accent-brand-500"
              />
              <div className="text-right min-w-[80px]">
                <span className="text-sm font-semibold text-white">
                  {snapshots[sankeyYearIdx]?.year}
                </span>
                {snapshots[sankeyYearIdx]?.ageA != null && (
                  <span className="ml-1.5 text-xs text-gray-500">
                    age {snapshots[sankeyYearIdx].ageA}
                    {snapshots[sankeyYearIdx].ageB != null ? `/${snapshots[sankeyYearIdx].ageB}` : ''}
                  </span>
                )}
                {snapshots[sankeyYearIdx]?.retiredA && (
                  <span className="ml-1.5 text-xs text-blue-400">retired</span>
                )}
              </div>
            </div>

            <CashflowSankey
              snapshot={snapshots[sankeyYearIdx]}
              scenario={scenario}
            />

            <p className="mt-3 text-xs text-gray-600 leading-relaxed">
              <span className="text-gray-500 font-medium">Gross salary</span> is shown before income tax — tax appears as an expense on the right so the full burden is visible.
              {' '}Ribbon widths are proportional to dollar amounts; each income stream proportionally funds all expenses.
              <br />
              <span className="text-gray-500 font-medium">Employer super (SG)</span> is <span className="text-gray-400">not</span> included — it is paid by your employer on top of your salary and goes directly to the fund without flowing through your household cashflow.
              Salary sacrifice reduces your taxable income (lower tax, lower take-home) and appears in the super balance, not here.
            </p>
          </div>
        )}
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
                      colSpan={visibleIncomeCols.length}
                      className="sticky top-0 z-20 bg-gray-900 py-2 px-3 text-center text-sky-400 font-semibold border-l border-gray-700 tracking-wide"
                    >
                      INCOME
                    </th>
                    <th
                      colSpan={visibleExpenseCols.length}
                      className="sticky top-0 z-20 bg-gray-900 py-2 px-3 text-center text-red-400 font-semibold border-l border-gray-700 tracking-wide"
                    >
                      EXPENSES
                    </th>
                    <th
                      colSpan={visibleAssetCols.length}
                      className="sticky top-0 z-20 bg-gray-900 py-2 px-3 text-center text-emerald-400 font-semibold border-l border-gray-700 tracking-wide"
                    >
                      ASSETS
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
                    {visibleExpenseCols.map((col, i) => (
                      <th
                        key={col.key}
                        style={{ top: '33px' }}
                        className={`sticky z-20 bg-gray-900 py-2 px-3 text-right text-gray-500 font-medium whitespace-nowrap ${i === 0 ? 'border-l border-gray-700' : ''}`}
                      >
                        {col.label}
                      </th>
                    ))}
                    {visibleAssetCols.map((col, i) => (
                      <th
                        key={col.key}
                        style={{ top: '33px' }}
                        className={`sticky z-20 bg-gray-900 py-2 px-3 text-right whitespace-nowrap ${i === 0 ? 'border-l border-gray-700' : ''} ${col.isTotal ? 'text-emerald-400 font-semibold' : 'text-gray-500 font-medium'}`}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th style={{ top: '33px' }} className="sticky z-20 bg-gray-900 py-2 px-3 text-right text-gray-400 font-semibold whitespace-nowrap border-l border-gray-700">
                      Net cashflow
                    </th>
                    <th style={{ top: '33px' }} className="sticky z-20 bg-gray-900 py-2 px-3 text-right text-amber-400 font-semibold whitespace-nowrap">
                      Asset drawdowns
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
                        <td className={`sticky left-0 z-10 py-1.5 px-2 font-medium whitespace-nowrap ${stickyBg}`}>
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
                        {visibleIncomeCols.map((col, i) => {
                          const val = r[col.key]
                          const absVal = Math.abs(val)
                          const isNeg = col.signed && val < 0
                          const isTrivial = absVal <= 500
                          return (
                            <td
                              key={col.key}
                              className={`py-1.5 px-2 text-right tabular-nums ${i === 0 ? 'border-l border-gray-800' : ''} ${isTrivial ? 'text-gray-600' : isNeg ? 'text-amber-400' : 'text-gray-300'}`}
                            >
                              {isTrivial ? '—' : (isNeg ? `(${fmt$(transform(absVal, r.year))})` : fmt$(transform(val, r.year)))}
                            </td>
                          )
                        })}

                        {/* Expense cols */}
                        {visibleExpenseCols.map((col, i) => (
                          <td
                            key={col.key}
                            className={`py-1.5 px-2 text-right tabular-nums ${i === 0 ? 'border-l border-gray-800' : ''} ${r[col.key] > 500 ? 'text-gray-300' : 'text-gray-600'}`}
                          >
                            {r[col.key] > 500 ? fmt$(transform(r[col.key], r.year)) : '—'}
                          </td>
                        ))}

                        {/* Asset balances */}
                        {visibleAssetCols.map((col, i) => {
                          const val = r[col.key]
                          const absVal = Math.abs(val)
                          const isNeg = val < 0
                          if (col.isTotal) {
                            return (
                              <td
                                key={col.key}
                                className={`py-1.5 px-2 text-right tabular-nums font-semibold ${i === 0 ? 'border-l border-gray-800' : ''} ${val < 0 ? 'text-red-400' : val < 20000 ? 'text-amber-400' : 'text-emerald-400'}`}
                              >
                                {fmt$(transform(val, r.year))}
                                {val < 0 && <span className="ml-1">⚠</span>}
                              </td>
                            )
                          }
                          return (
                            <td
                              key={col.key}
                              className={`py-1.5 px-2 text-right tabular-nums ${i === 0 ? 'border-l border-gray-800' : ''} ${isNeg ? 'text-red-400' : absVal > 500 ? 'text-gray-300' : 'text-gray-600'}`}
                            >
                              {absVal > 500 ? (isNeg ? `(${fmt$(transform(absVal, r.year))})` : fmt$(transform(val, r.year))) : '—'}
                            </td>
                          )
                        })}

                        {/* Net */}
                        <td className={`py-1.5 px-2 text-right font-semibold tabular-nums border-l border-gray-800 ${r.isDeficit ? 'text-red-400' : 'text-green-400'}`}>
                          {r.isDeficit ? '−' : '+'}{fmt$(Math.abs(transform(r.netCashflow, r.year)))}
                        </td>
                        <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${r.assetDrawdowns > 500 ? 'text-amber-400' : 'text-gray-600'}`}>
                          {r.assetDrawdowns > 500 ? fmt$(transform(r.assetDrawdowns, r.year)) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-gray-600">
              ● Estimated retirement year &nbsp;·&nbsp;
              ! Deficit — all sources exhausted &nbsp;·&nbsp;
              Asset drawdowns shown in amber when portfolio is being liquidated &nbsp;·&nbsp;
              Liquid assets shown in amber below $20k, red if negative &nbsp;·&nbsp;
              Ages shown as A / B
            </p>
          </div>
        )}
      </div>

    </div>
  )
}
