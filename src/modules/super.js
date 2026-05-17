/**
 * Superannuation Module
 * Handles contributions, caps, lifecycle phases, and minimum drawdowns.
 */

import {
  CONCESSIONAL_CAP_SCHEDULE,
  NON_CONCESSIONAL_CAP_SCHEDULE,
  SUPER_CONTRIBUTIONS_TAX_RATE,
  MIN_DRAWDOWN_RATES,
  PRESERVATION_AGE,
  SG_RATE_SCHEDULE,
  DIV293_THRESHOLD,
  DIV293_RATE,
  DIV296_LOWER_THRESHOLD,
  DIV296_UPPER_THRESHOLD,
  DIV296_LOWER_RATE,
  DIV296_UPPER_RATE,
  DIV296_FROM_FY,
  DOWNSIZER_CONTRIBUTION_CAP,
  DOWNSIZER_MIN_AGE,
} from '../constants/index.js'
import { resolveRatePeriodRate } from '../engine/ratePeriodEngine.js'

/**
 * Get the concessional contribution cap for a given simulation year.
 */
export function getConcessionalCap(year) {
  const sorted = [...CONCESSIONAL_CAP_SCHEDULE].sort((a, b) => b.fromFY - a.fromFY)
  for (const entry of sorted) {
    if (year >= entry.fromFY) return entry.cap
  }
  return CONCESSIONAL_CAP_SCHEDULE[0].cap
}

/**
 * Get the non-concessional contribution cap for a given simulation year.
 */
export function getNonConcessionalCap(year) {
  const sorted = [...NON_CONCESSIONAL_CAP_SCHEDULE].sort((a, b) => b.fromFY - a.fromFY)
  for (const entry of sorted) {
    if (year >= entry.fromFY) return entry.cap
  }
  return NON_CONCESSIONAL_CAP_SCHEDULE[0].cap
}

/**
 * Calculate Division 296 additional super tax on large balances.
 * Legislated — applies from sim year 2027 (FY2027 = 1 July 2026 onwards).
 * Tax = additional 15% on the proportion of earnings attributable to balance above $3M.
 * Thresholds are CPI-indexed (scaled by inflationFactor).
 *
 * @param {number} closingBalance - super balance at year-end
 * @param {number} earnings - gross super earnings for the year (growth component)
 * @param {number} year - simulation year
 * @param {number} inflationFactor - cumulative CPI since base year (to index $3M/$10M thresholds)
 * @returns {number} additional tax to deduct from super
 */
export function calcDiv296(closingBalance, earnings, year, inflationFactor = 1) {
  if (year < DIV296_FROM_FY || closingBalance <= 0 || earnings <= 0) return 0
  const threshold3M  = DIV296_LOWER_THRESHOLD * inflationFactor
  const threshold10M = DIV296_UPPER_THRESHOLD * inflationFactor
  if (closingBalance <= threshold3M) return 0

  // Proportion of earnings above $3M–$10M band
  const balance3Mto10M = Math.min(closingBalance, threshold10M)
  const prop3M = Math.max(0, balance3Mto10M - threshold3M) / closingBalance
  let tax = earnings * prop3M * DIV296_LOWER_RATE

  // Proportion above $10M (rare but modelled)
  if (closingBalance > threshold10M) {
    const prop10M = (closingBalance - threshold10M) / closingBalance
    tax += earnings * prop10M * DIV296_UPPER_RATE
  }
  return Math.max(0, tax)
}

/**
 * Get the SG rate for a given financial year.
 * @param {number} year - calendar year (e.g. 2026)
 * @returns {number}
 */
export function getSGRate(year) {
  // FY starts 1 July — year 2026 = FY2026 = from 1 July 2025
  const sorted = [...SG_RATE_SCHEDULE].sort((a, b) => b.fromFY - a.fromFY)
  for (const entry of sorted) {
    if (year >= entry.fromFY) return entry.rate
  }
  return SG_RATE_SCHEDULE[0].rate
}

