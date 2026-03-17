/**
 * Superannuation Module
 * Handles contributions, caps, lifecycle phases, and minimum drawdowns.
 */

import {
  CONCESSIONAL_CAP,
  NON_CONCESSIONAL_CAP,
  SUPER_CONTRIBUTIONS_TAX_RATE,
  MIN_DRAWDOWN_RATES,
  PRESERVATION_AGE,
  SG_RATE_SCHEDULE,
} from '../constants/index.js'
import { resolveRatePeriodRate } from '../engine/ratePeriodEngine.js'

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

  const totalConcessional = employerContrib + salarySacrificeAmount + voluntaryConcessional
  const concessionalBreached = totalConcessional > CONCESSIONAL_CAP

  const totalNonConcessional = voluntaryNonConcessional
  const nonConcessionalBreached = totalNonConcessional > NON_CONCESSIONAL_CAP

  // Net amount entering the fund after contributions tax
  const concessionalNetToFund = totalConcessional * (1 - SUPER_CONTRIBUTIONS_TAX_RATE)
  const nonConcessionalNetToFund = totalNonConcessional // no tax on after-tax contributions

  const totalNetToFund = concessionalNetToFund + nonConcessionalNetToFund

  const warnings = []
  if (concessionalBreached) {
    warnings.push(`Concessional cap exceeded by $${Math.round(totalConcessional - CONCESSIONAL_CAP).toLocaleString()}. Excess taxed at marginal rate.`)
  }
  if (nonConcessionalBreached) {
    warnings.push(`Non-concessional cap exceeded by $${Math.round(totalNonConcessional - NON_CONCESSIONAL_CAP).toLocaleString()}.`)
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
      : (retirementYear != null && year >= retirementYear)

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
