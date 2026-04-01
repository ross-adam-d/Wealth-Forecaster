/**
 * Treasury/Corporate Bonds Module
 * Capital growth + coupon income (taxed as ordinary income, no franking).
 * CGT discount on partial sales.
 */

import { CGT_DISCOUNT } from '../constants/index.js'
import { resolveRatePeriodRate } from '../engine/ratePeriodEngine.js'

/**
 * Process treasury/corporate bonds for a single simulation year.
 *
 * @param {object} bonds        - treasury bonds profile from data model
 * @param {number} year
 * @param {number} personAge    - used for preserve capital gating
 * @param {number} drawdownNeeded  - amount needed from portfolio (deficit fill)
 * @param {number} resolvedContribution - actual contribution (resolved by engine)
 * @param {object} assumptions
 * @returns {object}
 */
export function processTreasuryBondsYear({
  bonds,
  year,
  personAge,
  drawdownNeeded = 0,
  resolvedContribution,
  assumptions,
}) {
  const {
    currentValue,
    annualContribution,
    couponRate,
    preserveCapital,
    preserveCapitalFromAge,
    ratePeriods,
  } = bonds

  const rate = resolveRatePeriodRate(ratePeriods, year, assumptions.treasuryBondsReturnRate)

  // Capital growth
  const capitalGrowth = currentValue * rate
  const valuePreCoupon = currentValue + capitalGrowth

  // Coupon income — taxed as ordinary income (no franking credits)
  const effectiveCouponRate = couponRate ?? assumptions.treasuryBondsCouponRate ?? 0.03
  const couponIncome = currentValue * effectiveCouponRate

  // Preserve capital mode
  const isPreservingCapital = preserveCapital &&
    (preserveCapitalFromAge == null || personAge >= preserveCapitalFromAge)

  const effectiveContribution = resolvedContribution != null ? resolvedContribution : annualContribution
  let valueAfterInflows = valuePreCoupon + effectiveContribution

  // Drawdown
  let actualDrawdown = 0
  let cgtOnDrawdown = 0

  if (!isPreservingCapital && drawdownNeeded > 0) {
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
    couponIncome,
    effectiveContribution,
    actualDrawdown,
    cgtOnDrawdown,
    isPreservingCapital,
    incomeOnly: isPreservingCapital ? couponIncome : null,
    rate,
  }
}
