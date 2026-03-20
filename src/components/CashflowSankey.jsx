/**
 * CashflowSankey — budget Sankey diagram
 *
 * Two columns: income sources (left) → uses of income (right).
 * Each income source proportionally fans out to every expense category —
 * the ribbon widths show how much of each income stream is notionally
 * consumed by each expense.
 *
 * Gross salary is shown on the left (before income tax).
 * Income tax appears as an expense on the right so the full tax burden is visible.
 * Employer super (SG) is NOT shown — it is employer-funded and goes directly
 * to the fund without flowing through the household cashflow.
 *
 * No external dependencies beyond React.
 */
import { useMemo } from 'react'

// ── Layout constants ──────────────────────────────────────────────────────────
const SVG_W   = 940
const SVG_H   = 300
const NODE_W  = 16
const MIN_GAP = 6

const LEFT_X  = 220   // left edge of income bars  (label area: 0–212)
const RIGHT_X = 700   // left edge of expense bars (label area: 718–940)

// ── Colour palette ────────────────────────────────────────────────────────────
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
  expenses:  '#ef4444',
  mortgage:  '#fca5a5',
  surplus:   '#4ade80',
  deficit:   '#f87171',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt$(n) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

/** Space nodes evenly within svgH, with equal gaps above/below and between. */
function layoutCol(nodes) {
  const totalH  = nodes.reduce((s, n) => s + n.h, 0)
  const gap = nodes.length > 0
    ? Math.max(MIN_GAP, (SVG_H - totalH) / (nodes.length + 1))
    : SVG_H / 2
  let y = gap
  return nodes.map(n => {
    const out = { ...n, y }
    y += n.h + gap
    return out
  })
}

/** Filled cubic-bezier Sankey ribbon. */
function Ribbon({ x0, y0, h0, x1, y1, h1, color }) {
  const mx = (x0 + x1) / 2
  const d = [
    `M ${x0} ${y0}`,
    `C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`,
    `L ${x1} ${y1 + h1}`,
    `C ${mx} ${y1 + h1}, ${mx} ${y0 + h0}, ${x0} ${y0 + h0}`,
    'Z',
  ].join(' ')
  return <path d={d} fill={color} fillOpacity={0.28} stroke="none" />
}

