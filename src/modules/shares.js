/**
 * Share Portfolio Module
 * Growth, dividends, franking credits, preserve capital, CGT on partial sales.
 */

import { CGT_DISCOUNT, CORPORATE_TAX_RATE } from '../constants/index.js'
import { resolveRatePeriodRate } from '../engine/ratePeriodEngine.js'
import { calcFrankingCredit } from '../engine/taxEngine.js'

/**
 * Process share portfolio for a single simulation year.
 *
 * @param {object} shares       - shares profile from data model
 * @param {number} year
 * @param {number} personAge    - used for preserve capital gating
 * @param {number} drawdownNeeded  - amount needed from portfolio (deficit fill)
 * @param {number} resolvedContribution - actual contribution (resolved by engine based on mode)
 * @param {object} assumptions
 * @returns {object}
 */
export function processSharesYear({
  shares,
  year,
  personAge,
  drawdownNeeded = 0,
  resolvedContribution,
  assumptions,
}) {
  const {
    currentValue,
    annualContribution,
    dividendYield,
    frankingPct,
    preserveCapital,
    preserveCapitalFromAge,
    ratePeriods,
  } = shares

  const rate = resolveRatePeriodRate(ratePeriods, year, assumptions.sharesReturnRate)

  // Capital growth (before dividends)
  const capitalGrowth = currentValue * rate
  const valuePreDividend = currentValue + capitalGrowth

  // Dividends
  const cashDividend = currentValue * dividendYield
  const { grossUp: frankingGrossUp, credit: frankingCredit } = calcFrankingCredit(cashDividend, frankingPct)

  // Preserve capital mode
  const isPreservingCapital = preserveCapital &&
    (preserveCapitalFromAge == null || personAge >= preserveCapitalFromAge)

  // Use resolved contribution if provided (engine-managed), otherwise fall back to config
  const effectiveContribution = resolvedContribution != null ? resolvedContribution : annualContribution
  let valueAfterInflows = valuePreDividend + effectiveContribution

  // Drawdown
  let actualDrawdown = 0
  let cgtOnDrawdown = 0

  if (!isPreservingCapital && drawdownNeeded > 0) {
    actualDrawdown = Math.min(drawdownNeeded, valueAfterInflows)
    // Approximate CGT: assume average cost basis = 50% of current value (conservative)
    const estimatedGain = actualDrawdown * 0.5
    cgtOnDrawdown = estimatedGain * CGT_DISCOUNT  // post-50%-discount gain, added to assessable income
    valueAfterInflows -= actualDrawdown
  }

  const closingValue = Math.max(0, valueAfterInflows)

  return {
    openingValue: currentValue,
    closingValue,
    capitalGrowth,
    cashDividend,
    frankingGrossUp,
    frankingCredit,
    effectiveContribution,
    actualDrawdown,
    cgtOnDrawdown,
    isPreservingCapital,
    incomeOnly: isPreservingCapital ? cashDividend : null,
    rate,
  }
}
