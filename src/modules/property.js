/**
 * Property Module
 * Handles P&I / IO mortgages, offset accounts, negative gearing, and CGT on sale.
 */

import {
  CGT_DISCOUNT,
  STAMP_DUTY,
  FIRST_HOME_BUYER_EXEMPTION,
  LAND_TAX,
  DEFAULT_SELLING_COSTS_PCT,
} from '../constants/index.js'
import { extractYear, parseYearMonth } from '../utils/format.js'

/**
 * Calculate amount from progressive brackets (used for stamp duty and land tax).
 */
function calcFromBrackets(brackets, value) {
  if (!brackets || brackets.length === 0) return 0
  let tax = 0
  for (const b of brackets) {
    if (value <= b.lower) break
    const taxable = Math.min(value, b.upper) - b.lower
    tax = b.base + taxable * b.rate
    if (value <= b.upper) break
  }
  return tax
}

/**
 * Calculate stamp duty for a property purchase.
 * @param {number} purchasePrice
 * @param {string} state - 'NSW', 'VIC', etc.
 * @param {boolean} isFirstHomeBuyer
 * @param {boolean} isPrimaryResidence
 * @returns {number}
 */
export function calcStampDuty(purchasePrice, state, isFirstHomeBuyer = false, isPrimaryResidence = false) {
  if (!purchasePrice || purchasePrice <= 0 || !state) return 0
  const brackets = STAMP_DUTY[state]
  if (!brackets) return 0

  const fullDuty = calcFromBrackets(brackets, purchasePrice)

  if (!isFirstHomeBuyer || !isPrimaryResidence) return Math.round(fullDuty)

  const fhb = FIRST_HOME_BUYER_EXEMPTION[state]
  if (!fhb) return Math.round(fullDuty)

  if (fhb.exemptUpTo > 0 && purchasePrice <= fhb.exemptUpTo) return 0
  if (fhb.concessionUpTo > 0 && purchasePrice <= fhb.concessionUpTo) {
    // Linear phase-out between exempt and concession thresholds
    const range = fhb.concessionUpTo - fhb.exemptUpTo
    const excess = purchasePrice - fhb.exemptUpTo
    return Math.round(fullDuty * (excess / range))
  }

  return Math.round(fullDuty)
}

/**
 * Calculate annual land tax for an investment property.
 * @param {number} landValue - current property value (approximation: using full property value)
 * @param {string} state
 * @returns {number}
 */
export function calcLandTax(landValue, state) {
  if (!landValue || landValue <= 0 || !state) return 0
  const brackets = LAND_TAX[state]
  if (!brackets || brackets.length === 0) return 0
  return Math.round(calcFromBrackets(brackets, landValue))
}

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
  if (!principal || principal <= 0 || !annualRate || annualRate <= 0 || !termYears || termYears <= 0) return 0

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
 * @param {number} cashForOffset - cash buffer available to offset this mortgage (0 if no offset)
 * @returns {object}
 */
