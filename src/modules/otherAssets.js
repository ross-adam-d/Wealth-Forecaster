/**
 * Other Assets Module
 * Handles generic assets (private equity, collectibles, business interests, etc.)
 * Simple growth model — no tax-specific treatment.
 */

/**
 * Process an other asset for a single simulation year.
 *
 * @param {object} asset - from data model
 * @param {number} year
 * @param {number} drawdownNeeded - deficit fill amount
 * @param {number} resolvedContribution - actual contribution (resolved by engine based on mode)
 * @returns {object}
 */
export function processOtherAssetYear({ asset, year, drawdownNeeded = 0, resolvedContribution }) {
  const { currentValue, annualContribution = 0, returnRate = 0.07 } = asset

  const effectiveContribution = resolvedContribution != null ? resolvedContribution : annualContribution
  const growth = currentValue * returnRate
  const valueAfterGrowth = currentValue + growth + effectiveContribution

  let withdrawal = 0
  if (asset.canDrawdown && drawdownNeeded > 0) {
    withdrawal = Math.min(drawdownNeeded, valueAfterGrowth)
  }

  const closingValue = Math.max(0, valueAfterGrowth - withdrawal)

  return {
    openingValue: currentValue,
    closingValue,
    growth,
    effectiveContribution,
    withdrawal,
    returnRate,
  }
}