/**
 * Get minimum drawdown rate for age.
 * @param {number} age
 * @returns {number}
 */
export function getMinDrawdownRate(age) {
  for (const bracket of MIN_DRAWDOWN_RATES) {
    if (age >= bracket.minAge && age <= bracket.maxAge) return bracket.rate
  }
  return MIN_DRAWDOWN_RATES[MIN_DRAWDOWN_RATES.length - 1].rate
}

/**
 * Determine if a person has reached preservation age.
 * @param {number} age
 * @returns {boolean}
 */
export function hasReachedPreservationAge(age) {
  return age >= PRESERVATION_AGE
}

/**
 * Calculate employer super contribution for the year.
 * @param {object} superProfile
 * @param {number} grossSalary
 * @param {number} year
 * @returns {number}
 */
export function calcEmployerContribution(superProfile, grossSalary, year) {
  const { employerScheme, employerMatchCapPct, employerFixedPct } = superProfile

  switch (employerScheme) {
    case 'sg':
      return grossSalary * getSGRate(year)
    case 'match': {
      const sgComponent = grossSalary * getSGRate(year)
      const matchCap = employerMatchCapPct ? grossSalary * employerMatchCapPct : 0
      return sgComponent + Math.min(superProfile.salarySacrificeAmount, matchCap)
    }
    case 'fixed_pct':
      return grossSalary * (employerFixedPct || getSGRate(year))
    default:
      return grossSalary * getSGRate(year)
  }
}

/**
 * Calculate Division 293 tax — additional 15% on concessional contributions
 * for high-income earners.
 *
 * Division 293 income = taxable income + low-tax contributed amounts (concessional contributions).
 * If div293 income > $250k, additional 15% is levied on the LESSER of:
 *   - total concessional contributions, or
 *   - amount by which div293 income exceeds $250k
 *
 * @param {number} grossSalary - pre-sacrifice assessable salary
 * @param {number} totalConcessional - total concessional super contributions
 * @returns {{ div293Tax: number, div293Income: number, isSubject: boolean }}
 */
export function calcDiv293(grossSalary, totalConcessional) {
  const div293Income = grossSalary + totalConcessional
  if (div293Income <= DIV293_THRESHOLD) {
    return { div293Tax: 0, div293Income, isSubject: false }
  }
  const excess = div293Income - DIV293_THRESHOLD
  const taxableAmount = Math.min(totalConcessional, excess)
  return {
    div293Tax: taxableAmount * DIV293_RATE,
    div293Income,
    isSubject: true,
  }
}

/**
 * Process super contributions for a year.
 * Returns contributions (net of 15% tax), cap warnings, and take-home pay impact.
 *
 * @param {object} superProfile
 * @param {number} grossSalary
 * @param {number} year
 * @returns {object}
 */
export function processContributions(superProfile, grossSalary, year) {
  const {
    salarySacrificeAmount = 0,
    voluntaryConcessional = 0,
    voluntaryNonConcessional = 0,
  } = superProfile

  const employerContrib = calcEmployerContribution(superProfile, grossSalary, year)

  const concessionalCap    = getConcessionalCap(year)
  const nonConcessionalCap = getNonConcessionalCap(year)

  const totalConcessional = employerContrib + salarySacrificeAmount + voluntaryConcessional
  const concessionalBreached = totalConcessional > concessionalCap

  const totalNonConcessional = voluntaryNonConcessional
  const nonConcessionalBreached = totalNonConcessional > nonConcessionalCap

  // Net amount entering the fund after contributions tax
  const concessionalNetToFund = totalConcessional * (1 - SUPER_CONTRIBUTIONS_TAX_RATE)
  const nonConcessionalNetToFund = totalNonConcessional // no tax on after-tax contributions

  const totalNetToFund = concessionalNetToFund + nonConcessionalNetToFund

  // Division 293 — additional 15% on concessional contributions for high earners
  const div293 = calcDiv293(grossSalary, totalConcessional)

  const warnings = []
  if (concessionalBreached) {
    warnings.push(`Concessional cap exceeded by $${Math.round(totalConcessional - concessionalCap).toLocaleString()}. Excess taxed at marginal rate.`)
  }
  if (nonConcessionalBreached) {
    warnings.push(`Non-concessional cap exceeded by $${Math.round(totalNonConcessional - nonConcessionalCap).toLocaleString()}.`)
  }
  if (div293.isSubject) {
    warnings.push(`Division 293: additional $${Math.round(div293.div293Tax).toLocaleString()} tax on super contributions (income + contributions > $${(DIV293_THRESHOLD / 1000)}k).`)
  }

  return {
    employerContrib,
    salarySacrificeAmount,
    voluntaryConcessional,
    voluntaryNonConcessional,
    totalConcessional,
    totalNonConcessional,
    totalNetToFund,
    concessionalBreached,
    nonConcessionalBreached,
    div293Tax: div293.div293Tax,
    div293Income: div293.div293Income,
    div293Subject: div293.isSubject,
    warnings,
  }
}

