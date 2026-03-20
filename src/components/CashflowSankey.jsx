/**
 * CashflowSankey
 *
 * Custom SVG Sankey diagram: income sources (left) → tax (centre) → expenses + surplus (right).
 * Three columns of proportionally-sized nodes connected by cubic-bezier filled ribbons.
 * No external dependencies beyond React.
 */
import { useMemo } from 'react'

// ── Layout constants ──────────────────────────────────────────────────────────
const SVG_W   = 760
const SVG_H   = 460
const NODE_W  = 16
const MIN_GAP = 8    // min vertical gap between sibling nodes

// Column node x-positions
const COL_X = [184, 394, 572]

// ── Colour palette (matches design system) ───────────────────────────────────
const C = {
  salaryA:   '#0ea5e9',
  salaryB:   '#38bdf8',
  rental:    '#34d399',
  dividends: '#a78bfa',
  superA:    '#f59e0b',
  superB:    '#fb923c',
  bonds:     '#fbbf24',
  shares:    '#4ade80',
  propSale:  '#34d399',
  tax:       '#f87171',
  netIncome: '#64748b',
  expenses:  '#f87171',
  mortgage:  '#fca5a5',
  surplus:   '#4ade80',
  deficit:   '#ef4444',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt$(n) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

/** Space nodes evenly within SVG_H, returning nodes with .y assigned. */
function layoutCol(nodes) {
  const totalH  = nodes.reduce((s, n) => s + n.h, 0)
  const spacing = nodes.length > 1
    ? Math.max(MIN_GAP, (SVG_H - totalH) / (nodes.length + 1))
    : (SVG_H - totalH) / 2
  let y = spacing
  return nodes.map(n => {
    const out = { ...n, y }
    y += n.h + spacing
    return out
  })
}

/** Single filled-ribbon Sankey link. */
function Ribbon({ x0, y0, h0, x1, y1, h1, color }) {
  const mx = (x0 + x1) / 2
  const d = [
    `M ${x0} ${y0}`,
    `C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`,
    `L ${x1} ${y1 + h1}`,
    `C ${mx} ${y1 + h1}, ${mx} ${y0 + h0}, ${x0} ${y0 + h0}`,
    'Z',
  ].join(' ')
  return <path d={d} fill={color} fillOpacity={0.32} stroke="none" />
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CashflowSankey({ snapshot, scenario }) {
  const personAName = scenario?.household?.personA?.name || 'Person A'
  const personBName = scenario?.household?.personB?.name || 'Person B'

  const { col0, col1, col2, links } = useMemo(() => {
    const empty = { col0: [], col1: [], col2: [], links: [] }
    if (!snapshot) return empty

    const s = snapshot

    // ── Raw values ────────────────────────────────────────────────────────────
    const salaryA   = s.salaryA || 0
    const salaryB   = s.salaryB || 0
    const taxA      = s.taxA?.totalTaxPayable || 0
    const taxB      = s.taxB?.totalTaxPayable || 0
    const takeHomeA = s.taxA?.netTakeHome || 0
    const takeHomeB = s.taxB?.netTakeHome || 0
    const rentalNet = s.propertyResults?.reduce((sum, r) => sum + r.netRentalIncomeLoss, 0) || 0
    const dividends = (s.sharesResult?.cashDividend || 0) + (s.taxA?.frankingRefund || 0)
    const superA    = s.superA?.drawdown || 0
    const superB    = s.superB?.drawdown || 0
    const bondW     = s.bondResults?.reduce((sum, r) => sum + r.withdrawal, 0) || 0
    const sharesD   = s.sharesDrawdown || 0
    const propSale  = s.propertyResults?.reduce((sum, r) => sum + (r.saleProceeds || 0), 0) || 0
    const livingExp = s.totalExpenses || 0
    const mortgage  = Math.max(0, (s.totalOutflows || 0) - (s.totalExpenses || 0))
    const totalTax  = taxA + taxB
    const netCF     = s.netCashflow || 0
    const surplus   = netCF > 0 ? netCF : 0
    const deficit   = netCF < 0 ? Math.abs(netCF) : 0

    // ── Col 0: income source nodes ────────────────────────────────────────────
    const rawInc = []
    if (salaryA  > 0)   rawInc.push({ id: 'salaryA',   label: `${personAName} gross salary`, value: salaryA,   color: C.salaryA   })
    if (salaryB  > 0)   rawInc.push({ id: 'salaryB',   label: `${personBName} gross salary`, value: salaryB,   color: C.salaryB   })
    if (rentalNet > 500) rawInc.push({ id: 'rental',   label: 'Net rental income',           value: rentalNet, color: C.rental    })
    if (dividends > 100) rawInc.push({ id: 'dividends',label: 'Dividends & franking',        value: dividends, color: C.dividends })
    if (superA   > 100)  rawInc.push({ id: 'superA',   label: `Super (${personAName})`,      value: superA,    color: C.superA    })
    if (superB   > 100)  rawInc.push({ id: 'superB',   label: `Super (${personBName})`,      value: superB,    color: C.superB    })
    if (bondW    > 100)  rawInc.push({ id: 'bonds',    label: 'Bond withdrawals',            value: bondW,     color: C.bonds     })
    if (sharesD  > 100)  rawInc.push({ id: 'shares',   label: 'Shares drawdown',             value: sharesD,   color: C.shares    })
    if (propSale > 100)  rawInc.push({ id: 'propSale', label: 'Property sale proceeds',      value: propSale,  color: C.propSale  })

    // ── Col 1: tax sink + net-income pass-through ─────────────────────────────
    const totalInflow   = rawInc.reduce((s, n) => s + n.value, 0)
    const netIncValue   = Math.max(0, totalInflow - totalTax)
    const rawMid = []
    if (totalTax   > 0) rawMid.push({ id: 'tax',       label: 'Tax & Medicare', value: totalTax,  color: C.tax      })
    if (netIncValue > 0) rawMid.push({ id: 'netIncome', label: 'Net income',     value: netIncValue, color: C.netIncome })

    // ── Col 2: expense / surplus sinks ────────────────────────────────────────
    const rawOut = []
    if (livingExp > 100) rawOut.push({ id: 'expenses', label: 'Living expenses',    value: livingExp, color: C.expenses })
    if (mortgage  > 100) rawOut.push({ id: 'mortgage', label: 'Mortgage',           value: mortgage,  color: C.mortgage })
    if (surplus   > 100) rawOut.push({ id: 'surplus',  label: 'Surplus → savings',  value: surplus,   color: C.surplus  })
    if (deficit   > 100) rawOut.push({ id: 'deficit',  label: 'Deficit (shortfall)',value: deficit,   color: C.deficit  })

    if (totalInflow === 0) return empty

    // ── Scale: proportional to tallest column total ───────────────────────────
    const maxTotal = Math.max(
      rawInc.reduce((s, n) => s + n.value, 0),
      rawMid.reduce((s, n) => s + n.value, 0),
      rawOut.reduce((s, n) => s + n.value, 0),
    )
    const scale = (SVG_H * 0.84) / maxTotal
    const sized = nodes => nodes.map(n => ({ ...n, h: Math.max(4, n.value * scale) }))

    const col0 = layoutCol(sized(rawInc))
    const col1 = layoutCol(sized(rawMid))
    const col2 = layoutCol(sized(rawOut))

    // ── Links ─────────────────────────────────────────────────────────────────
    // Ports track how much of each node edge has been consumed by links
    const portR = {}   // right-edge output port (col0 and col1 netIncome)
    const portL = {}   // left-edge input port  (col1 and col2)
    col0.forEach(n => { portR[n.id] = n.y })
    col1.forEach(n => { portR[n.id] = n.y; portL[n.id] = n.y })
    col2.forEach(n => { portL[n.id] = n.y })

    const links = []
    const X_RIGHT = [COL_X[0] + NODE_W, COL_X[1] + NODE_W, COL_X[2] + NODE_W]
    const X_LEFT  = COL_X

    function addLink(srcId, tgtId, value, color, srcCol, tgtCol) {
      if (value <= 0) return
      const h = Math.max(1, value * scale)
      const y0 = portR[srcId] ?? 0
      const y1 = portL[tgtId] ?? 0
      portR[srcId] = (portR[srcId] ?? 0) + h
      portL[tgtId] = (portL[tgtId] ?? 0) + h
      links.push({ x0: X_RIGHT[srcCol], y0, h0: h, x1: X_LEFT[tgtCol], y1, h1: h, color })
    }

    // Salary A → Tax A, then → Net income
    if (rawInc.find(n => n.id === 'salaryA')) {
      addLink('salaryA', 'tax',       taxA,      C.tax,      0, 1)
      addLink('salaryA', 'netIncome', takeHomeA, C.salaryA,  0, 1)
    }
    // Salary B → Tax B, then → Net income
    if (rawInc.find(n => n.id === 'salaryB')) {
      addLink('salaryB', 'tax',       taxB,      C.tax,      0, 1)
      addLink('salaryB', 'netIncome', takeHomeB, C.salaryB,  0, 1)
    }
    // Other income → Net income (no tax deducted — already net)
    rawInc.forEach(n => {
      if (n.id !== 'salaryA' && n.id !== 'salaryB') {
        addLink(n.id, 'netIncome', n.value, n.color, 0, 1)
      }
    })
    // Net income → expense/surplus sinks
    rawOut.forEach(n => {
      addLink('netIncome', n.id, n.value, n.color, 1, 2)
    })

    return { col0, col1, col2, links }
  }, [snapshot, personAName, personBName])

  if (!col0.length) {
    return (
      <div className="h-32 flex items-center justify-center text-gray-600 text-sm">
        No data for selected year
      </div>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width="100%"
      style={{ display: 'block', overflow: 'visible' }}
      aria-label="Annual cashflow diagram"
    >
      {/* ── Ribbons (behind nodes) ── */}
      {links.map((lnk, i) => <Ribbon key={i} {...lnk} />)}

      {/* ── Col 0: income source nodes + left-side labels ── */}
      {col0.map(n => (
        <g key={n.id}>
          <rect x={COL_X[0]} y={n.y} width={NODE_W} height={n.h} fill={n.color} rx={2} />
          {/* Label: right-aligned to the left of the node */}
          <text
            x={COL_X[0] - 8}
            y={n.y + n.h / 2}
            textAnchor="end"
            dominantBaseline="middle"
            fill={n.color}
            fontSize={10}
            fontFamily="system-ui, sans-serif"
          >
            {n.label}
          </text>
          {/* Amount: smaller, right-aligned below label */}
          {n.h >= 14 && (
            <text
              x={COL_X[0] - 8}
              y={n.y + n.h / 2 + 11}
              textAnchor="end"
              dominantBaseline="middle"
              fill={n.color}
              fontSize={9}
              opacity={0.7}
              fontFamily="system-ui, sans-serif"
            >
              {fmt$(n.value)}
            </text>
          )}
        </g>
      ))}

      {/* ── Col 1: tax / net income nodes + centred labels ── */}
      {col1.map(n => (
        <g key={n.id}>
          <rect x={COL_X[1]} y={n.y} width={NODE_W} height={n.h} fill={n.color} rx={2} />
          {n.h >= 20 && (
            <text
              x={COL_X[1] + NODE_W / 2}
              y={n.y + n.h / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={n.color}
              fontSize={9}
              fontFamily="system-ui, sans-serif"
            >
              {n.label}
            </text>
          )}
          {n.h < 20 && (
            <text
              x={COL_X[1] + NODE_W / 2}
              y={n.y - 5}
              textAnchor="middle"
              dominantBaseline="auto"
              fill={n.color}
              fontSize={9}
              fontFamily="system-ui, sans-serif"
            >
              {n.label}
            </text>
          )}
        </g>
      ))}

      {/* ── Col 2: expense/surplus nodes + right-side labels ── */}
      {col2.map(n => (
        <g key={n.id}>
          <rect x={COL_X[2]} y={n.y} width={NODE_W} height={n.h} fill={n.color} rx={2} />
          <text
            x={COL_X[2] + NODE_W + 8}
            y={n.y + n.h / 2}
            textAnchor="start"
            dominantBaseline="middle"
            fill={n.color}
            fontSize={10}
            fontFamily="system-ui, sans-serif"
          >
            {n.label}
          </text>
          {n.h >= 14 && (
            <text
              x={COL_X[2] + NODE_W + 8}
              y={n.y + n.h / 2 + 11}
              textAnchor="start"
              dominantBaseline="middle"
              fill={n.color}
              fontSize={9}
              opacity={0.7}
              fontFamily="system-ui, sans-serif"
            >
              {fmt$(n.value)}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
