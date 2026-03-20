/**
 * Investment Bonds Module
 *
 * Distinct tax treatment:
 * - 30% internal tax on earnings within bond
 * - 10-year rule: tax-free withdrawals after 10 years
 * - 125% rule: annual contribution capped at 125% of prior year
 * - Pre-10yr withdrawal: earnings included in assessable income with 30% offset
 */

import {
  INVESTMENT_BOND_INTERNAL_TAX,
  INVESTMENT_BOND_YEARS_FOR_TAX_FREE,
  INVESTMENT_BOND_125_PCT_RULE,
} from '../constants/index.js'
import { resolveRatePeriodRate } from '../engine/ratePeriodEngine.js'

/**
 * Process an investment bond for a single simulation year.
 *
 * @param {object} bond
 * @param {number} year
 * @param {number} drawdownNeeded
 * @param {object} assumptions
 * @returns {object}
 */
export function processBondYear({ bond, year, drawdownNeeded = 0, assumptions }) {
  const {
    currentBalance,
    annualContribution,
    inceptionDate,
    ratePeriods,
    priorYearContribution = 0,
  } = bond

  // Validate 125% rule
  const maxContribution = priorYearContribution > 0
    ? priorYearContribution * INVESTMENT_BOND_125_PCT_RULE
    : Infinity  // first year — no cap
  const contribution125RuleBreach = annualContribution > maxContribution && priorYearContribution > 0
  const effectiveContribution = contribution125RuleBreach
    ? maxContribution
    : annualContribution
  const excessContribution = contribution125RuleBreach
    ? annualContribution - maxContribution
    : 0

  // Years elapsed since inception
  const inceptionYear = inceptionDate
    ? new Date(inceptionDate).getFullYear()
    : year
  const yearsElapsed = year - inceptionYear
  const isTaxFree = yearsElapsed >= INVESTMENT_BOND_YEARS_FOR_TAX_FREE

  // Growth — internal 30% tax on earnings
  const rate = resolveRatePeriodRate(ratePeriods, year, assumptions?.investmentBondRate ?? 0.07)
  const grossEarnings = (currentBalance + effectiveContribution) * rate
  const internalTax = grossEarnings * INVESTMENT_BOND_INTERNAL_TAX
  const netEarnings = grossEarnings - internalTax

  const valueBeforeDrawdown = currentBalance + effectiveContribution + netEarnings

  // Drawdown
  let withdrawal = 0
  let assessableIncome = 0
  let taxOffset = 0
  let clockReset = false

  if (drawdownNeeded > 0) {
    withdrawal = Math.min(drawdownNeeded, valueBeforeDrawdown)

    if (!isTaxFree) {
      // Pre-10yr: earnings component included in assessable income with 30% offset
      const earningsFraction = valueBeforeDrawdown > 0 ? netEarnings / valueBeforeDrawdown : 0
      const earningsWithdrawn = withdrawal * earningsFraction
      assessableIncome = earningsWithdrawn
      taxOffset = earningsWithdrawn * INVESTMENT_BOND_INTERNAL_TAX
      clockReset = true  // 10-year clock resets on ANY withdrawal
    }
  }

  const closingBalance = Math.max(0, valueBeforeDrawdown - withdrawal)

  const warnings = []
  if (contribution125RuleBreach) {
    warnings.push(`125% rule breach: excess $${Math.round(excessContribution).toLocaleString()} treated as new bond with its own 10-year clock.`)
  }
  if (!isTaxFree && withdrawal > 0) {
    warnings.push(`Pre-10yr withdrawal: earnings ($${Math.round(assessableIncome).toLocaleString()}) added to assessable income. 10-year clock RESET.`)
  }
  if (yearsElapsed === INVESTMENT_BOND_YEARS_FOR_TAX_FREE) {
    // Threshold crossed this year
    warnings.push('Bond has reached 10-year threshold — future withdrawals are tax-free.')
  }

  return {
    openingBalance: currentBalance,
    closingBalance,
    effectiveContribution,
    excessContribution,
    grossEarnings,
    internalTax,
    netEarnings,
    withdrawal,
    assessableIncome,
    taxOffset,
    isTaxFree,
    yearsElapsed,
    clockReset,
    rate,
    warnings,
    liquidityTag: isTaxFree ? 'tax_free' : 'accessible_pre10yr_tax_penalty',
  }
}
