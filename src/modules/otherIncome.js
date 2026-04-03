/**
 * Other Income Sources Module
 *
 * Handles non-salary income: consulting, part-time work, gifts, pensions,
 * rental from non-modelled properties, trust distributions, etc.
 *
 * Each source supports:
 *  - Annual, monthly, or one-off amounts
 *  - Active window (activeFrom / activeTo) — year numbers or "YYYY-MM" strings
 *  - Annual adjustment: none, percent (+/-), or dollar (+/-)
 *  - Tax attribution to Person A, B, or household (split 50/50)
 */

import { extractYear, yearFraction } from '../utils/format.js'

/**
 * Resolve a single other-income source's annual amount for a given year.
 *
 * One-off amounts are treated as "today's dollars" (real) — they are inflated
 * to nominal so that when displayed in real terms they show the entered value.
 *
 * @param {object} source - other income source from data model
 * @param {number} year   - simulation year
 * @param {number} startYear - first simulation year (for compounding adjustments)
 * @param {number} [inflationRate=0] - annual inflation rate for real→nominal conversion
 * @returns {number} resolved annual amount (0 if outside active window)
 */
export function resolveOtherIncomeAmount(source, year, startYear, inflationRate = 0) {
  const { amount, amountType, activeFrom, activeTo, adjustmentType, adjustmentRate } = source
  if (amount == null || amount === 0) return 0

  // Active window check — supports "YYYY-MM" strings and plain year numbers
  const fromYear = extractYear(activeFrom) ?? startYear
  const toYear = extractYear(activeTo) ?? Infinity

  if (year < fromYear || year > toYear) return 0

  // One-off: only in the specific year — inflate to nominal (user enters real dollars)
  if (amountType === 'one_off') {
    if (year !== fromYear) return 0
    const yearsFromNow = year - startYear
    return amount * Math.pow(1 + inflationRate, yearsFromNow)
  }

  // Base annual amount
  const baseAmount = amountType === 'monthly' ? amount * 12 : amount

  // Apply adjustments over elapsed years
  const yearsElapsed = year - fromYear
  let resolvedAmount = baseAmount
  if (yearsElapsed > 0) {
    if (adjustmentType === 'percent') {
      resolvedAmount = baseAmount * Math.pow(1 + (adjustmentRate || 0), yearsElapsed)
    } else if (adjustmentType === 'dollar') {
      resolvedAmount = Math.max(0, baseAmount + (adjustmentRate || 0) * yearsElapsed)
    }
  }

  // Pro-rate for month precision in start/end years
  const frac = yearFraction(year, activeFrom, activeTo)
  if (frac < 1) resolvedAmount *= frac

  return resolvedAmount
}

/**
 * Process all other income sources for a given year.
 *
 * @param {Array} sources   - scenario.otherIncome array
 * @param {number} year     - simulation year
 * @param {number} startYear
 * @param {number} [inflationRate=0] - for real→nominal inflation on one-off amounts
 * @returns {{ total, taxableA, taxableB, nonTaxable, breakdown }}
 */
export function processOtherIncome(sources, year, startYear, inflationRate = 0) {
  let total = 0
  let taxableA = 0
  let taxableB = 0
  let nonTaxable = 0
  const breakdown = []

  for (const source of sources) {
    const amount = resolveOtherIncomeAmount(source, year, startYear, inflationRate)
    if (amount <= 0) continue

    total += amount

    if (!source.isTaxable) {
      nonTaxable += amount
    } else if (source.person === 'B') {
      taxableB += amount
    } else if (source.person === 'household') {
      taxableA += amount / 2
      taxableB += amount / 2
    } else {
      taxableA += amount
    }

    breakdown.push({ id: source.id, name: source.name, amount })
  }

  return { total, taxableA, taxableB, nonTaxable, breakdown }
}
