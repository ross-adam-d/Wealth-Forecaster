/**
 * Property Module
 * Handles P&I / IO mortgages, offset accounts, negative gearing, and CGT on sale.
 */

import { CGT_DISCOUNT } from '../constants/index.js'

/**
 * Calculate annual mortgage repayment.
 *
 * @param {number} principal
 * @param {number} annualRate
 * @param {number} termYears
 * @param {string} loanType - 'pi' | 'io'
 * @returns {number} annual repayment
 */
export function calcAnnualRepayment(principal, annualRate, termYears, loanType = 'pi') {
  if (principal <= 0 || annualRate <= 0 || termYears <= 0) return 0

  if (loanType === 'io') {
    return principal * annualRate
  }

  // P&I: standard annuity formula
  const r = annualRate / 12
  const n = termYears * 12
  const monthlyRepayment = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
  return monthlyRepayment * 12
}

/**
 * Calculate annual interest on a loan (net of offset).
 *
 * @param {number} loanBalance
 * @param {number} offsetBalance
 * @param {number} annualRate
 * @returns {number}
 */
export function calcAnnualInterest(loanBalance, offsetBalance, annualRate) {
  const effectiveBalance = Math.max(0, loanBalance - offsetBalance)
  return effectiveBalance * annualRate
}

/**
 * Process a property for a single simulation year.
 *
 * @param {object} property - property profile from data model
 * @param {number} year     - simulation year
 * @returns {object}
 */
export function processPropertyYear(property, year) {
  const {
    isPrimaryResidence,
    currentValue,
    mortgageBalance,
    interestRate,
    loanTermYearsRemaining,
    loanType,
    ioEndYear,
    offsetBalance,
    offsetAnnualTopUp = 0,
    annualRentalIncome = 0,
    annualPropertyExpenses = 0,
    growthRate,
    saleEvent,
  } = property

  // Property already sold in a prior year — nothing left to calculate
  if (saleEvent && saleEvent.year < year) {
    return {
      openingValue: 0, closingValue: 0, mortgageBalance: 0, offsetBalance: 0,
      annualInterest: 0, annualRepayment: 0, principalRepayment: 0,
      netRentalIncomeLoss: 0, ioStepUpThisYear: false,
      saleProceeds: null, capitalGain: null, cgtAmount: null, equity: 0,
      loanTermYearsRemaining: 0,
    }
  }

  // Determine effective loan type this year
  const effectiveLoanType = (loanType === 'io' && ioEndYear && year > ioEndYear) ? 'pi' : loanType
  const ioStepUpThisYear = loanType === 'io' && ioEndYear && year === ioEndYear + 1

  const annualInterest = calcAnnualInterest(mortgageBalance, offsetBalance, interestRate)
  const annualRepayment = calcAnnualRepayment(mortgageBalance, interestRate, loanTermYearsRemaining, effectiveLoanType)
  const principalRepayment = Math.max(0, annualRepayment - annualInterest)

  // Net rental position (negative = negatively geared)
  const netRentalIncomeLoss = isPrimaryResidence
    ? 0
    : annualRentalIncome - annualPropertyExpenses - annualInterest

  // Update balances
  const newMortgageBalance = Math.max(0, mortgageBalance - principalRepayment)
  const newOffsetBalance = offsetBalance + offsetAnnualTopUp
  const newPropertyValue = currentValue * (1 + growthRate)

  // Sale event
  let saleProceeds = null
  let capitalGain = null
  let cgtAmount = null

  if (saleEvent && saleEvent.year === year) {
    const salePrice = saleEvent.netProceeds || newPropertyValue
    capitalGain = salePrice - property.purchasePrice

    if (!isPrimaryResidence && capitalGain > 0) {
      const purchaseYear = property.purchaseDate ? new Date(property.purchaseDate).getFullYear() : year - 1
      const heldYears = year - purchaseYear
      const discountedGain = heldYears > 1 ? capitalGain * CGT_DISCOUNT : capitalGain
      cgtAmount = discountedGain  // added to assessable income in tax engine
    }

    saleProceeds = salePrice - newMortgageBalance
  }

  return {
    openingValue: currentValue,
    closingValue: saleEvent?.year === year ? 0 : newPropertyValue,
    mortgageBalance: saleEvent?.year === year ? 0 : newMortgageBalance,
    offsetBalance: saleEvent?.year === year ? 0 : newOffsetBalance,
    loanTermYearsRemaining: saleEvent?.year === year ? 0 : Math.max(0, loanTermYearsRemaining - 1),
    annualInterest,
    annualRepayment,
    principalRepayment,
    netRentalIncomeLoss,
    ioStepUpThisYear,
    saleProceeds,
    capitalGain,
    cgtAmount,
    equity: newPropertyValue - newMortgageBalance,
  }
}
