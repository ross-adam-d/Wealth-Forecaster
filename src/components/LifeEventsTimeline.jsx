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
 * Extract life events from scenario config + simulation snapshots.
 * Returns sorted array of { year, label, color, icon }.
 */
function extractEvents(scenario, snapshots) {
  const events = []
  if (!scenario || !snapshots?.length) return events

  const personAName = scenario.household?.personA?.name || 'Person A'
  const personBName = scenario.household?.personB?.name || 'Person B'

  // Retirement years
  const retireA = snapshots.find(s => s.retiredA && !snapshots.find(p => p.year === s.year - 1 && p.retiredA))
  const retireB = snapshots.find(s => s.retiredB && !snapshots.find(p => p.year === s.year - 1 && p.retiredB))
  if (retireA) events.push({ year: retireA.year, label: `${personAName} retires`, color: EVENT_COLORS.retirement })
  if (retireB && retireB.year !== retireA?.year) events.push({ year: retireB.year, label: `${personBName} retires`, color: EVENT_COLORS.retirement })
  if (retireB && retireA && retireB.year === retireA.year) {
    // Replace with combined event
    events.pop() // remove A
    events.push({ year: retireA.year, label: 'Both retire', color: EVENT_COLORS.retirement })
  }

  // Super unlock (preservation age — when isLocked transitions to false)
  const unlockA = snapshots.find(s => s.superAUnlocked)
  const unlockB = snapshots.find(s => s.superBUnlocked)
  if (unlockA) events.push({ year: unlockA.year, label: `${personAName} super unlocks`, color: EVENT_COLORS.super })
  if (unlockB && unlockB.year !== unlockA?.year) events.push({ year: unlockB.year, label: `${personBName} super unlocks`, color: EVENT_COLORS.super })

  // Property sales
  ;(scenario.properties || []).forEach((prop, i) => {
    if (prop.saleEvent?.year) {
      const name = prop.isPrimaryResidence ? 'Home' : (prop.name || `Property ${i + 1}`)
      events.push({ year: prop.saleEvent.year, label: `Sell ${name}`, color: EVENT_COLORS.property })
    }
  })

  // Mortgage payoffs (when balance hits 0)
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
        // Don't add if same year as sale
        if (!prop.saleEvent || payoffSnap.year !== prop.saleEvent.year) {
          events.push({ year: payoffSnap.year, label: `${name} mortgage paid`, color: EVENT_COLORS.property })
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
      events.push({ year: payoffSnap.year, label: `${debt.name || 'Debt'} paid off`, color: EVENT_COLORS.debt })
    }
  })

  // Age Pension eligibility (first year pension > 0)
  const pensionStart = snapshots.find(s => (s.agePension?.totalPension ?? 0) > 0)
  if (pensionStart) events.push({ year: pensionStart.year, label: 'Age Pension starts', color: EVENT_COLORS.pension })

  // Novated lease end
  const personA = scenario.household?.personA
  const personB = scenario.household?.personB
  if (personA?.packaging?.novatedLease?.activeYears?.to) {
    events.push({ year: personA.packaging.novatedLease.activeYears.to, label: `${personAName} lease ends`, color: EVENT_COLORS.lease })
  }
  if (personB?.packaging?.novatedLease?.activeYears?.to) {
    events.push({ year: personB.packaging.novatedLease.activeYears.to, label: `${personBName} lease ends`, color: EVENT_COLORS.lease })
  }

  // First deficit year
  if (snapshots.firstDeficitYear) {
    events.push({ year: snapshots.firstDeficitYear, label: 'Liquidity exhausted', color: EVENT_COLORS.deficit })
  }

  // Downsizer contributions
  const downsizerSnap = snapshots.find(s => (s.totalDownsizer ?? 0) > 0)
  if (downsizerSnap) events.push({ year: downsizerSnap.year, label: 'Downsizer contribution', color: EVENT_COLORS.super })

  // Sort by year, deduplicate same year+label
  events.sort((a, b) => a.year - b.year)
  return events
}

export default function LifeEventsTimeline({ scenario, snapshots }) {
  const events = useMemo(() => extractEvents(scenario, snapshots), [scenario, snapshots])

  if (events.length === 0) return null

  const startYear = events[0].year
  const endYear = events[events.length - 1].year
  const span = Math.max(endYear - startYear, 1)

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-gray-300 mb-4">Life Events</h2>

      {/* Timeline bar */}
      <div className="relative">
        {/* Track */}
        <div className="h-0.5 bg-gray-700 rounded-full mx-4" />

        {/* Events positioned along the track */}
        <div className="relative h-20 mx-4">
          {events.map((evt, i) => {
            const pct = ((evt.year - startYear) / span) * 100
            // Alternate above/below to avoid overlap
            const isAbove = i % 2 === 0
            return (
              <div
                key={`${evt.year}-${evt.label}`}
                className="absolute flex flex-col items-center"
                style={{
                  left: `${pct}%`,
                  transform: 'translateX(-50%)',
                  top: isAbove ? '0px' : '40px',
                }}
              >
                {/* Dot */}
                <div
                  className="w-2.5 h-2.5 rounded-full border-2 border-gray-900 flex-shrink-0"
                  style={{ backgroundColor: evt.color, order: isAbove ? 2 : 0 }}
                />
                {/* Connector line */}
                <div
                  className="w-px h-2 flex-shrink-0"
                  style={{ backgroundColor: evt.color, opacity: 0.4, order: 1 }}
                />
                {/* Label */}
                <div
                  className="text-center flex-shrink-0"
                  style={{ order: isAbove ? 0 : 2 }}
                >
                  <p className="text-[10px] font-medium whitespace-nowrap" style={{ color: evt.color }}>
                    {evt.label}
                  </p>
                  <p className="text-[9px] text-gray-500">{evt.year}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
