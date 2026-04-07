import { useMemo } from 'react'

const EVENT_COLORS = {
  retirement: '#60a5fa',  // blue-400
  super:      '#f59e0b',  // amber-400
  property:   '#34d399',  // emerald-400
  pension:    '#fbbf24',  // amber-300
  debt:       '#fb923c',  // orange-400
  deficit:    '#f87171',  // red-400
  lease:      '#94a3b8',  // slate-400
  expense:    '#fb7185',  // rose-400
  income:     '#a78bfa',  // violet-400
}

/**
 * Parse a year (number) or month string ("2029-08") into a numeric sortKey
 * and a display label. sortKey uses fractional year for month precision.
 */
function parseEventDate(value) {
  if (typeof value === 'number') {
    return { sortKey: value, display: String(value) }
  }
  if (typeof value === 'string') {
    // "2029-08" or "2029"
    const parts = value.split('-')
    const year = parseInt(parts[0], 10)
    if (parts.length >= 2) {
      const month = parseInt(parts[1], 10)
      const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return { sortKey: year + (month - 1) / 12, display: `${monthNames[month]} ${year}` }
    }
    return { sortKey: year, display: String(year) }
  }
  return { sortKey: 0, display: '—' }
}

/**
 * Extract life events from scenario config + simulation snapshots.
 * Returns sorted array of { sortKey, display, label, color }.
 */
function extractEvents(scenario, snapshots) {
  const events = []
  if (!scenario || !snapshots?.length) return events

  const personAName = scenario.household?.personA?.name || 'Person A'
  const personBName = scenario.household?.personB?.name || 'Person B'

  function push(dateValue, label, color) {
    const { sortKey, display } = parseEventDate(dateValue)
    events.push({ sortKey, display, label, color })
  }

  // Retirement years
  const retireA = snapshots.find(s => s.retiredA && !snapshots.find(p => p.year === s.year - 1 && p.retiredA))
  const retireB = snapshots.find(s => s.retiredB && !snapshots.find(p => p.year === s.year - 1 && p.retiredB))
  if (retireA && retireB && retireA.year === retireB.year) {
    push(retireA.year, 'Both retire', EVENT_COLORS.retirement)
  } else {
    if (retireA) push(retireA.year, `${personAName} retires`, EVENT_COLORS.retirement)
    if (retireB) push(retireB.year, `${personBName} retires`, EVENT_COLORS.retirement)
  }

  // Salary changes
  const personA = scenario.household?.personA
  const personB = scenario.household?.personB
  ;(personA?.salaryChanges || []).forEach(change => {
    if (change.fromYear) {
      const label = change.note || (change.salary === 0 ? 'Career break' : 'Salary change')
      push(change.fromYear, `${personAName}: ${label}`, EVENT_COLORS.income)
    }
  })
  ;(personB?.salaryChanges || []).forEach(change => {
    if (change.fromYear) {
      const label = change.note || (change.salary === 0 ? 'Career break' : 'Salary change')
      push(change.fromYear, `${personBName}: ${label}`, EVENT_COLORS.income)
    }
  })

  // Super unlock
  const unlockA = snapshots.find(s => s.superAUnlocked)
  const unlockB = snapshots.find(s => s.superBUnlocked)
  if (unlockA) push(unlockA.year, `${personAName} super unlocks`, EVENT_COLORS.super)
  if (unlockB && unlockB.year !== unlockA?.year) push(unlockB.year, `${personBName} super unlocks`, EVENT_COLORS.super)

  // Property purchases (future)
  ;(scenario.properties || []).forEach((prop, i) => {
    if (prop.futurePurchaseYear) {
      const name = prop.isPrimaryResidence ? 'Home' : (prop.name || `Property ${i + 1}`)
      push(prop.futurePurchaseYear, `Buy ${name}`, EVENT_COLORS.property)
    }
  })

  // Property sales
  ;(scenario.properties || []).forEach((prop, i) => {
    if (prop.saleEvent?.year) {
      const name = prop.isPrimaryResidence ? 'Home' : (prop.name || `Property ${i + 1}`)
      push(prop.saleEvent.year, `Sell ${name}`, EVENT_COLORS.property)
    }
  })

  // Mortgage payoffs
  ;(scenario.properties || []).forEach((prop, i) => {
    if (prop.mortgageBalance > 0) {
      const payoffSnap = snapshots.find(s => {
        const prev = snapshots.find(p => p.year === s.year - 1)
        const currBal = s.propertyResults?.[i]?.mortgageBalance ?? 0
        const prevBal = prev?.propertyResults?.[i]?.mortgageBalance ?? 0
        return prevBal > 100 && currBal < 100
      })
      if (payoffSnap) {
        const name = prop.isPrimaryResidence ? 'Home' : (prop.name || `Property ${i + 1}`)
        if (!prop.saleEvent || payoffSnap.year !== prop.saleEvent.year) {
          push(payoffSnap.year, `${name} mortgage paid`, EVENT_COLORS.property)
        }
      }
    }
  })

  // Debt payoffs
  ;(scenario.debts || []).forEach((debt, i) => {
    const payoffSnap = snapshots.find(s => {
      const prev = snapshots.find(p => p.year === s.year - 1)
      const currBal = s.debtResult?.results?.[i]?.closingBalance ?? 0
      const prevBal = prev?.debtResult?.results?.[i]?.closingBalance ?? 0
      return prevBal > 100 && currBal < 100
    })
    if (payoffSnap) {
      push(payoffSnap.year, `${debt.name || 'Debt'} paid off`, EVENT_COLORS.debt)
    }
  })

  // Age Pension
  const pensionStart = snapshots.find(s => (s.agePension?.totalPension ?? 0) > 0)
  if (pensionStart) push(pensionStart.year, 'Age Pension starts', EVENT_COLORS.pension)

  // Novated lease end — uses month string "2029-08"
  if (personA?.packaging?.novatedLease?.activeYears?.to) {
    push(personA.packaging.novatedLease.activeYears.to, `${personAName} lease ends`, EVENT_COLORS.lease)
  }
  if (personB?.packaging?.novatedLease?.activeYears?.to) {
    push(personB.packaging.novatedLease.activeYears.to, `${personBName} lease ends`, EVENT_COLORS.lease)
  }

  // First deficit year
  if (snapshots.firstDeficitYear) {
    push(snapshots.firstDeficitYear, 'Liquidity exhausted', EVENT_COLORS.deficit)
  }

  // Downsizer contributions
  const downsizerSnap = snapshots.find(s => (s.totalDownsizer ?? 0) > 0)
  if (downsizerSnap) push(downsizerSnap.year, 'Downsizer contribution', EVENT_COLORS.super)

  // One-off and large recurring expenses
  const LARGE_EXPENSE_THRESHOLD = 10_000
  function walkExpenses(items) {
    if (!items) return
    for (const item of items) {
      if (item.children?.length > 0) {
        walkExpenses(item.children)
        continue
      }
      const amt = item.amount || 0
      if (item.amountType === 'one_off' && amt >= LARGE_EXPENSE_THRESHOLD) {
        const yr = item.activeFrom || item.startYear
        if (yr) push(yr, item.label || 'One-off expense', EVENT_COLORS.expense)
      } else if (item.amountType === 'recurring' && amt >= LARGE_EXPENSE_THRESHOLD) {
        const yr = item.activeFrom || item.startYear
        if (yr) push(yr, `${item.label || 'Recurring'} (every ${item.recurringEveryYears || '?'}yr)`, EVENT_COLORS.expense)
      }
    }
  }
  walkExpenses(scenario.expenses?.children)

  // Windfall / large one-off income sources
  ;(scenario.otherIncome || []).forEach(inc => {
    if (!inc.activeFrom) return
    const amt = inc.amount || 0
    if (inc.amountType === 'one_off' && amt >= LARGE_EXPENSE_THRESHOLD) {
      push(inc.activeFrom, inc.name || 'Windfall', EVENT_COLORS.income)
    }
  })

  events.sort((a, b) => a.sortKey - b.sortKey)
  return events
}

