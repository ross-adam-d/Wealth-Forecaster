import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches

const CATEGORY_COLORS = {
  super:          '#0ea5e9',
  shares:         '#34d399',
  treasuryBonds:  '#22d3ee',
  commodities:    '#f472b6',
  bonds:          '#fbbf24',
  property:       '#a78bfa',
  otherAssets:    '#94a3b8',
  cash:           '#60a5fa',
}

const CATEGORY_LABELS = {
  super:          'Superannuation',
  shares:         'Shares',
  treasuryBonds:  'Treasury Bonds',
  commodities:    'Commodities',
  bonds:          'Tax-Deferred Bonds',
  property:       'Property Equity',
  otherAssets:    'Other Assets',
  cash:           'Cash',
}

function fmt$(n) {
  if (n == null) return '--'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null
  const { name, value, payload: entry } = payload[0]
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm">
      <p className="text-gray-100 font-medium">{name}</p>
      <p className="text-gray-400">{fmt$(value)} ({entry.pct}%)</p>
    </div>
  )
}

export default function InvestmentPieChart({ snapshots, scenario }) {
  const years = useMemo(() => snapshots.map(s => s.year), [snapshots])
  const [selectedYear, setSelectedYear] = useState(() => years[0] ?? new Date().getFullYear())

  const snap = useMemo(
    () => snapshots.find(s => s.year === selectedYear) || snapshots[0],
    [snapshots, selectedYear],
  )

  const data = useMemo(() => {
    if (!snap) return []
    const raw = [
      { key: 'super',         value: (snap.superABalance ?? 0) + (snap.superBBalance ?? 0) },
      { key: 'shares',        value: snap.sharesValue ?? 0 },
      { key: 'treasuryBonds', value: snap.treasuryBondsValue ?? 0 },
      { key: 'commodities',   value: snap.commoditiesValue ?? 0 },
      { key: 'bonds',         value: (snap.bondLiquidity ?? 0) + (snap.bondPreTenYr ?? 0) },
      { key: 'property',      value: snap.propertyEquity ?? 0 },
      { key: 'otherAssets',   value: snap.totalOtherAssetsValue ?? 0 },
      { key: 'cash',          value: Math.max(0, snap.cashBuffer ?? 0) },
    ].filter(d => d.value > 0)

    const total = raw.reduce((s, d) => s + d.value, 0)
    return raw.map(d => ({
      ...d,
      name: CATEGORY_LABELS[d.key],
      color: CATEGORY_COLORS[d.key],
      pct: total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0',
    }))
  }, [snap])

  if (!snap || data.length === 0) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Investment Distribution</h2>
        <p className="text-sm text-gray-500">No assets to display.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-300">Investment Distribution</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Year</label>
          <input
            type="range"
            min={years[0]}
            max={years[years.length - 1]}
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="w-32 accent-brand-500"
          />
          <span className="text-xs text-gray-400 font-mono w-10">{selectedYear}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={120}
            innerRadius={55}
            paddingAngle={2}
          >
            {data.map(entry => (
              <Cell key={entry.key} fill={entry.color} stroke={entry.color} />
            ))}
          </Pie>
          {!isTouchDevice && <Tooltip content={<CustomTooltip />} />}
        </PieChart>
      </ResponsiveContainer>

      {/* Custom legend — responsive grid, outside chart area */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5 mt-3">
        {data.map(entry => (
          <div key={entry.key} className="flex items-center gap-1.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-gray-400 truncate">{entry.name}</span>
            <span className="text-xs text-gray-500 flex-shrink-0 font-mono">{fmt$(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
