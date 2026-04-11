/**
 * GET /api/stock-price?tickers=CBA.AX,VAS.AX,AAPL
 *
 * Proxies Yahoo Finance v7 quote endpoint. Returns a map of ticker → price info.
 * Null entry means the ticker was not found or the fetch failed for that symbol.
 *
 * Yahoo Finance requires a browser-like User-Agent to avoid 429s.
 * Results are cached at the CDN edge for 1 hour.
 */
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
    .slice(0, 20) // hard cap — don't let a single request fan out too far

  if (tickerList.length === 0) {
    return res.status(400).json({ error: 'no valid tickers' })
  }

  const symbols = tickerList.join(',')
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,currency,shortName`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8_000)  // 8s — Yahoo Finance sometimes hangs

  try {
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
      },
    })
    clearTimeout(timeoutId)

    if (!upstream.ok) {
      return res.status(502).json({ error: `upstream ${upstream.status}` })
    }

    const data = await upstream.json()
    const results = data?.quoteResponse?.result || []

    const priceMap = {}
    const fetchedAt = new Date().toISOString()

    for (const r of results) {
      priceMap[r.symbol] = {
        price:     r.regularMarketPrice ?? null,
        currency:  r.currency ?? null,
        name:      r.shortName ?? r.longName ?? null,
        fetchedAt,
      }
    }

    // Null-fill any tickers that didn't appear in the response
    for (const t of tickerList) {
      if (!(t in priceMap)) priceMap[t] = null
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json(priceMap)
  } catch {
    clearTimeout(timeoutId)
    return res.status(502).json({ error: 'fetch failed or timed out' })
  }
}
