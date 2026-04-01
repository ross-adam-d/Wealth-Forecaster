/**
 * Holdings aggregation utilities.
 * Pure functions for computing weighted averages, distributing amounts
 * proportionally across holdings, and projecting holding values forward.
 */

/**
 * Compute weighted-average category-level values from individual holdings.
 * Returns null if no holdings exist (caller should use category-level values as-is).
 *
 * @param {Array} holdings - array of holding objects with currentValue + rate fields
 * @param {string} rateField - which rate field to use for returnRate (e.g. 'returnRate' or 'pensionReturnRate')
 * @returns {object|null} { currentValue, returnRate, dividendYield, frankingPct, couponRate }
 */
export function aggregateHoldings(holdings, rateField = 'returnRate') {
  if (!holdings || holdings.length === 0) return null

  const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0)
  if (totalValue === 0) {
    return { currentValue: 0, returnRate: 0, dividendYield: 0, frankingPct: 0, couponRate: 0 }
  }

  const weighted = (field) =>
    holdings.reduce((s, h) => s + (h[field] || 0) * (h.currentValue || 0), 0) / totalValue

  return {
    currentValue: totalValue,
    returnRate: weighted(rateField),
    dividendYield: weighted('dividendYield'),
    frankingPct: weighted('frankingPct'),
    couponRate: weighted('couponRate'),
  }
}

/**
 * Distribute an amount proportionally across holdings by current value weight.
 * If total value is 0, distributes equally.
 *
 * @param {Array} holdings - array of holding objects with currentValue
 * @param {number} amount - total amount to distribute
 * @returns {number[]} per-holding amounts
 */
export function distributeProportionally(holdings, amount) {
  if (!holdings || holdings.length === 0) return []
  const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0)
  if (totalValue === 0) {
    const equal = amount / holdings.length
    return holdings.map(() => equal)
  }
  return holdings.map(h => ((h.currentValue || 0) / totalValue) * amount)
}

/**
 * Project individual holding values at a future point, normalised to match
 * a known category total. Each holding grows at its own rate, then the
 * values are scaled so they sum to categoryClosingValue.
 *
 * @param {Array} holdings - array of holding objects with currentValue and returnRate
 * @param {number} categoryClosingValue - the engine's computed total for this category
 * @param {number} years - number of years to project forward
 * @param {string} rateField - which rate field to use (default 'returnRate')
 * @returns {Array} holdings with projected `projectedValue` field added
 */
export function projectHoldings(holdings, categoryClosingValue, years, rateField = 'returnRate') {
  if (!holdings || holdings.length === 0) return []

  const rawProjected = holdings.map(h => {
    const rate = h[rateField] || 0
    return (h.currentValue || 0) * Math.pow(1 + rate, years)
  })

  const rawTotal = rawProjected.reduce((sum, v) => sum + v, 0)

  if (rawTotal === 0) {
    const equal = categoryClosingValue / holdings.length
    return holdings.map((h, i) => ({ ...h, projectedValue: equal }))
  }

  return holdings.map((h, i) => ({
    ...h,
    projectedValue: (rawProjected[i] / rawTotal) * categoryClosingValue,
  }))
}