// Vertical clearance for labels above and below the dot row
const LABEL_CLEARANCE = 22 // px

export default function LifeEventsTimeline({ scenario, snapshots }) {
  const events = useMemo(() => extractEvents(scenario, snapshots), [scenario, snapshots])

  if (events.length === 0) return null

  return (
    <div className="card overflow-x-auto">
      <h2 className="text-sm font-semibold text-gray-300 mb-3">Life Events</h2>

      <div
        className="relative min-w-max px-2"
        style={{ paddingTop: `${LABEL_CLEARANCE}px`, paddingBottom: `${LABEL_CLEARANCE}px` }}
      >
        <div className="flex items-center gap-0">
          {events.map((evt, i) => {
            // Alternate labels above (even) and below (odd)
            const above = i % 2 === 0
            return (
              <div key={`${evt.sortKey}-${evt.label}`} className="flex items-center">
                <div className="flex flex-col items-center flex-shrink-0 relative" style={{ minWidth: '76px' }}>
                  {/* Label above dot */}
                  {above && (
                    <p
                      className="absolute text-[10px] font-medium whitespace-nowrap"
                      style={{
                        color: evt.color,
                        bottom: '30px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                      }}
                    >
                      {evt.label}
                    </p>
                  )}

                  {/* Dot */}
                  <div
                    className="w-3 h-3 rounded-full border-2 border-gray-900 flex-shrink-0 relative z-10"
                    style={{ backgroundColor: evt.color }}
                  />

                  {/* Date below dot */}
                  <p className="text-[10px] text-gray-500 mt-1">{evt.display}</p>

                  {/* Label below date */}
                  {!above && (
                    <p
                      className="absolute text-[10px] font-medium whitespace-nowrap"
                      style={{
                        color: evt.color,
                        top: '30px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                      }}
                    >
                      {evt.label}
                    </p>
                  )}
                </div>

                {/* Connector line */}
                {i < events.length - 1 && (
                  <div className="h-px bg-gray-700 flex-shrink-0" style={{ width: '14px' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
