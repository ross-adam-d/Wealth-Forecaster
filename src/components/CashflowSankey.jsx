/**
 * CashflowSankey — annual cashflow diagram
 *
 * LEFT: all money flowing into the household budget this year
 * RIGHT: all uses / destinations of that money
 *
 * The diagram is balanced: LEFT total = RIGHT total.
 * Gross salary is shown pre-tax so the tax burden is visible on the right.
 * Mortgage lump-sum payoffs (payOffWhenAble) appear as a matched left/right pair.
 */
import { useMemo } from 'react'

// ── Layout constants ──────────────────────────────────────────────────────────
const SVG_W   = 940
const SVG_H   = 320
const NODE_W  = 16
const MIN_GAP = 6

const LEFT_X  = 220
const RIGHT_X = 700

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  salaryA:      '#0ea5e9',  // sky-500
  salaryB:      '#38bdf8',  // sky-400
  rental:       '#34d399',  // emerald-400
  dividends:    '#a78bfa',  // violet-400
  superDraw:    '#f59e0b',  // amber-500
  bondW:        '#fbbf24',  // amber-400
  sharesD:      '#4ade80',  // green-400
  cashD:        '#94a3b8',  // slate-400
  otherInc:     '#c084fc',  // purple-400
  propSale:     '#2dd4bf',  // teal-400
  payoffAssets: '#f97316',  // orange-500
  tax:          '#f87171',  // red-400
  expenses:     '#ef4444',  // red-500
  mortgage:     '#fca5a5',  // red-300
  lease:        '#fb923c',  // orange-400
  contribs:     '#818cf8',  // indigo-400
  dirProceeds:  '#2dd4bf',  // teal-400
  payoffDebt:   '#f97316',  // orange-500
  surplus:      '#4ade80',  // green-400
  deficit:      '#f87171',  // red-400
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt$(n) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

