/**
 * GET /api/stock-price?tickers=CBA.AX,VAS.AX,AAPL
 *
 * Proxies Yahoo Finance v8 chart endpoint (one request per ticker, parallel).
 * v8/finance/chart works without cookie/crumb auth; v7/finance/quote now returns 401.
 *
 * Returns a map of ticker → price info.
 * Null entry means the ticker was not found or the fetch failed for that symbol.
 *
 * Results are cached at the CDN edge for 1 hour.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

async function fetchOne(ticker, signal) {
  // Use 5d range so we always have recent closes to fall back to when the market
  // is closed (regularMarketTime === 0 means no live session data today).
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`
  try {
    const res = await fetch(url, {
      signal,
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    const meta = result?.meta
    if (!meta) return null

    // When the market has traded today, regularMarketPrice is the live price.
    // When regularMarketTime is 0 the price can be stale/wrong — use the most
    // recent valid close from the chart series instead.
    let price = null
    if (meta.regularMarketTime > 0 && meta.regularMarketPrice != null) {
      price = meta.regularMarketPrice
    } else {
      // Walk chart closes backwards to find the last non-null value
      const closes = result?.indicators?.quote?.[0]?.close ?? []
      for (let i = closes.length - 1; i >= 0; i--) {
        if (closes[i] != null) { price = closes[i]; break }
      }
    }

    if (price == null) return null

    return {
      price,
      currency:  meta.currency ?? null,
      name:      meta.shortName ?? meta.longName ?? null,
      fetchedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { tickers } = req.query
  if (!tickers) {
    return res.status(400).json({ error: 'tickers query param required' })
  }

  const tickerList = String(tickers)
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20)

  if (tickerList.length === 0) {
    return res.status(400).json({ error: 'no valid tickers' })
  }

  // Shared 8s abort — cancels all in-flight fetches if any hangs
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8_000)

  try {
    const results = await Promise.all(tickerList.map(t => fetchOne(t, controller.signal)))
    clearTimeout(timeoutId)

    const priceMap = {}
    tickerList.forEach((t, i) => { priceMap[t] = results[i] })

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json(priceMap)
  } catch {
    clearTimeout(timeoutId)
    return res.status(502).json({ error: 'fetch failed or timed out' })
  }
}
