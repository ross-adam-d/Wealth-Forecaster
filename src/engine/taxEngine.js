/**
 * Tax Engine
 * Calculates Australian income tax, Medicare levy, and all packaging offsets.
 * Called per person per year by the simulation engine.
 */

import {
  TAX_BRACKETS,
  MEDICARE_LEVY_RATE,
  MEDICARE_LEVY_LOWER_THRESHOLD,
  CORPORATE_TAX_RATE,
  PBI_GENERAL_CAP,
  PBI_MEAL_ENTERTAINMENT_CAP,
  QLD_HEALTH_GENERAL_CAP,
  QLD_HEALTH_MEAL_ENTERTAINMENT_CAP,
  HECS_REPAYMENT_BANDS,
} from '../constants/index.js'

/**
 * Calculate gross income tax (before offsets) on taxable income.
 * @param {number} taxableIncome
 * @returns {number} gross tax
 */
export function calcIncomeTax(taxableIncome) {
  if (taxableIncome <= 0) return 0
  for (const bracket of TAX_BRACKETS) {
    if (taxableIncome <= bracket.upper) {
      return bracket.base + (taxableIncome - bracket.lower) * bracket.rate
    }
  }
  return 0
}

/**
 * Calculate Medicare levy (2% above shade-in threshold).
 * @param {number} taxableIncome
 * @returns {number} Medicare levy
 */
export function calcMedicareLevy(taxableIncome) {
  if (taxableIncome <= MEDICARE_LEVY_LOWER_THRESHOLD) return 0
  return taxableIncome * MEDICARE_LEVY_RATE
}

/**
 * Calculate the franking credit gross-up to add to assessable income.
 * @param {number} dividendAmount - cash dividend
 * @param {number} frankingPct - fraction franked e.g. 0.70
 * @returns {{ grossUp: number, credit: number }}
 */
export function calcFrankingCredit(dividendAmount, frankingPct) {
  const credit = dividendAmount * frankingPct * (CORPORATE_TAX_RATE / (1 - CORPORATE_TAX_RATE))
  const grossUp = credit
  return { grossUp, credit }
}

/**
 * Resolve salary packaging reductions for a person in a given year.
 * Returns the total pre-tax packaging reduction (reduces assessable income).
 *
 * @param {object} person - person profile from household
 * @param {number} grossSalary
 * @returns {{ packagingReduction: number, packagingSummary: object }}
 */
export function resolvePackagingReductions(person, grossSalary) {
  const { employerType, packaging } = person
  let packagingReduction = 0
  const summary = {}

  // Salary sacrifice to super is handled separately in the super module — excluded here.

  // PBI / NFP packaging
  if (employerType === 'pbi_nfp') {
    const general = Math.min(packaging.pbiGeneral || 0, PBI_GENERAL_CAP)
    const meal = Math.min(packaging.pbiMealEntertainment || 0, PBI_MEAL_ENTERTAINMENT_CAP)
    packagingReduction += general + meal
    summary.pbiGeneral = general
    summary.pbiMealEntertainment = meal
  }

  // QLD Health packaging
  if (employerType === 'qld_health') {
    const general = Math.min(packaging.qldHealthGeneral || 0, QLD_HEALTH_GENERAL_CAP)
    const meal = Math.min(packaging.qldHealthMealEntertainment || 0, QLD_HEALTH_MEAL_ENTERTAINMENT_CAP)
    packagingReduction += general + meal
    summary.qldHealthGeneral = general
    summary.qldHealthMealEntertainment = meal
  }

  // Cap packaging at gross salary
  packagingReduction = Math.min(packagingReduction, grossSalary)

  return { packagingReduction, packagingSummary: summary }
}

/**
 * Full per-person tax calculation for a year.
 *
 * @param {object} params
 * @param {number} params.grossSalary
 * @param {number} params.salarySacrifice       - pre-tax super sacrifice (reduces assessable income)
 * @param {number} params.packagingReduction     - PBI/QLD Health reduction (reduces assessable income)
 * @param {number} params.novatedLeaseReduction  - pre-tax lease packaging (reduces assessable income)
 * @param {number} params.rentalIncomeLoss       - negative = gearing deduction; positive = rental income
 * @param {number} params.dividendIncome         - cash dividends
 * @param {number} params.frankingCredit         - franking credit gross-up
 * @param {number} params.capitalGain            - post-50%-discount CGT amount (sale year only)
 * @param {boolean} params.inPensionPhase        - franking credits refundable in pension phase
 * @param {number}  params.hecsBalance           - current HECS/HELP balance (post CPI-indexation)
 * @param {number}  params.hecsExtraAnnual       - optional extra voluntary repayment per year
 * @param {number}  params.hecsThresholdGrowthFactor - cumulative growth factor to scale repayment thresholds
 * @returns {object} detailed tax breakdown
 */