/**
 * Grow super balance for a year and apply drawdown if in pension phase.
 *
 * @param {object} params
 * @param {number} params.openingBalance
 * @param {number} params.contributions       - net contributions after tax
 * @param {object} params.superProfile        - from data model
 * @param {number} params.year                - simulation year
 * @param {number} params.personAge           - age at end of year
 * @param {number} params.retirementYear      - year the person retired
 * @param {object} params.assumptions
 * @returns {object}
 */
export function growSuperBalance({
  openingBalance,
  contributions,
  superProfile,
  year,
  personAge,
  retirementYear,
  assumptions,
}) {
  const inPensionPhase =
    superProfile.pensionPhaseFromAge != null
      ? personAge >= superProfile.pensionPhaseFromAge
      : (retirementYear != null && year >= retirementYear && hasReachedPreservationAge(personAge))

  const isTTR = superProfile.isTTR && !inPensionPhase && hasReachedPreservationAge(personAge)

  const rate = resolveRatePeriodRate(superProfile.ratePeriods, year,
    inPensionPhase ? assumptions.superPensionRate : assumptions.superAccumulationRate)

  // Balance grows at rate on opening balance + contributions (added mid-year approximation)
  const grownBalance = (openingBalance + contributions) * (1 + rate)

  let drawdown = 0
  let minDrawdown = 0

  if (inPensionPhase) {
    minDrawdown = grownBalance * getMinDrawdownRate(personAge)
    drawdown = minDrawdown
  } else if (isTTR) {
    // TTR: pension income stream, up to 10% of balance
    minDrawdown = grownBalance * getMinDrawdownRate(personAge)
    drawdown = minDrawdown
  }

  const closingBalance = Math.max(0, grownBalance - drawdown)

  return {
    openingBalance,
    contributions,
    rate,
    grownBalance,
    drawdown,
    minDrawdown,
    closingBalance,
    inPensionPhase,
    isTTR,
    isLocked: !hasReachedPreservationAge(personAge) && !isTTR,
  }
}

/**
 * Calculate downsizer contribution — up to $300k per person from property sale proceeds
 * into super, outside normal contribution caps. No contributions tax applies.
 *
 * Eligibility: age >= 55, property owned for 10+ years (assumed if sale event present).
 * The contribution is not subject to contribution caps or 15% contributions tax.
 *
 * @param {number} saleProceeds - net proceeds from property sale
 * @param {number} personAge - age of the person
 * @param {number} ownershipPct - percentage ownership (0-100)
 * @returns {{ amount: number, eligible: boolean }}
 */
export function calcDownsizerContribution(saleProceeds, personAge, ownershipPct = 100) {
  if (personAge < DOWNSIZER_MIN_AGE || saleProceeds <= 0) {
    return { amount: 0, eligible: false }
  }
  const shareOfProceeds = saleProceeds * (ownershipPct / 100)
  const amount = Math.min(shareOfProceeds, DOWNSIZER_CONTRIBUTION_CAP)
  return { amount, eligible: true }
}
