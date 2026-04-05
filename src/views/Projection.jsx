import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { useState, useMemo } from 'react'
import { Tutorial, useTutorial, TutorialButton } from '../components/Tutorial.jsx'
import { ILLUSTRATIVE_AGE_THRESHOLD } from '../constants/index.js'
import CashflowSankey from '../components/CashflowSankey.jsx'
import LifeEventsTimeline from '../components/LifeEventsTimeline.jsx'
import InvestmentPieChart from '../components/InvestmentPieChart.jsx'

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

const PROJECTION_TUTORIAL = [
  {
    title: 'Your full projection',
    body: 'This page shows your complete financial picture from today through to simulation end age — net worth, cashflow, and a detailed year-by-year table.',
  },
  {
    title: 'Net worth chart',
    body: 'The stacked area chart breaks down your assets (super, shares, property equity, bonds, cash) and liabilities (mortgage) by year. Hover for exact figures.',
  },
  {
    title: 'Today\'s dollars toggle',
    body: 'Use the "Today\'s $" toggle in the top bar to strip out inflation and see values in real purchasing power. This makes it easier to compare future amounts to what they\'d buy today.',
  },
  {
    title: 'Cashflow & table',
    body: 'Scroll down for the annual cashflow breakdown and the full liquidity table. Red-highlighted years indicate deficit — where liquid assets are exhausted.',
  },
]