export function calcPersonTax({
  grossSalary = 0,
  salarySacrifice = 0,
  packagingReduction = 0,
  novatedLeaseReduction = 0,
  rentalIncomeLoss = 0,
  dividendIncome = 0,
  frankingCredit = 0,
  capitalGain = 0,
  otherIncome = 0,
  inPensionPhase = false,
  hecsBalance = 0,
  hecsExtraAnnual = 0,
  hecsThresholdGrowthFactor = 1,
} = {}) {
  // Step 1: assessable income
  const assessableIncome =
    grossSalary
    - salarySacrifice
    - packagingReduction
    - novatedLeaseReduction
    + rentalIncomeLoss      // negative for losses (negative gearing), positive for profit
    + dividendIncome
    + frankingCredit        // gross-up added before tax
    + capitalGain
    + otherIncome           // taxable other income attributed to this person

  const taxableIncome = Math.max(0, assessableIncome)

  // Step 2: gross income tax
  const grossTax = calcIncomeTax(taxableIncome)

  // Step 3: franking credit offset
  // Refundable in pension phase — if offset > tax liability, person receives refund
  let frankingOffset = frankingCredit  // credit = gross-up amount
  let frankingRefund = 0
  if (inPensionPhase && frankingOffset > grossTax) {
    frankingRefund = frankingOffset - grossTax
    frankingOffset = grossTax
  } else if (!inPensionPhase) {
    frankingOffset = Math.min(frankingOffset, grossTax)
  }

  const netTax = Math.max(0, grossTax - frankingOffset)

  // Step 4: Medicare levy
  const medicareLevy = calcMedicareLevy(taxableIncome)

  const totalTaxPayable = netTax + medicareLevy

  // Step 5: HECS/HELP repayment (withheld at source, reduces net take-home)
  const hecsCompulsory = calcHecsRepayment(taxableIncome, hecsBalance, hecsThresholdGrowthFactor)
  const hecsVoluntary = hecsBalance > 0 && hecsExtraAnnual > 0
    ? Math.min(hecsExtraAnnual, Math.max(0, hecsBalance - hecsCompulsory))
    : 0
  const hecsRepayment = hecsCompulsory + hecsVoluntary

  return {
    assessableIncome,
    taxableIncome,
    grossTax,
    frankingOffset,
    frankingRefund,
    netTax,
    medicareLevy,
    totalTaxPayable,
    hecsRepayment,
    netTakeHome: grossSalary + otherIncome - salarySacrifice - packagingReduction - novatedLeaseReduction - totalTaxPayable - hecsRepayment,
  }
}

/**
 * Calculate compulsory HECS/HELP repayment for a year.
 * Repayment = taxableIncome × rate from the band the income falls in.
 * Capped at remaining balance.
 *
 * @param {number} taxableIncome
 * @param {number} hecsBalance - current HECS balance (post CPI-indexation for the year)
 * @param {number} thresholdGrowthFactor - cumulative growth to scale nominal thresholds (1 in year 0)
 * @returns {number}
 */
export function calcHecsRepayment(taxableIncome, hecsBalance, thresholdGrowthFactor = 1) {
  if (!hecsBalance || hecsBalance <= 0 || taxableIncome <= 0) return 0
  let rate = 0
  for (const band of HECS_REPAYMENT_BANDS) {
    const scaledLower = band.lower * thresholdGrowthFactor
    const scaledUpper = band.upper === Infinity ? Infinity : band.upper * thresholdGrowthFactor
    if (taxableIncome >= scaledLower && taxableIncome < scaledUpper) {
      rate = band.rate
      break
    }
  }
  if (rate === 0) return 0
  return Math.min(hecsBalance, taxableIncome * rate)
}

/**
 * Marginal tax rate for a given income level (useful for FBT gross-up calcs).
 * @param {number} income
 * @returns {number} marginal rate e.g. 0.325
 */
export function getMarginalRate(income) {
  for (const bracket of [...TAX_BRACKETS].reverse()) {
    if (income > bracket.lower) return bracket.rate
  }
  return 0
}