/** Node rectangle + two-line label (name + amount). */
function NodeLabel({ n, side }) {
  const isLeft = side === 'left'
  const lx = isLeft ? LEFT_X - 8 : RIGHT_X + NODE_W + 8
  const anchor = isLeft ? 'end' : 'start'
  const nx = isLeft ? LEFT_X : RIGHT_X

  return (
    <g>
      <rect x={nx} y={n.y} width={NODE_W} height={n.h} fill={n.color} rx={2} />
      {/* Label line */}
      <text
        x={lx} y={n.h >= 18 ? n.y + n.h / 2 - 5 : n.y + n.h / 2}
        textAnchor={anchor} dominantBaseline="middle"
        fill={n.color} fontSize={10} fontFamily="system-ui, sans-serif"
      >
        {n.label}
      </text>
      {/* Amount line (only when node is tall enough for two lines) */}
      {n.h >= 18 && (
        <text
          x={lx} y={n.y + n.h / 2 + 9}
          textAnchor={anchor} dominantBaseline="middle"
          fill={n.color} fontSize={9} opacity={0.65} fontFamily="system-ui, sans-serif"
        >
          {fmt$(n.value)}
        </text>
      )}
      {/* Inline amount for short nodes */}
      {n.h < 18 && n.h >= 8 && (
        <text
          x={lx} y={n.y + n.h / 2}
          textAnchor={anchor} dominantBaseline="middle"
          fill={n.color} fontSize={9} opacity={0.65} fontFamily="system-ui, sans-serif"
        >
          {'  '}{fmt$(n.value)}
        </text>
      )}
    </g>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CashflowSankey({ snapshot, scenario }) {
  const personAName = scenario?.household?.personA?.name || 'Person A'
  const personBName = scenario?.household?.personB?.name || 'Person B'

  const { leftNodes, rightNodes, links } = useMemo(() => {
    const empty = { leftNodes: [], rightNodes: [], links: [] }
    if (!snapshot) return empty

    const s = snapshot

    // ── Raw values ────────────────────────────────────────────────────────────
    const salaryA   = s.salaryA || 0
    const salaryB   = s.salaryB || 0
    const totalTax  = (s.taxA?.totalTaxPayable || 0) + (s.taxB?.totalTaxPayable || 0)
    const rentalNet = s.propertyResults?.reduce((sum, r) => sum + r.netRentalIncomeLoss, 0) || 0
    const dividends = (s.sharesResult?.cashDividend || 0) + (s.taxA?.frankingRefund || 0)
    const superA    = (s.superA?.drawdown || 0) + (s.superAExtra || 0)
    const superB    = (s.superB?.drawdown || 0) + (s.superBExtra || 0)
    const bondW     = s.bondResults?.reduce((sum, r) => sum + r.withdrawal, 0) || 0
    const sharesD   = s.sharesDrawdown || 0
    const cashD     = s.cashDrawdown || 0
    const propSale  = s.propertyResults?.reduce((sum, r) => sum + (r.saleProceeds || 0), 0) || 0
    const livingExp = s.totalExpenses || 0
    const mortgage  = Math.max(0, (s.totalOutflows || 0) - (s.totalExpenses || 0))
    const netCF     = s.netCashflow || 0
    const surplus   = netCF > 0 ? netCF : 0
    const deficit   = netCF < 0 ? Math.abs(netCF) : 0

    // ── LEFT: income sources ─────────────────────────────────────────────────
    // Gross salary is shown pre-income-tax so the tax node on the right is meaningful.
    const rawLeft = []
    if (salaryA   > 0)    rawLeft.push({ id: 'salaryA',   label: `${personAName} gross salary`,          value: salaryA,   color: C.salaryA   })
    if (salaryB   > 0)    rawLeft.push({ id: 'salaryB',   label: `${personBName} gross salary`,          value: salaryB,   color: C.salaryB   })
    if (rentalNet > 500)  rawLeft.push({ id: 'rental',    label: 'Net rental income',                    value: rentalNet, color: C.rental    })
    if (dividends > 100)  rawLeft.push({ id: 'dividends', label: 'Dividends & franking',                 value: dividends, color: C.dividends })
    if (superA    > 100)  rawLeft.push({ id: 'superA',    label: `Super pension (${personAName})`,       value: superA,    color: C.superA    })
    if (superB    > 100)  rawLeft.push({ id: 'superB',    label: `Super pension (${personBName})`,       value: superB,    color: C.superB    })
    if (bondW     > 100)  rawLeft.push({ id: 'bonds',     label: 'Bond withdrawals',                     value: bondW,     color: C.bonds     })
    if (sharesD   > 100)  rawLeft.push({ id: 'shares',    label: 'Shares sold (gap funding)',   value: sharesD,   color: C.shares    })
    if (cashD     > 100)  rawLeft.push({ id: 'cashD',     label: 'Cash reserves drawn',         value: cashD,     color: '#94a3b8'   })
    if (propSale  > 100)  rawLeft.push({ id: 'propSale',  label: 'Property sale proceeds',      value: propSale,  color: C.propSale  })

    // ── RIGHT: uses of income ─────────────────────────────────────────────────
    const rawRight = []
    if (totalTax  > 100)  rawRight.push({ id: 'tax',      label: 'Income tax & Medicare',                value: totalTax,  color: C.tax      })
    if (livingExp > 100)  rawRight.push({ id: 'expenses', label: 'Living expenses',                      value: livingExp, color: C.expenses })
    if (mortgage  > 100)  rawRight.push({ id: 'mortgage', label: 'Mortgage repayments',                  value: mortgage,  color: C.mortgage })
    if (surplus   > 100)  rawRight.push({ id: 'surplus',  label: 'Surplus → savings & investments',      value: surplus,   color: C.surplus  })
    if (deficit   > 100)  rawRight.push({ id: 'deficit',  label: 'Deficit (all sources exhausted)',      value: deficit,   color: C.deficit  })

    const totalLeft  = rawLeft.reduce((s, n) => s + n.value, 0)
    const totalRight = rawRight.reduce((s, n) => s + n.value, 0)
    if (totalLeft === 0 || totalRight === 0) return empty

    // ── Scale ─────────────────────────────────────────────────────────────────
    const maxTotal = Math.max(totalLeft, totalRight)
    const scale    = (SVG_H * 0.84) / maxTotal
    const sized    = nodes => nodes.map(n => ({ ...n, h: Math.max(4, n.value * scale) }))

    const leftNodes  = layoutCol(sized(rawLeft))
    const rightNodes = layoutCol(sized(rawRight))

    // ── Budget Sankey links ───────────────────────────────────────────────────
    // Each income source i proportionally contributes to each expense j.
    // flow(i,j) = leftNode_i.value × (rightNode_j.value / totalRight)
    //
    // Port trackers advance as ribbons are "stacked" on each node edge.
    const portR = {}
    const portL = {}
    leftNodes.forEach(n  => { portR[n.id] = n.y })
    rightNodes.forEach(n => { portL[n.id] = n.y })

    const links = []
    leftNodes.forEach(li => {
      rightNodes.forEach(ri => {
        const flow = li.value * (ri.value / totalRight)
        if (flow < 50) return              // skip trivially thin ribbons
        const h  = Math.max(1, flow * scale)
        const y0 = portR[li.id]
        const y1 = portL[ri.id]
        portR[li.id] = (portR[li.id] || 0) + h
        portL[ri.id] = (portL[ri.id] || 0) + h
        links.push({
          x0: LEFT_X + NODE_W, y0, h0: h,
          x1: RIGHT_X,         y1, h1: h,
          color: li.color,
        })
      })
    })

    return { leftNodes, rightNodes, links }
  }, [snapshot, personAName, personBName])

  if (!leftNodes.length) {
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
      aria-label="Annual cashflow flow diagram"
    >
      {/* Column headings */}
      <text x={LEFT_X + NODE_W / 2} y={-14} textAnchor="middle"
        fill="#9ca3af" fontSize={9} fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
        INCOME SOURCES
      </text>
      <text x={RIGHT_X + NODE_W / 2} y={-14} textAnchor="middle"
        fill="#9ca3af" fontSize={9} fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
        USES OF INCOME
      </text>

      {/* Ribbons (behind nodes) */}
      {links.map((lnk, i) => <Ribbon key={i} {...lnk} />)}

      {/* Income nodes + labels */}
      {leftNodes.map(n  => <NodeLabel key={n.id} n={n} side="left"  />)}

      {/* Expense nodes + labels */}
      {rightNodes.map(n => <NodeLabel key={n.id} n={n} side="right" />)}
    </svg>
  )
}