export default function Projection({ snapshots, scenario, retirementDate, displayReal = true }) {
  const [showTutorial, setShowTutorial, closeTutorial] = useTutorial('projectionTutorialSeen', { waitFor: 'welcomeTutorialSeen' })
  const [showAllYears, setShowAllYears] = useState(false)
  const [cashflowDetailOpen, setCashflowDetailOpen] = useState(false)
  const [sankeyOpen, setSankeyOpen] = useState(false)
  const [sankeyYearIdx, setSankeyYearIdx] = useState(0)
  const [netWorthRange, setNetWorthRange] = useState('full')
  const [netWorthView, setNetWorthView] = useState('networth') // networth | liquidity | breakdown
  const [cashflowRange, setCashflowRange] = useState('full')
  const [cashflowView, setCashflowView] = useState('summary') // summary | income | expenses | surplus
  const [investRange, setInvestRange] = useState('full')
  const currentYear = new Date().getFullYear()
  const inflationRate = scenario.assumptions.inflationRate

  const transform = (value, year) =>
    applyRealNominal(value, year, currentYear, inflationRate, displayReal)

  const personAName = scenario.household.personA.name || 'Person A'
  const personBName = scenario.household.personB.name || 'Person B'

  // Net worth / liquidity / breakdown chart data
  const netWorthData = snapshots.map(s => {
    const isIllustrative = s.ageA != null && s.ageA >= ILLUSTRATIVE_AGE_THRESHOLD
    return {
      year: s.year,
      // Net worth view — must match engine totalNetWorth exactly
      super: transform(s.superABalance + s.superBBalance, s.year),
      property: transform(s.propertyEquity ?? 0, s.year),
      shares: transform(s.sharesValue, s.year),
      treasuryBonds: transform(s.treasuryBondsValue ?? 0, s.year),
      commodities: transform(s.commoditiesValue ?? 0, s.year),
      bonds: transform((s.bondLiquidity ?? 0) + (s.bondPreTenYr ?? 0), s.year),
      otherAssets: transform(s.totalOtherAssetsValue ?? 0, s.year),
      cash: transform(s.cashBuffer, s.year),
      debts: transform(-(s.totalDebtBalance || 0), s.year),
      // Liquidity view
      totalLiquid: Math.max(0, transform(s.totalLiquidAssets, s.year)),
      // Breakdown view (liquid assets stacked)
      superA: s.superA && !s.superA.isLocked ? Math.max(0, transform(s.superABalance, s.year)) : 0,
      superB: s.superB && !s.superB.isLocked ? Math.max(0, transform(s.superBBalance, s.year)) : 0,
      liqShares: Math.max(0, transform(s.sharesValue, s.year)),
      liqTB: Math.max(0, transform(s.treasuryBondsValue ?? 0, s.year)),
      liqComm: Math.max(0, transform(s.commoditiesValue ?? 0, s.year)),
      liqBonds: Math.max(0, transform(s.bondLiquidity, s.year)),
      liqOther: Math.max(0, transform(s.totalOtherAssetsValue, s.year)),
      liqCash: Math.max(0, transform(s.cashBuffer, s.year)),
      // Illiquid assets for investment breakdown
      lockedSuperA: s.superA?.isLocked ? Math.max(0, transform(s.superABalance, s.year)) : 0,
      lockedSuperB: s.superB?.isLocked ? Math.max(0, transform(s.superBBalance, s.year)) : 0,
      preTenYrBonds: Math.max(0, transform(s.bondPreTenYr ?? 0, s.year)),
      propertyEq: Math.max(0, transform(s.propertyEquity ?? 0, s.year)),
      isIllustrative,
    }
  })

  // Cashflow chart data — include breakdowns for toggle views
  const cashflowData = snapshots.map(s => {
    const rentalNet = s.propertyResults?.reduce((sum, r) => sum + r.netRentalIncomeLoss, 0) ?? 0
    return {
      year: s.year,
      // Summary view
      income: transform(s.totalIncome, s.year),
      outflows: transform(s.totalOutflows + (s.totalDirectedSaleProceeds ?? 0) + (s.totalRoutedContributions ?? 0), s.year),
      net: transform(s.netCashflow, s.year),
      // Income breakdown
      salaryA: transform(s.salaryA ?? 0, s.year),
      salaryB: transform(s.salaryB ?? 0, s.year),
      rental: transform(Math.max(0, rentalNet), s.year),
      dividends: transform((s.sharesResult?.cashDividend ?? 0) + (s.taxA?.frankingRefund ?? 0), s.year),
      propSale: transform(s.propertyResults?.reduce((sum, r) => sum + (r.saleProceeds || 0), 0) ?? 0, s.year),
      otherInc: transform(s.totalOtherIncome ?? 0, s.year),
      superDraw: transform((s.superA?.drawdown ?? 0) + (s.superB?.drawdown ?? 0), s.year),
      pension: transform(s.agePension?.totalPension ?? 0, s.year),
      // Expense breakdown
      tax: transform((s.taxA?.totalTaxPayable ?? 0) + (s.taxB?.totalTaxPayable ?? 0), s.year),
      livingExp: transform(s.totalExpenses, s.year),
      mortgageExp: transform(s.propertyResults?.reduce((sum, r) => sum + (r.annualRepayment || 0), 0) ?? 0, s.year),
      debtExp: transform(s.totalDebtRepayments ?? 0, s.year),
      investContrib: transform(s.totalInvestmentContributions ?? 0, s.year),
      offsetContrib: transform((s.surplusToOffset ?? 0) + (s.saleProceedsOffsetContribution ?? 0), s.year),
      saleProceedsRouted: transform((s.totalDirectedSaleProceeds ?? 0) - (s.saleProceedsCashContribution ?? 0) - (s.saleProceedsOffsetContribution ?? 0), s.year),
      leaseExp: transform(s.totalLeasePostTaxCost ?? 0, s.year),
      // Surplus/deficit
      surplus: transform(Math.max(0, s.netCashflow), s.year),
      deficit: transform(Math.min(0, s.netCashflow), s.year),
      isDeficit: s.isDeficit,
    }
  })

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
    { key: 'offsetContrib',  label: 'To offset' },
    { key: 'saleProceedsRouted', label: 'Sale → invest' },
    { key: 'livingExpenses', label: 'Expenses' },
    { key: 'mortgage',       label: 'Mortgage' },
    { key: 'debtRepayments', label: 'Debt repay' },
    { key: 'novatedLease',   label: 'Novated lease' },
  ], [])

  const ASSET_COLS = useMemo(() => [
    { key: 'superABal',     label: `Super A` },
    { key: 'superBBal',     label: `Super B` },
    { key: 'sharesBal',     label: 'Shares' },
    { key: 'tbBal',         label: 'Treasury Bonds' },
    { key: 'commBal',       label: 'Commodities' },
    { key: 'bondsBal',      label: 'Tax-Def. Bonds' },
    { key: 'otherAssetsBal', label: 'Other assets' },
    { key: 'cashBal',       label: 'Cash' },
    { key: 'liquidAssets',  label: 'Liquid assets', isTotal: true },
  ], [])

  // Dynamic liability columns — built from scenario properties + debts
  const LIABILITY_COLS = useMemo(() => {
    const cols = []
    ;(scenario.properties || []).forEach((prop, i) => {
      if (prop.purchasePrice > 0 || prop.currentValue > 0) {
        cols.push({ key: `mortgage_${i}`, label: prop.name || `Mortgage ${i + 1}` })
        if (prop.offsetBalance > 0 || prop.offsetAnnualTopUp > 0) {
          cols.push({ key: `offset_${i}`, label: `${prop.name || `Property ${i + 1}`} offset` })
        }
      }
    })
    ;(scenario.debts || []).forEach((debt, i) => {
      if (debt.currentBalance > 0) {
        cols.push({ key: `debt_${i}`, label: debt.name || `Debt ${i + 1}` })
      }
    })
    if (cols.length > 0) {
      cols.push({ key: 'totalLiabilities', label: 'Total liabilities', isTotal: true })
    }
    return cols
  }, [scenario.properties, scenario.debts])

  const detailRows = useMemo(() => snapshots.map(s => {
    const rentalNet = s.propertyResults?.reduce(
      (sum, r) => sum + r.netRentalIncomeLoss, 0) ?? 0
    const mortgage = s.propertyResults?.reduce((sum, r) => sum + (r.annualRepayment || 0), 0) ?? 0
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
      offsetContrib:     (s.surplusToOffset ?? 0) + (s.saleProceedsOffsetContribution ?? 0),
      saleProceedsRouted: (s.totalDirectedSaleProceeds ?? 0) - (s.saleProceedsCashContribution ?? 0) - (s.saleProceedsOffsetContribution ?? 0),
      livingExpenses:  s.totalExpenses,
      mortgage:        Math.max(0, mortgage),
      debtRepayments:  s.totalDebtRepayments ?? 0,
      novatedLease:    s.totalLeasePostTaxCost ?? 0,
      // Asset balances
      superABal:       s.superABalance ?? 0,
      superBBal:       s.superBBalance ?? 0,
      sharesBal:       s.sharesValue ?? 0,
      tbBal:           s.treasuryBondsValue ?? 0,
      commBal:         s.commoditiesValue ?? 0,
      bondsBal:        (s.bondLiquidity ?? 0) + (s.bondPreTenYr ?? 0),
      otherAssetsBal:  s.totalOtherAssetsValue ?? 0,
      cashBal:         s.cashBuffer ?? 0,
      liquidAssets:    s.totalLiquidAssets,
      // Liability balances (dynamic)
      ...(scenario.properties || []).reduce((acc, _, i) => {
        acc[`mortgage_${i}`] = s.propertyResults?.[i]?.mortgageBalance ?? 0
        acc[`offset_${i}`] = s.propertyResults?.[i]?.offsetBalance ?? 0
        return acc
      }, {}),
      ...(scenario.debts || []).reduce((acc, _, i) => {
        acc[`debt_${i}`] = s.debtResult?.results?.[i]?.closingBalance ?? 0
        return acc
      }, {}),
      totalLiabilities: (s.totalMortgageBalance ?? 0) + (s.totalDebtBalance ?? 0),
      // Net
      netCashflow:     s.netCashflow,
      assetDrawdowns:  (s.sharesDrawdown ?? 0) + (s.tbDrawdown ?? 0) + (s.commDrawdown ?? 0) + bondW + (s.cashDrawdown ?? 0) + (s.superAExtra ?? 0) + (s.superBExtra ?? 0),
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
  const visibleLiabilityCols = LIABILITY_COLS.filter(col =>
    col.isTotal || detailRows.some(r => r[col.key] > 500)
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

      {showTutorial && <Tutorial steps={PROJECTION_TUTORIAL} onClose={closeTutorial} />}

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">Projection</h1>
            <TutorialButton onClick={() => setShowTutorial(true)} />
          </div>
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

      {/* Life events timeline */}
      <LifeEventsTimeline scenario={scenario} snapshots={snapshots} />

      {/* Net worth / liquidity chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-300">
              {netWorthView === 'networth' ? 'Net Worth' : netWorthView === 'liquidity' ? 'Liquidity' : 'Liquidity Breakdown'}
            </h2>
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
              {[
                { id: 'networth', label: 'Net Worth' },
                { id: 'liquidity', label: 'Liquidity' },
                { id: 'breakdown', label: 'Breakdown' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setNetWorthView(id)}
                  className={`text-xs px-3 py-1 rounded-md transition-colors ${
                    netWorthView === id
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
          {netWorthView === 'networth' ? (
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
              <Area type="monotone" dataKey="debts"          stackId="2" stroke="#fb923c" fill="#fb923c" fillOpacity={0.4} name="Other debts" />
              <Area type="monotone" dataKey="cash"           stackId="1" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.5} name="Cash" />
              <Area type="monotone" dataKey="bonds"          stackId="1" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.5} name="Tax-Def. Bonds" />
              <Area type="monotone" dataKey="otherAssets"    stackId="1" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.5} name="Other Assets" />
              <Area type="monotone" dataKey="commodities"    stackId="1" stroke="#f472b6" fill="#f472b6" fillOpacity={0.5} name="Commodities" />
              <Area type="monotone" dataKey="treasuryBonds"  stackId="1" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.5} name="Treasury Bonds" />
              <Area type="monotone" dataKey="shares"         stackId="1" stroke="#34d399" fill="#34d399" fillOpacity={0.5} name="Shares" />
              <Area type="monotone" dataKey="property"       stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.5} name="Property (equity)" />
              <Area type="monotone" dataKey="super"          stackId="1" stroke="#fb923c" fill="#fb923c" fillOpacity={0.5} name="Super" />
            </AreaChart>
          ) : netWorthView === 'liquidity' ? (
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
              <Area type="monotone" dataKey="totalLiquid" stroke="#4ade80" fill="#4ade80" fillOpacity={0.3} name="Liquid assets" />
            </AreaChart>
          ) : (
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
              <Area type="monotone" dataKey="liqCash"   stackId="1" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.5} name="Cash" />
              <Area type="monotone" dataKey="liqBonds"  stackId="1" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.5} name="Tax-Def. Bonds" />
              <Area type="monotone" dataKey="liqOther"  stackId="1" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.5} name="Other assets" />
              <Area type="monotone" dataKey="liqComm"   stackId="1" stroke="#f472b6" fill="#f472b6" fillOpacity={0.5} name="Commodities" />
              <Area type="monotone" dataKey="liqTB"     stackId="1" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.5} name="Treasury Bonds" />
              <Area type="monotone" dataKey="liqShares" stackId="1" stroke="#34d399" fill="#34d399" fillOpacity={0.5} name="Shares" />
              <Area type="monotone" dataKey="superA"    stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.5} name="Super A (unlocked)" />
              <Area type="monotone" dataKey="superB"    stackId="1" stroke="#fb923c" fill="#fb923c" fillOpacity={0.5} name="Super B (unlocked)" />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Annual cashflow */}
      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-300">Annual Cashflow</h2>
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
              {[
                { id: 'summary', label: 'Summary' },
                { id: 'income', label: 'Income' },
                { id: 'expenses', label: 'Expenses' },
                { id: 'surplus', label: 'Surplus' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setCashflowView(id)}
                  className={`text-xs px-3 py-1 rounded-md transition-colors ${
                    cashflowView === id
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
        <p className="text-xs text-gray-600 mb-4">
          Y-axis: {displayReal ? "today's dollars" : "nominal (projected)"}
        </p>
        <ResponsiveContainer width="100%" height={260}>
          {cashflowView === 'summary' ? (
            <BarChart data={rangeFilter(cashflowData, cashflowRange)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                formatter={(v, name) => [fmt$(v), name]}
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
              <Bar dataKey="income"   fill="#34d399" fillOpacity={0.8} name="Income" />
              <Bar dataKey="outflows" fill="#f87171" fillOpacity={0.8} name="Outflows" />
              <Bar dataKey="net"      fill="#4ade80" fillOpacity={0.6} name="Net" />
            </BarChart>
          ) : cashflowView === 'income' ? (
            <BarChart data={rangeFilter(cashflowData, cashflowRange)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                formatter={(v, name) => [fmt$(v), name]}
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
              {retireYear && <ReferenceLine x={retireYear} stroke="#60a5fa" strokeDasharray="4 4" />}
              <Bar dataKey="salaryA"  stackId="1" fill="#34d399" fillOpacity={0.8} name={`${personAName} salary`} />
              <Bar dataKey="salaryB"  stackId="1" fill="#6ee7b7" fillOpacity={0.8} name={`${personBName} salary`} />
              <Bar dataKey="superDraw" stackId="1" fill="#fb923c" fillOpacity={0.8} name="Super drawdown" />
              <Bar dataKey="pension"  stackId="1" fill="#fbbf24" fillOpacity={0.8} name="Age Pension" />
              <Bar dataKey="dividends" stackId="1" fill="#a78bfa" fillOpacity={0.7} name="Dividends" />
              <Bar dataKey="rental"   stackId="1" fill="#f59e0b" fillOpacity={0.7} name="Net rental" />
              <Bar dataKey="otherInc" stackId="1" fill="#94a3b8" fillOpacity={0.7} name="Other income" />
              <Bar dataKey="propSale" stackId="1" fill="#22d3ee" fillOpacity={0.7} name="Property sale" />
            </BarChart>
          ) : cashflowView === 'expenses' ? (
            <BarChart data={rangeFilter(cashflowData, cashflowRange)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                formatter={(v, name) => [fmt$(v), name]}
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
              {retireYear && <ReferenceLine x={retireYear} stroke="#60a5fa" strokeDasharray="4 4" />}
              <Bar dataKey="livingExp"     stackId="1" fill="#f87171" fillOpacity={0.8} name="Living expenses" />
              <Bar dataKey="tax"           stackId="1" fill="#ef4444" fillOpacity={0.6} name="Tax" />
              <Bar dataKey="mortgageExp"   stackId="1" fill="#f59e0b" fillOpacity={0.7} name="Mortgage" />
              <Bar dataKey="debtExp"       stackId="1" fill="#fb923c" fillOpacity={0.7} name="Debt repay" />
              <Bar dataKey="investContrib" stackId="1" fill="#a78bfa" fillOpacity={0.6} name="Invest. contrib" />
              <Bar dataKey="offsetContrib" stackId="1" fill="#22d3ee" fillOpacity={0.6} name="To offset" />
              <Bar dataKey="saleProceedsRouted" stackId="1" fill="#c084fc" fillOpacity={0.6} name="Sale → invest" />
              <Bar dataKey="leaseExp"      stackId="1" fill="#94a3b8" fillOpacity={0.6} name="Novated lease" />
            </BarChart>
          ) : (
            <ComposedChart data={rangeFilter(cashflowData, cashflowRange)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tickFormatter={v => fmt$(v)} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                formatter={(v, name) => [fmt$(v), name]}
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
              <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
              {retireYear && <ReferenceLine x={retireYear} stroke="#60a5fa" strokeDasharray="4 4" />}
              <Bar dataKey="surplus" fill="#4ade80" fillOpacity={0.7} name="Surplus" />
              <Bar dataKey="deficit" fill="#f87171" fillOpacity={0.7} name="Deficit" />
              <Line type="monotone" dataKey="net" stroke="#e2e8f0" strokeWidth={1.5} dot={false} name="Net cashflow" />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Investment breakdown */}
      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-300">Investment Breakdown</h2>
          <select
            value={investRange}
            onChange={e => setInvestRange(e.target.value)}
            className="input text-xs py-1 px-2 h-7"
          >
            <option value="10">Next 10 years</option>
            <option value="20">Next 20 years</option>
            <option value="40">Next 40 years</option>
            <option value="full">Full plan</option>
          </select>
        </div>
        <p className="text-xs text-gray-600 mb-4">Each asset balance tracked year by year</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rangeFilter(netWorthData, investRange)}>
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
            <Bar dataKey="liqCash"       stackId="1" fill="#60a5fa" fillOpacity={0.7} name="Cash" />
            <Bar dataKey="liqBonds"      stackId="1" fill="#a78bfa" fillOpacity={0.7} name="Tax-Def. Bonds" />
            <Bar dataKey="liqOther"      stackId="1" fill="#94a3b8" fillOpacity={0.7} name="Other assets" />
            <Bar dataKey="liqComm"       stackId="1" fill="#f472b6" fillOpacity={0.7} name="Commodities" />
            <Bar dataKey="liqTB"         stackId="1" fill="#22d3ee" fillOpacity={0.7} name="Treasury Bonds" />
            <Bar dataKey="liqShares"     stackId="1" fill="#34d399" fillOpacity={0.7} name="Shares" />
            <Bar dataKey="superA"        stackId="1" fill="#f59e0b" fillOpacity={0.7} name={`Super A (unlocked)${personAName !== 'Person A' ? ` — ${personAName}` : ''}`} />
            <Bar dataKey="superB"        stackId="1" fill="#fb923c" fillOpacity={0.7} name={`Super B (unlocked)${personBName !== 'Person B' ? ` — ${personBName}` : ''}`} />
            <Bar dataKey="preTenYrBonds" stackId="1" fill="#a78bfa" fillOpacity={0.3} name="Bonds (pre-10yr)" />
            <Bar dataKey="propertyEq"    stackId="1" fill="#f59e0b" fillOpacity={0.3} name="Property equity" />
            <Bar dataKey="lockedSuperA"  stackId="1" fill="#f59e0b" fillOpacity={0.2} name={`Super A (locked)${personAName !== 'Person A' ? ` — ${personAName}` : ''}`} />
            <Bar dataKey="lockedSuperB"  stackId="1" fill="#fb923c" fillOpacity={0.2} name={`Super B (locked)${personBName !== 'Person B' ? ` — ${personBName}` : ''}`} />
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-gray-600">
          Solid = liquid / accessible. Faded = illiquid (locked super, pre-10yr bonds, property equity).
        </p>
      </div>

      {/* Investment pie chart */}
      <InvestmentPieChart snapshots={snapshots} scenario={scenario} />

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
              transform={transform}
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
                    {visibleLiabilityCols.length > 0 && (
                      <th
                        colSpan={visibleLiabilityCols.length}
                        className="sticky top-0 z-20 bg-gray-900 py-2 px-3 text-center text-amber-400 font-semibold border-l border-gray-700 tracking-wide"
                      >
                        LIABILITIES
                      </th>
                    )}
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
                    {visibleLiabilityCols.map((col, i) => (
                      <th
                        key={col.key}
                        style={{ top: '33px' }}
                        className={`sticky z-20 bg-gray-900 py-2 px-3 text-right whitespace-nowrap ${i === 0 ? 'border-l border-gray-700' : ''} ${col.isTotal ? 'text-amber-400 font-semibold' : 'text-gray-500 font-medium'}`}
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

                        {/* Liability balances */}
                        {visibleLiabilityCols.map((col, i) => {
                          const val = r[col.key]
                          if (col.isTotal) {
                            return (
                              <td
                                key={col.key}
                                className={`py-1.5 px-2 text-right tabular-nums font-semibold ${i === 0 ? 'border-l border-gray-800' : ''} ${val > 500 ? 'text-amber-400' : 'text-gray-600'}`}
                              >
                                {val > 500 ? fmt$(transform(val, r.year)) : '—'}
                              </td>
                            )
                          }
                          return (
                            <td
                              key={col.key}
                              className={`py-1.5 px-2 text-right tabular-nums ${i === 0 ? 'border-l border-gray-800' : ''} ${val > 500 ? 'text-gray-300' : 'text-gray-600'}`}
                            >
                              {val > 500 ? fmt$(transform(val, r.year)) : '—'}
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
