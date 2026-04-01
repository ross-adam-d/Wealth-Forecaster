/**
 * Commodities Module
 * Pure capital growth — no income component (no dividends, no coupons).
 * CGT discount on partial sales.
 */

import { CGT_DISCOUNT } from '../constants/index.js'
import { resolveRatePeriodRate } from '../engine/ratePeriodEngine.js'

/**
 * Process commodities portfolio for a single simulation year.
 *
 * @param {object} commodities  - commodities profile from data model
 * @param {number} year
 * @param {number} drawdownNeeded  - amount needed from portfolio (deficit fill)
 * @param {number} resolvedContribution - actual contribution (resolved by engine)
 * @param {object} assumptions
 * @returns {object}
 */
export function processCommoditiesYear({
  commodities,
  year,
  drawdownNeeded = 0,
  resolvedContribution,
  assumptions,
}) {
  const {
    currentValue,
    annualContribution,
    ratePeriods,
  } = commodities

  const rate = resolveRatePeriodRate(ratePeriods, year, assumptions.commoditiesReturnRate)

  // Capital growth only — no income
  const capitalGrowth = currentValue * rate
  const valueAfterGrowth = currentValue + capitalGrowth

  const effectiveContribution = resolvedContribution != null ? resolvedContribution : annualContribution
  let valueAfterInflows = valueAfterGrowth + effectiveContribution

  // Drawdown
  let actualDrawdown = 0
  let cgtOnDrawdown = 0

  if (drawdownNeeded > 0) {
    actualDrawdown = Math.min(drawdownNeeded, valueAfterInflows)
    const estimatedGain = actualDrawdown * 0.5
    cgtOnDrawdown = estimatedGain * CGT_DISCOUNT
    valueAfterInflows -= actualDrawdown
  }

  const closingValue = Math.max(0, valueAfterInflows)

  return {
    openingValue: currentValue,
    closingValue,
    capitalGrowth,
    effectiveContribution,
    actualDrawdown,
    cgtOnDrawdown,
    rate,
  }
}
