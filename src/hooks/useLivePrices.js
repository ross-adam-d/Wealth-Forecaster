/**
 * useLivePrices — refreshes stale ticker prices whenever the active scenario's
 * stale-ticker set changes (on mount, scenario switch, OR when a new ticker is added).
 *
 * A price is considered stale if it was fetched more than 24 hours ago.
 * The effect key is a sorted comma-separated string of stale tickers — it only
 * re-fires when that set actually changes, preventing spurious re-fetches.
 */

import { useEffect, useRef } from 'react'

const STALE_MS = 24 * 60 * 60 * 1000  // 24 hours

function isStale(fetchedAt) {
  if (!fetchedAt) return true
  return (Date.now() - new Date(fetchedAt).getTime()) > STALE_MS
}

export function useLivePrices(scenarios, updateScenario, activeId) {
  const fetchingRef = useRef(false)

  const scenario = scenarios?.find(s => s.id === activeId)

  // Compute stale tickers on every render — cheap, and lets the effect
  // re-fire the moment a new ticker is entered (without needing activeId to change).
  const staleTickers = new Set()
  for (const h of (scenario?.shares?.holdings || [])) {
    if (h.ticker && isStale(h.livePriceFetchedAt)) staleTickers.add(h.ticker.toUpperCase())
  }
  for (const h of (scenario?.treasuryBonds?.holdings || [])) {
    if (h.ticker && isStale(h.livePriceFetchedAt)) staleTickers.add(h.ticker.toUpperCase())
  }

  // Stable string key — sorted so order doesn't matter, empty = nothing to fetch
  const staleKey = [...staleTickers].sort().join(',')

  useEffect(() => {
    if (!staleKey || !scenario) return
    if (fetchingRef.current) return

    fetchingRef.current = true

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12_000)

    fetch(`/api/stock-price?tickers=${staleKey}`, { signal: controller.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(priceMap => {
        if (!priceMap) return

        const fetchedAt = new Date().toISOString()

        const newSharesHoldings = (scenario.shares?.holdings || []).map(h => {
          if (!h.ticker) return h
          const entry = priceMap[h.ticker.toUpperCase()]
          if (!entry || entry.price == null) return h
          return { ...h, livePrice: entry.price, livePriceFetchedAt: fetchedAt }
        })

        const newTbHoldings = (scenario.treasuryBonds?.holdings || []).map(h => {
          if (!h.ticker) return h
          const entry = priceMap[h.ticker.toUpperCase()]
          if (!entry || entry.price == null) return h
          return { ...h, livePrice: entry.price, livePriceFetchedAt: fetchedAt }
        })

        updateScenario({
          shares:        { ...scenario.shares,        holdings: newSharesHoldings },
          treasuryBonds: { ...scenario.treasuryBonds, holdings: newTbHoldings },
        })
      })
      .catch(() => { /* silent — stale prices just stay stale */ })
      .finally(() => {
        clearTimeout(timeoutId)
        fetchingRef.current = false
      })
  }, [staleKey]) // eslint-disable-line react-hooks/exhaustive-deps
}
