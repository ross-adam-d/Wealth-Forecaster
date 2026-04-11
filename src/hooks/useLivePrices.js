/**
 * useLivePrices — silently refreshes stale ticker prices in the active scenario.
 *
 * On mount and whenever the active scenario changes, collects all share and
 * treasury bond holdings that have a ticker but a stale (or missing) livePrice,
 * batches them into a single API call, and patches the scenario in-place.
 *
 * A price is considered stale if it was fetched more than 24 hours ago.
 * Runs once per activeId change; a ref guard prevents concurrent fetches.
 */

import { useEffect, useRef } from 'react'

const STALE_MS = 24 * 60 * 60 * 1000  // 24 hours

function isStale(fetchedAt) {
  if (!fetchedAt) return true
  return (Date.now() - new Date(fetchedAt).getTime()) > STALE_MS
}

export function useLivePrices(scenarios, updateScenario, activeId) {
  const fetchingRef = useRef(false)

  useEffect(() => {
    if (fetchingRef.current) return

    const scenario = scenarios?.find(s => s.id === activeId)
    if (!scenario) return

    // Collect unique stale tickers
    const staleTickers = new Set()

    for (const h of (scenario.shares?.holdings || [])) {
      if (h.ticker && isStale(h.livePriceFetchedAt)) staleTickers.add(h.ticker.toUpperCase())
    }
    for (const h of (scenario.treasuryBonds?.holdings || [])) {
      if (h.ticker && isStale(h.livePriceFetchedAt)) staleTickers.add(h.ticker.toUpperCase())
    }

    if (staleTickers.size === 0) return

    fetchingRef.current = true

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12_000)  // 12s — abort if Yahoo hangs

    fetch(`/api/stock-price?tickers=${[...staleTickers].join(',')}`, { signal: controller.signal })
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
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps
}
