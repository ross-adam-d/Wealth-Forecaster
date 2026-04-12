import { useState, useMemo } from 'react'
import {
  PieChart, Pie, Cell, Sector,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { computeActuals } from '../utils/actuals.js'

function fmt$(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}$${Math.round(abs / 1_000)}k`
  return `${sign}$${Math.round(abs)}`
}

function formatHistoryDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
}

function MetricCard({ label, value, sub, valueColor = 'text-white' }) {
  return (
    <div className="card">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function HistoryTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: '8px 12px' }}>
      <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px' }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.stroke, fontSize: 12, margin: '2px 0' }}>
          {p.name}: {fmt$(p.value)}
        </p>
      ))}
    </div>
  )
}

// ── Drilldown pie chart ───────────────────────────────────────────────────────

const MAIN_COLORS = {
  cash:        '#94a3b8',
  shares:      '#a78bfa',
  tbonds:      '#22d3ee',
  commodities: '#f472b6',
  property:    '#f59e0b',
  super:       '#0ea5e9',
  bonds:       '#34d399',
  other:       '#6b7280',
}

// Distinct palette for sub-items
const SUB_COLORS = [
  '#60a5fa', '#34d399', '#fbbf24', '#f87171',
  '#a78bfa', '#22d3ee', '#f472b6', '#fb923c',
  '#4ade80', '#e879f9', '#38bdf8', '#a3e635',
]

function renderActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector
      cx={cx} cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 8}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  )
}

function PieSliceTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null
  const { name, value, payload: entry } = payload[0]
  return (
    <div style={{
      background: '#111827', border: '1px solid #374151',
      borderRadius: 8, padding: '6px 10px', pointerEvents: 'none',
    }}>
      <p style={{ color: '#f9fafb', fontSize: 13, fontWeight: 600, margin: 0 }}>{name}</p>
      <p style={{ color: '#9ca3af', fontSize: 12, margin: '2px 0 0' }}>
        {fmt$(value)} ({entry.pct}%)
      </p>
    </div>
  )
}

function SinglePie({ data, title, onBack, onSliceClick }) {
  const [activeIdx, setActiveIdx] = useState(null)

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data])
  const dataWithPct = useMemo(() =>
    data.map(d => ({
      ...d,
      pct: total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0',
    })),
    [data, total]
  )

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-1 min-h-[24px]">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
        {onBack && (
          <button
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            onClick={onBack}
          >
            ← Overview
          </button>
        )}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={dataWithPct}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={46}
            outerRadius={84}
            paddingAngle={2}
            activeIndex={activeIdx}
            activeShape={renderActiveShape}
            onMouseEnter={(_, idx) => setActiveIdx(idx)}
            onMouseLeave={() => setActiveIdx(null)}
            onClick={onSliceClick ? (_, idx) => onSliceClick(dataWithPct[idx]) : undefined}
            style={{ cursor: onSliceClick ? 'pointer' : 'default' }}
          >
            {dataWithPct.map((entry, i) => (
              <Cell key={i} fill={entry.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip content={<PieSliceTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
        {dataWithPct.map((entry, i) => (
          <div key={i} className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-2 h-2 rounded-sm flex-shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-xs text-gray-400 truncate flex-1 min-w-0">{entry.name}</span>
            <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">{fmt$(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function buildDrillData(key, scenario) {
  const holdingVal = h => h.units > 0 && h.livePrice ? h.units * h.livePrice : (h.currentValue || 0)

  switch (key) {
    case 'shares': {
      const { holdings = [], currentValue = 0 } = scenario.shares || {}
      const items = holdings
        .map(h => ({ name: h.name || h.ticker || 'Holding', value: holdingVal(h) }))
        .filter(i => i.value > 0)
      const unallocated = Math.max(0, currentValue)
      if (unallocated > 0) items.push({ name: 'Unallocated', value: unallocated })
      return items
    }
    case 'tbonds': {
      const { holdings = [], currentValue = 0 } = scenario.treasuryBonds || {}
      const items = holdings
        .map(h => ({ name: h.name || h.ticker || 'Holding', value: holdingVal(h) }))
        .filter(i => i.value > 0)
      const unallocated = Math.max(0, currentValue)
      if (unallocated > 0) items.push({ name: 'Unallocated', value: unallocated })
      return items
    }
    case 'commodities': {
      const { holdings = [], currentValue = 0 } = scenario.commodities || {}
      const items = holdings
        .map(h => ({ name: h.name || 'Holding', value: h.currentValue || 0 }))
        .filter(i => i.value > 0)
      const unallocated = Math.max(0, currentValue)
      if (unallocated > 0) items.push({ name: 'Unallocated', value: unallocated })
      return items
    }
    case 'super': {
      const personAName = scenario.household?.personA?.name || 'Person A'
      const personBName = scenario.household?.personB?.name || 'Person B'
      return (scenario.super || [])
        .filter(s => (s.currentBalance || 0) > 0)
        .map(s => ({
          name: s.personLabel === 'A' ? `${personAName} Super` : `${personBName} Super`,
          value: s.currentBalance,
        }))
    }
    case 'bonds': {
      return (scenario.investmentBonds || [])
        .filter(b => (b.currentBalance || 0) > 0)
        .map(b => ({ name: b.name || 'Bond', value: b.currentBalance }))
    }
    case 'property': {
      let invIdx = 0
      return (scenario.properties || [])
        .filter(p => (p.currentValue || 0) > 0)
        .map(p => {
          if (!p.isPrimaryResidence) invIdx++
          return {
            name: p.isPrimaryResidence ? 'Home' : `Investment Property ${invIdx}`,
            value: p.currentValue,
          }
        })
    }
    case 'other': {
      return (scenario.otherAssets || [])
        .filter(a => (a.currentValue || 0) > 0)
        .map(a => ({ name: a.name || 'Asset', value: a.currentValue }))
    }
    default:
      return []
  }
}

function AssetCompositionChart({ scenario, actuals }) {
  const [drillKey, setDrillKey] = useState(null)

  const mainData = useMemo(() => [
    { key: 'cash',        name: 'Cash',           value: actuals.cashSavings,    color: MAIN_COLORS.cash },
    { key: 'shares',      name: 'Shares',         value: actuals.sharesValue,    color: MAIN_COLORS.shares },
    { key: 'tbonds',      name: 'Treasury Bonds', value: actuals.tbValue,        color: MAIN_COLORS.tbonds },
    { key: 'commodities', name: 'Commodities',    value: actuals.commValue,      color: MAIN_COLORS.commodities },
    { key: 'property',    name: 'Property',       value: actuals.propertyValues, color: MAIN_COLORS.property },
    { key: 'super',       name: 'Super',          value: actuals.superBalances,  color: MAIN_COLORS.super },
    { key: 'bonds',       name: 'Inv. Bonds',     value: actuals.bondBalances,   color: MAIN_COLORS.bonds },
    { key: 'other',       name: 'Other Assets',   value: actuals.otherValues,    color: MAIN_COLORS.other },
  ].filter(d => d.value > 0), [actuals])

  const drillData = useMemo(() => {
    if (!drillKey) return []
    return buildDrillData(drillKey, scenario)
      .map((item, i) => ({ ...item, color: SUB_COLORS[i % SUB_COLORS.length] }))
  }, [drillKey, scenario])

  const drillTitle = drillKey ? (mainData.find(d => d.key === drillKey)?.name ?? 'Detail') : ''

  const handleMainClick = entry => {
    if (entry.key === 'cash') return
    const drill = buildDrillData(entry.key, scenario)
    if (drill.length > 0) setDrillKey(entry.key)
  }

  if (mainData.length === 0) {
    return <p className="text-sm text-gray-500">No assets recorded.</p>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <SinglePie
        data={mainData}
        title="Asset Composition"
        onSliceClick={handleMainClick}
      />

      {drillKey && drillData.length > 0 ? (
        <SinglePie
          data={drillData}
          title={drillTitle}
          onBack={() => setDrillKey(null)}
        />
      ) : (
        <div className="hidden md:flex items-center justify-center">
          <p className="text-xs text-gray-600 text-center leading-relaxed">
            Click a wedge<br />to see holdings detail
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function Actuals({ scenario, isLight }) {
  const actuals = useMemo(() => computeActuals(scenario), [scenario])
  const history = scenario.actualsHistory || []

  const debtItems = [
    { label: 'Mortgage',    value: actuals.mortgageBalance, color: '#f87171' },
    { label: 'Other debts', value: actuals.otherDebt,       color: '#fb923c' },
    { label: 'HECS/HELP',   value: actuals.hecsBalance,     color: '#fbbf24' },
  ]

  const historyData = useMemo(() =>
    history.map(h => ({
      label: formatHistoryDate(h.date),
      netWorth:     h.netWorth,
      liquidAssets: h.liquidAssets,
      totalDebt:    h.totalDebt,
    })),
    [history]
  )

  const netWorthColor = actuals.netWorth >= 0 ? 'text-green-400' : 'text-red-400'
  const surplusColor  = actuals.monthlySurplus >= 0 ? 'text-green-400' : 'text-red-400'
  const gridColor     = isLight ? '#e5e7eb' : '#1f2937'
  const tickColor     = isLight ? '#374151' : '#9ca3af'

  const personAName = scenario.household?.personA?.name || 'Person A'
  const personBName = scenario.household?.personB?.name || 'Person B'
  const singlePerson = !scenario.household?.personB?.dateOfBirth &&
    !scenario.household?.personB?.currentSalary

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Actuals</h1>
        <p className="text-sm text-gray-400 mt-1">
          Current financial position derived from your Household data.
          {' '}Snapshots are recorded automatically when you save with meaningful changes.
        </p>
      </div>

      {/* Row 1 — Balance sheet metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Net Worth"
          value={fmt$(actuals.netWorth)}
          sub={`${fmt$(actuals.totalAssets)} assets − ${fmt$(actuals.totalLiabilities)} liabilities`}
          valueColor={netWorthColor}
        />
        <MetricCard
          label="Liquid Assets"
          value={fmt$(actuals.liquidAssets)}
          sub="Cash + shares + bonds + commodities"
        />
        <MetricCard
          label="Total Debt"
          value={actuals.totalDebt > 0 ? fmt$(actuals.totalDebt) : '—'}
          sub={actuals.totalDebt > 0
            ? [
                actuals.mortgageBalance > 0 && `Mortgage ${fmt$(actuals.mortgageBalance)}`,
                actuals.otherDebt > 0 && `Other ${fmt$(actuals.otherDebt)}`,
                actuals.hecsBalance > 0 && `HECS ${fmt$(actuals.hecsBalance)}`,
              ].filter(Boolean).join(' · ')
            : 'No debts recorded'
          }
          valueColor={actuals.totalDebt > 0 ? 'text-red-400' : 'text-gray-400'}
        />
      </div>

      {/* Row 2 — Cashflow metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Annual Income"
          value={fmt$(actuals.annualIncome)}
          sub={singlePerson ? personAName : `${personAName} + ${personBName}`}
        />
        <MetricCard
          label="Annual Expenses"
          value={fmt$(actuals.totalOutflows)}
          sub={[
            actuals.annualExpenses > 0 && `Living ${fmt$(actuals.annualExpenses)}`,
            actuals.annualMortgageRepayments > 0 && `Mortgage ${fmt$(actuals.annualMortgageRepayments)}`,
            actuals.annualDebtRepayments > 0 && `Debt ${fmt$(actuals.annualDebtRepayments)}`,
          ].filter(Boolean).join(' · ') || 'No expenses recorded'}
          valueColor="text-white"
        />
        <MetricCard
          label="Monthly Surplus"
          value={fmt$(actuals.monthlySurplus)}
          sub="Pre-tax income minus outflows ÷ 12"
          valueColor={surplusColor}
        />
      </div>

      {/* Asset composition — drilldown pie */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Asset Composition</h2>
        <AssetCompositionChart scenario={scenario} actuals={actuals} />
        <p className="text-xs text-gray-600 mt-4">
          Hover to explode a wedge · Click to drill into holdings detail.
          Super and property are illiquid — not available before preservation age or sale.
        </p>
      </div>

      {/* Liability breakdown — only if debts exist */}
      {actuals.totalLiabilities > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Liability Breakdown</h2>
          <div className="flex w-full h-4 rounded-full overflow-hidden" style={{ gap: '2px' }}>
            {debtItems.filter(i => i.value > 0).map(i => (
              <div
                key={i.label}
                style={{
                  width: `${(i.value / actuals.totalLiabilities) * 100}%`,
                  backgroundColor: i.color,
                  minWidth: '2px',
                }}
                title={`${i.label}: ${fmt$(i.value)}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
            {debtItems.filter(i => i.value > 0).map(i => (
              <span key={i.label} className="text-xs text-gray-400 flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: i.color }} />
                <span className="text-gray-500">{i.label}</span>
                <span className="text-gray-300 font-medium">{fmt$(i.value)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Net worth history chart */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-1">Net Worth History</h2>
        <p className="text-xs text-gray-600 mb-4">
          Auto-recorded snapshots when net worth shifts by 2%+ or after 7 days.
        </p>

        {historyData.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-gray-500 text-sm">No snapshot history yet.</p>
            <p className="text-gray-600 text-xs mt-1">
              Save your scenario to record your first snapshot. The chart will appear here as history builds.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: '400px' }}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={historyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 11 }} />
                  <YAxis
                    tickFormatter={v => fmt$(v)}
                    tick={{ fill: tickColor, fontSize: 11 }}
                    width={56}
                  />
                  <Tooltip content={<HistoryTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: tickColor }} />
                  <Line
                    type="monotone"
                    dataKey="netWorth"
                    stroke="#4ade80"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#4ade80' }}
                    name="Net Worth"
                  />
                  <Line
                    type="monotone"
                    dataKey="liquidAssets"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#0ea5e9' }}
                    name="Liquid Assets"
                  />
                  <Line
                    type="monotone"
                    dataKey="totalDebt"
                    stroke="#f87171"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#f87171' }}
                    name="Total Debt"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