function layoutCol(nodes) {
  const totalH = nodes.reduce((s, n) => s + n.h, 0)
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

function NodeLabel({ n, side }) {
  const isLeft = side === 'left'
  const lx  = isLeft ? LEFT_X - 8 : RIGHT_X + NODE_W + 8
  const anchor = isLeft ? 'end' : 'start'
  const nx  = isLeft ? LEFT_X : RIGHT_X

  return (
    <g>
      <rect x={nx} y={n.y} width={NODE_W} height={n.h} fill={n.color} rx={2} />
      <text
        x={lx} y={n.h >= 18 ? n.y + n.h / 2 - 5 : n.y + n.h / 2}
        textAnchor={anchor} dominantBaseline="middle"
        fill={n.color} fontSize={10} fontFamily="system-ui, sans-serif"
      >
        {n.label}
      </text>
      {n.h >= 18 && (
        <text
          x={lx} y={n.y + n.h / 2 + 9}
          textAnchor={anchor} dominantBaseline="middle"
          fill={n.color} fontSize={9} opacity={0.65} fontFamily="system-ui, sans-serif"
        >
          {fmt$(n.value)}
        </text>
      )}
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
export default function CashflowSankey({ snapshot, scenario, transform }) {
  const personAName = scenario?.household?.personA?.name || 'Person A'
  const personBName = scenario?.household?.personB?.name || 'Person B'
  const tx = transform || (v => v)

  const { leftNodes, rightNodes, links } = useMemo(() => {
    const empty = { leftNodes: [], rightNodes: [], links: [] }
    if (!snapshot) return empty

    const s = snapshot
    const yr = s.year

    // ── LEFT: all money flowing in ───────────────────────────────────────────
    // Gross salary shown pre-tax so tax burden is visible on right.
    const salaryA   = tx(s.salaryA || 0, yr)
    const salaryB   = tx(s.salaryB || 0, yr)
    const rentalNet = tx(Math.max(0, s.propertyResults?.reduce((sum, r) => sum + r.netRentalIncomeLoss, 0) || 0), yr)
    const dividends = tx((s.sharesResult?.cashDividend || 0) + (s.taxA?.frankingRefund || 0) + (s.taxB?.frankingRefund || 0), yr)
    const superDraw = tx((s.superA?.drawdown || 0) + (s.superAExtra || 0) + (s.superB?.drawdown || 0) + (s.superBExtra || 0), yr)
    const bondW     = tx(s.bondResults?.reduce((sum, r) => sum + r.withdrawal, 0) || 0, yr)
    const sharesD   = tx(s.sharesDrawdown || 0, yr)
    const cashD     = tx(s.cashDrawdown || 0, yr)
    const otherInc  = tx(s.totalOtherIncome || 0, yr)
    // Property sale proceeds = net sale price minus mortgage repaid from proceeds (equity released)
    const propSale  = tx(s.propertyResults?.reduce((sum, r) => sum + (r.saleProceeds || 0), 0) || 0, yr)
    // Mortgage lump-sum payoff (payOffWhenAble) — matched on left + right as a balance-sheet event
    const payoffAmt = tx(s.mortgagePayoffTotal || 0, yr)

    const rawLeft = []
    if (salaryA   > 100) rawLeft.push({ id: 'salaryA',   label: `${personAName} salary (gross)`,   value: salaryA,   color: C.salaryA   })
    if (salaryB   > 100) rawLeft.push({ id: 'salaryB',   label: `${personBName} salary (gross)`,   value: salaryB,   color: C.salaryB   })
    if (rentalNet > 100) rawLeft.push({ id: 'rental',    label: 'Net rental income',               value: rentalNet, color: C.rental    })
    if (dividends > 100) rawLeft.push({ id: 'dividends', label: 'Dividends & franking',            value: dividends, color: C.dividends })
    if (superDraw > 100) rawLeft.push({ id: 'superDraw', label: 'Super pension drawdown',          value: superDraw, color: C.superDraw })
    if (bondW     > 100) rawLeft.push({ id: 'bondW',     label: 'Bond withdrawals',               value: bondW,     color: C.bondW     })
    if (sharesD   > 100) rawLeft.push({ id: 'sharesD',   label: 'Shares sold',                    value: sharesD,   color: C.sharesD   })
    if (cashD     > 100) rawLeft.push({ id: 'cashD',     label: 'Cash reserves drawn',            value: cashD,     color: C.cashD     })
    if (otherInc  > 100) rawLeft.push({ id: 'otherInc',  label: 'Other income',                   value: otherInc,  color: C.otherInc  })
    if (propSale  > 100) rawLeft.push({ id: 'propSale',  label: 'Property sale proceeds',         value: propSale,  color: C.propSale  })
    if (payoffAmt > 100) rawLeft.push({ id: 'payoff',    label: 'Liquid assets → mortgage payoff',value: payoffAmt, color: C.payoffAssets })

    // ── RIGHT: all uses of money ─────────────────────────────────────────────
    const totalTax  = tx((s.taxA?.totalTaxPayable || 0) + (s.taxB?.totalTaxPayable || 0) + (s.totalDiv293Tax || 0), yr)
    const livingExp = tx(s.totalExpenses || 0, yr)
    // Use direct repayment fields — NOT derived from totalOutflows (which includes contributions)
    const mortgageR = tx(s.totalMortgageRepayments || 0, yr)
    const debtR     = tx(s.totalDebtRepayments || 0, yr)
    const leaseNet  = tx(s.totalLeasePostTaxCost || 0, yr)
    // Fixed investment contributions (shares/bonds/TB/comm/other in fixed mode)
    const fixedContribs = tx(s.cappedFixedContributions || 0, yr)
    // Sale proceeds directed to investments (not flowing through surplus waterfall)
    const dirProceeds = tx(s.totalDirectedSaleProceeds || 0, yr)
    // Remaining surplus routed to savings/investments via waterfall
    const netCF     = tx(s.netCashflow || 0, yr)
    const surplus   = netCF > 0 ? netCF : 0
    const deficit   = netCF < 0 ? Math.abs(netCF) : 0

    const rawRight = []
    if (totalTax     > 100) rawRight.push({ id: 'tax',        label: 'Income tax & Medicare',           value: totalTax,     color: C.tax         })
    if (livingExp    > 100) rawRight.push({ id: 'expenses',   label: 'Living expenses',                 value: livingExp,    color: C.expenses    })
    if (mortgageR    > 100) rawRight.push({ id: 'mortgage',   label: 'Mortgage repayments',             value: mortgageR,    color: C.mortgage    })
    if (debtR        > 100) rawRight.push({ id: 'debt',       label: 'Debt repayments',                 value: debtR,        color: C.mortgage    })
    if (leaseNet     > 100) rawRight.push({ id: 'lease',      label: 'Novated lease (net)',             value: leaseNet,     color: C.lease       })
    if (fixedContribs > 100) rawRight.push({ id: 'contribs', label: 'Investment contributions',        value: fixedContribs,color: C.contribs    })
    if (dirProceeds  > 100) rawRight.push({ id: 'dirProc',   label: 'Sale proceeds → investments',     value: dirProceeds,  color: C.dirProceeds })
    if (surplus      > 100) rawRight.push({ id: 'surplus',   label: 'Surplus → savings',               value: surplus,      color: C.surplus     })
    if (deficit      > 100) rawRight.push({ id: 'deficit',   label: 'Deficit (all sources exhausted)', value: deficit,      color: C.deficit     })
    if (payoffAmt    > 100) rawRight.push({ id: 'payoffOut', label: 'Mortgage paid off (lump sum)',     value: payoffAmt,    color: C.payoffDebt  })

    const totalLeft  = rawLeft.reduce((s, n) => s + n.value, 0)
    const totalRight = rawRight.reduce((s, n) => s + n.value, 0)
    if (totalLeft === 0 || totalRight === 0) return empty

    // Scale to the larger side so both columns fit within SVG_H
    const maxTotal = Math.max(totalLeft, totalRight)
    const scale    = (SVG_H * 0.84) / maxTotal
    const sized    = nodes => nodes.map(n => ({ ...n, h: Math.max(4, n.value * scale) }))

    const leftNodes  = layoutCol(sized(rawLeft))
    const rightNodes = layoutCol(sized(rawRight))

    // Ribbons: each left node proportionally fans to every right node
    const portR = {}
    const portL = {}
    leftNodes.forEach(n  => { portR[n.id] = n.y })
    rightNodes.forEach(n => { portL[n.id] = n.y })

    const links = []
    leftNodes.forEach(li => {
      rightNodes.forEach(ri => {
        const flow = li.value * (ri.value / totalRight)
        if (flow < 50) return
        const h  = Math.max(1, flow * scale)
        const y0 = portR[li.id]
        const y1 = portL[ri.id]
        portR[li.id] = (portR[li.id] || 0) + h
        portL[ri.id] = (portL[ri.id] || 0) + h
        links.push({ x0: LEFT_X + NODE_W, y0, h0: h, x1: RIGHT_X, y1, h1: h, color: li.color })
      })
    })

    return { leftNodes, rightNodes, links }
  }, [snapshot, personAName, personBName, tx])

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
      <text x={LEFT_X + NODE_W / 2} y={-14} textAnchor="middle"
        fill="#9ca3af" fontSize={9} fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
        MONEY IN
      </text>
      <text x={RIGHT_X + NODE_W / 2} y={-14} textAnchor="middle"
        fill="#9ca3af" fontSize={9} fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
        MONEY OUT / ALLOCATED
      </text>

      {links.map((lnk, i) => <Ribbon key={i} {...lnk} />)}
      {leftNodes.map(n  => <NodeLabel key={n.id} n={n} side="left"  />)}
      {rightNodes.map(n => <NodeLabel key={n.id} n={n} side="right" />)}
    </svg>
  )
}
