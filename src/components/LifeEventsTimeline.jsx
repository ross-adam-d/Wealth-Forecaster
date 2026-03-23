import { useMemo } from 'react'

const EVENT_COLORS = {
  retirement: '#60a5fa',  // blue-400
  super:      '#f59e0b',  // amber-400
  property:   '#34d399',  // emerald-400
  pension:    '#fbbf24',  // amber-300
  debt:       '#fb923c',  // orange-400
  deficit:    '#f87171',  // red-400
  lease:      '#94a3b8',  // slate-400
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

  // Super unlock
  const unlockA = snapshots.find(s => s.superAUnlocked)
  const unlockB = snapshots.find(s => s.superBUnlocked)
  if (unlockA) push(unlockA.year, `${personAName} super unlocks`, EVENT_COLORS.super)
  if (unlockB && unlockB.year !== unlockA?.year) push(unlockB.year, `${personBName} super unlocks`, EVENT_COLORS.super)

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
  const personA = scenario.household?.personA
  const personB = scenario.household?.personB
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

  events.sort((a, b) => a.sortKey - b.sortKey)
  return events
}

/**
 * Assign stagger levels (0, 1, 2) to avoid label overlap.
 * Events within PROXIMITY of each other on the timeline get offset
 * to different vertical tiers with callout lines.
 */
function assignStaggerLevels(events) {
  if (events.length === 0) return []
  const PROXIMITY = 2 // years — events closer than this get staggered

  const result = events.map(e => ({ ...e, level: 0 }))
  for (let i = 1; i < result.length; i++) {
    // Check against previous events that are within proximity
    const nearbyLevels = new Set()
    for (let j = i - 1; j >= 0 && result[i].sortKey - result[j].sortKey < PROXIMITY; j--) {
      nearbyLevels.add(result[j].level)
    }
    // Pick lowest available level
    let level = 0
    while (nearbyLevels.has(level)) level++
    result[i].level = level
  }
  return result
}

const CALLOUT_HEIGHTS = [0, 24, 48]  // px offset per stagger level

export default function LifeEventsTimeline({ scenario, snapshots }) {
  const events = useMemo(() => extractEvents(scenario, snapshots), [scenario, snapshots])
  const staggered = useMemo(() => assignStaggerLevels(events), [events])

  if (staggered.length === 0) return null

  const maxLevel = Math.max(...staggered.map(e => e.level))
  // Extra top padding for callout lines
  const topPadding = maxLevel > 0 ? CALLOUT_HEIGHTS[Math.min(maxLevel, 2)] + 20 : 0

  return (
    <div className="card overflow-x-auto">
      <h2 className="text-sm font-semibold text-gray-300 mb-3">Life Events</h2>

      <div
        className="relative min-w-max px-2"
        style={{ paddingTop: `${topPadding}px`, paddingBottom: '4px' }}
      >
        {/* Horizontal track line — sits at the dot level */}
        <div className="flex items-center gap-0">
          {staggered.map((evt, i) => (
            <div key={`${evt.sortKey}-${evt.label}`} className="flex items-center">
              {/* Column for this event */}
              <div className="flex flex-col items-center flex-shrink-0 relative" style={{ minWidth: '90px' }}>
                {/* Callout line + label above dot */}
                <div
                  className="absolute flex flex-col items-center z-20"
                  style={{
                    bottom: '30px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                >
                  {/* Label */}
                  <p
                    className="text-[10px] font-medium whitespace-nowrap"
                    style={{
                      color: evt.color,
                      marginBottom: '2px',
                      transform: `translateY(-${CALLOUT_HEIGHTS[Math.min(evt.level, 2)]}px)`,
                    }}
                  >
                    {evt.label}
                  </p>
                  {/* Callout line — only visible when staggered */}
                  {evt.level > 0 && (
                    <div
                      className="w-px absolute"
                      style={{
                        backgroundColor: evt.color,
                        opacity: 0.3,
                        height: `${CALLOUT_HEIGHTS[Math.min(evt.level, 2)]}px`,
                        bottom: '0px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                      }}
                    />
                  )}
                </div>

                {/* Dot */}
                <div
                  className="w-3 h-3 rounded-full border-2 border-gray-900 flex-shrink-0 relative z-10"
                  style={{ backgroundColor: evt.color }}
                />
                {/* Date below */}
                <p className="text-[10px] text-gray-500 mt-1">{evt.display}</p>
              </div>

              {/* Connector line */}
              {i < staggered.length - 1 && (
                <div className="h-px bg-gray-700 flex-shrink-0" style={{ width: '24px' }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