export function processPropertyYear(property, year, cashForOffset = 0) {
  const {
    isPrimaryResidence,
    currentValue,
    mortgageBalance,
    originalLoanAmount,
    originalLoanTermYears,
    interestRate,
    loanTermYearsRemaining: _loanTerm,
    loanType,
    ioEndYear,
    annualRentalIncome = 0,
    annualPropertyExpenses = 0,
    growthRate,
    saleEvent,
  } = property

  // Offset is now derived from cash buffer, capped at mortgage balance
  const offsetBalance = Math.min(cashForOffset, mortgageBalance || 0)

  const loanTermYearsRemaining = _loanTerm || 0

  // Future purchase — property not yet acquired
  // futurePurchaseYear takes precedence; fall back to year extracted from purchaseDate
  const futurePurchaseYear = extractYear(property.futurePurchaseYear) || extractYear(property.purchaseDate) || null
  if (futurePurchaseYear && year < futurePurchaseYear) {
    return {
      openingValue: 0, closingValue: 0, mortgageBalance: 0, offsetBalance: 0,
      annualInterest: 0, annualRepayment: 0, principalRepayment: 0,
      netRentalIncomeLoss: 0, landTax: 0, sellingCosts: 0, ioStepUpThisYear: false,
      saleProceeds: null, capitalGain: null, cgtAmount: null, equity: 0,
      loanTermYearsRemaining: 0,
      isPurchaseYear: false, stampDuty: 0, purchaseCashOutflow: 0,
    }
  }

  // Purchase year — stamp duty and deposit come out as cash outflows
  const isPurchaseYear = futurePurchaseYear === year
  let stampDuty = 0
  let purchaseCashOutflow = 0
  if (isPurchaseYear) {
    stampDuty = calcStampDuty(
      property.purchasePrice || currentValue,
      property.state,
      !!property.isFirstHomeBuyer,
      !!isPrimaryResidence
    )
    // For cash purchases, the full price is a cash outflow
    // For mortgaged purchases, the deposit (purchase price - mortgage) is the outflow
    if (property.purchasedCash) {
      purchaseCashOutflow = (property.purchasePrice || currentValue) + stampDuty
    } else {
      const deposit = Math.max(0, (property.purchasePrice || currentValue) - (mortgageBalance || 0))
      purchaseCashOutflow = deposit + stampDuty
    }
  }

  // Resolve sale event year and month (supports "YYYY-MM" strings and plain year numbers)
  const saleYear = saleEvent ? extractYear(saleEvent.year) : null
  const saleParsed = saleEvent ? parseYearMonth(saleEvent.year) : null
  // Fraction of year property is held (e.g. sale in June = 6/12)
  const saleYearFraction = (saleYear === year && saleParsed?.month) ? saleParsed.month / 12 : 1

  // Property already sold in a prior year — nothing left to calculate
  if (saleYear && saleYear < year) {
    return {
      openingValue: 0, closingValue: 0, mortgageBalance: 0, offsetBalance: 0,
      annualInterest: 0, annualRepayment: 0, principalRepayment: 0,
      netRentalIncomeLoss: 0, landTax: 0, sellingCosts: 0, ioStepUpThisYear: false,
      saleProceeds: null, capitalGain: null, cgtAmount: null, equity: 0,
      loanTermYearsRemaining: 0,
      isPurchaseYear: false, stampDuty: 0, purchaseCashOutflow: 0,
    }
  }

  // Determine effective loan type this year
  const effectiveLoanType = (loanType === 'io' && ioEndYear && year > ioEndYear) ? 'pi' : loanType
  const ioStepUpThisYear = loanType === 'io' && ioEndYear && year === ioEndYear + 1

  // Pro-rate factor: in the sale year with month precision, only charge for months held
  // e.g. sale in June → holdFraction = 6/12 = 0.5
  const holdFraction = (saleYear === year) ? saleYearFraction : 1

  // Interest is calculated on the effective balance (net of offset), pro-rated in sale year
  const annualInterest = calcAnnualInterest(mortgageBalance, offsetBalance, interestRate) * holdFraction

  // Fixed repayment: use original loan amount & term so the repayment stays constant.
  // This means offset accounts reduce interest → more goes to principal → loan pays off early.
  // For IO loans or if no original values stored, fall back to current balance calculation.
  // After IO→PI conversion, recalculate from remaining balance and remaining term.
  let annualRepayment
  if (effectiveLoanType === 'io') {
    // IO repayment = interest on offset-adjusted balance (no principal reduction)
    annualRepayment = calcAnnualInterest(mortgageBalance, offsetBalance, interestRate)
  } else if (ioStepUpThisYear || !originalLoanAmount || !originalLoanTermYears) {
    // IO just converted to PI, or legacy data without originals — recalc from current state
    annualRepayment = calcAnnualRepayment(mortgageBalance, interestRate, loanTermYearsRemaining, 'pi')
  } else {
    // Standard PI: fixed repayment from original loan terms
    annualRepayment = calcAnnualRepayment(originalLoanAmount, interestRate, originalLoanTermYears, 'pi')
  }

  // Pro-rate repayment in sale year
  annualRepayment *= holdFraction

  // If mortgage is nearly paid off, cap repayment at remaining balance + interest
  if (mortgageBalance > 0 && annualRepayment > mortgageBalance + annualInterest) {
    annualRepayment = mortgageBalance + annualInterest
  }

  // If mortgage is fully paid, no repayment
  if (mortgageBalance <= 0) {
    annualRepayment = 0
  }

  const principalRepayment = Math.max(0, annualRepayment - annualInterest)

  // Land tax — investment properties only (PPOR exempt), pro-rated in sale year
  const state = property.state || null
  const landTax = (!isPrimaryResidence && state) ? calcLandTax(currentValue, state) * holdFraction : 0

  // Net rental position (negative = negatively geared), pro-rated in sale year
  const netRentalIncomeLoss = isPrimaryResidence
    ? 0
    : (annualRentalIncome * holdFraction) - (annualPropertyExpenses * holdFraction) - annualInterest - landTax

  // Update balances
  const newMortgageBalance = Math.max(0, mortgageBalance - principalRepayment)
  const newPropertyValue = currentValue * (1 + growthRate)

  // Sale event
  let saleProceeds = null
  let capitalGain = null
  let cgtAmount = null
  let sellingCosts = 0

  if (saleYear && saleYear === year) {
    const salePrice = saleEvent.netProceeds || currentValue
    const costsPct = saleEvent.sellingCostsPct ?? DEFAULT_SELLING_COSTS_PCT
    sellingCosts = Math.round(salePrice * costsPct)
    const netSalePrice = salePrice - sellingCosts

    // CGT: selling costs reduce the capital gain
    capitalGain = netSalePrice - property.purchasePrice

    if (!isPrimaryResidence && capitalGain > 0) {
      const purchaseYear = extractYear(property.purchaseDate) || (year - 1)
      const heldYears = year - purchaseYear
      const discountedGain = heldYears > 1 ? capitalGain * CGT_DISCOUNT : capitalGain
      cgtAmount = discountedGain  // added to assessable income in tax engine
    }

    saleProceeds = netSalePrice - mortgageBalance
  }

  return {
    openingValue: currentValue,
    closingValue: saleYear === year ? 0 : newPropertyValue,
    mortgageBalance: saleYear === year ? 0 : newMortgageBalance,
    offsetBalance,  // reflects the effective offset used this year (derived from cash)
    loanTermYearsRemaining: saleYear === year ? 0 : Math.max(0, loanTermYearsRemaining - 1),
    annualInterest,
    annualRepayment,
    principalRepayment,
    netRentalIncomeLoss,
    landTax,
    sellingCosts,
    ioStepUpThisYear,
    saleProceeds,
    capitalGain,
    cgtAmount,
    equity: newPropertyValue - newMortgageBalance,
    isPurchaseYear,
    stampDuty,
    purchaseCashOutflow,
  }
}
