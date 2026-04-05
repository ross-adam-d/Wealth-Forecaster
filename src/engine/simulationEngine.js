/**
 * Simulation Engine — Orchestrator
 *
 * Runs year-by-year from current year to simulation end age.
 * Follows the exact 12-step calculation order from the spec (Section 5).
 * Returns an array of year snapshots for chart and table rendering.
 */

import { resolvePackagingReductions, calcPersonTax, calcFrankingCredit } from './taxEngine.js'
import { calcECM, calcStatutory } from '../modules/fbt.js'
import { processContributions, growSuperBalance, hasReachedPreservationAge, calcDownsizerContribution } from '../modules/super.js'
import { processPropertyYear } from '../modules/property.js'
import { processSharesYear } from '../modules/shares.js'
import { processTreasuryBondsYear } from '../modules/treasuryBonds.js'
import { processCommoditiesYear } from '../modules/commodities.js'
import { processBondYear } from '../modules/investmentBonds.js'
import { resolveExpenseTree } from '../modules/expenses.js'
import { processOtherAssetYear } from '../modules/otherAssets.js'
import { processOtherIncome } from '../modules/otherIncome.js'
import { processAllDebts } from '../modules/debts.js'
import { calcAgePension } from '../modules/agePension.js'
import { aggregateHoldings, distributeProportionally } from '../utils/holdings.js'
import { SURPLUS_DESTINATIONS, BOND_CONTRIBUTION_MODES, INVESTMENT_BOND_125_PCT_RULE, DRAWDOWN_SOURCES, DEFAULT_DRAWDOWN_ORDER } from '../constants/index.js'

/**
 * Get the age of a person in a given simulation year.
 */
function getAge(dateOfBirth, year) {
  if (!dateOfBirth) return null
  const birthYear = new Date(dateOfBirth).getFullYear()
  return year - birthYear
}

/**
 * Apply wage growth to salary.
 */
function growSalary(salary, wageGrowthRate, yearsElapsed) {
  return salary * Math.pow(1 + wageGrowthRate, yearsElapsed)
}

/**
 * Convert a salary entered in any period to annual.
 */
function toAnnualSalary(amount, period) {
  if (!amount) return 0
  switch (period) {
    case 'weekly':      return amount * 52
    case 'fortnightly': return amount * 26
    case 'monthly':     return amount * 12
    default:            return amount  // 'annual' or unset
  }
}

/**
 * Resolve effective salary for a person in a given year.
 * Checks salaryChanges for overrides (most specific match wins).
 * Returns the annual salary BEFORE wage growth.
 */
function resolveBaseSalary(person, year, startYear) {
  const baseSalary = toAnnualSalary(person.currentSalary, person.salaryPeriod)
  const changes = person.salaryChanges || []
  if (changes.length === 0) return baseSalary

  // Find the applicable salary change for this year (last match wins)
  let activeSalary = null
  for (const change of changes) {
    const from = change.fromYear || startYear
    const to = change.toYear || Infinity
    if (year >= from && year <= to) {
      activeSalary = toAnnualSalary(change.salary, change.salaryPeriod)
    }
  }

  // If a change is active, use it (no wage growth compounding — the user sets the exact amount)
  // If no change is active, use base salary
  return activeSalary != null ? activeSalary : baseSalary
}

/**
 * Determine if a person has retired in or before a given year.
 */
function hasRetired(person, year) {
  if (!person.dateOfBirth) return false
  const retirementYear = new Date(person.dateOfBirth).getFullYear() + person.retirementAge
  return year >= retirementYear
}

/**
 * Resolve FBT novated lease reduction for a person in a year.
 */
/**
 * Calculate days available in a simulation year for a novated lease.
 * Handles month/year dates (e.g. "2026-07") and legacy year-only values.
 */
function calcDaysAvailable(from, to, year) {
  let startDay = new Date(year, 0, 1) // Jan 1
  let endDay = new Date(year, 11, 31) // Dec 31

  if (from != null) {
    let fromDate
    if (typeof from === 'string' && from.includes('-')) {
      const [y, m] = from.split('-').map(Number)
      fromDate = new Date(y, m - 1, 1) // 1st of start month
    } else {
      fromDate = new Date(Number(from), 0, 1)
    }
    if (fromDate > endDay) return 0 // hasn't started yet
    if (fromDate > startDay) startDay = fromDate
  }

  if (to != null) {
    let toDate
    if (typeof to === 'string' && to.includes('-')) {
      const [y, m] = to.split('-').map(Number)
      // Last day of end month
      toDate = new Date(y, m, 0)
    } else {
      toDate = new Date(Number(to), 11, 31)
    }
    if (toDate < startDay) return 0 // already ended
    if (toDate < endDay) endDay = toDate
  }

  const msPerDay = 86400000
  return Math.round((endDay - startDay) / msPerDay) + 1
}

function resolveNovatedLeaseReduction(person, year) {
  const lease = person.packaging?.novatedLease
  if (!lease) return { reduction: 0, fbtResult: null }

  // Check active window — supports "YYYY-MM" strings and legacy year numbers
  const from = lease.activeYears?.from
  const to = lease.activeYears?.to
  const daysAvailable = calcDaysAvailable(from, to, year)
  if (daysAvailable <= 0) return { reduction: 0, fbtResult: null }

  // Calculate annual lease payment from cost, residual, rate, term
  const cost = lease.vehicleCostPrice || 0
  const residual = lease.residualValue || 0
  const term = lease.termYears || 5
  const rate = lease.interestRate || 0
  const financed = Math.max(0, cost - residual)
  const totalInterest = financed * rate * term
  const annualLeasePayment = term > 0 ? (financed + totalInterest) / term : 0

  // If offsetWithECM is on, first calculate without contribution to find rawTaxableValue,
  // then recalculate with that as the contribution to eliminate FBT
  let employeeContrib = lease.employeePostTaxContribution || 0
  if (lease.offsetWithECM && !lease.isEV) {
    const baseParams = {
      vehicleCostPrice: cost,
      annualRunningCosts: lease.annualRunningCosts,
      annualLeasePayment,
      annualKmTotal: lease.annualKmTotal,
      annualKmBusiness: lease.annualKmBusiness,
      daysAvailable,
      employeePostTaxContrib: 0,
      isEV: false,
    }
    const baseResult = lease.method === 'ecm' ? calcECM(baseParams) : calcStatutory(baseParams)
    employeeContrib = baseResult.rawTaxableValue || 0
  }

  const params = {
    vehicleCostPrice: cost,
    annualRunningCosts: lease.annualRunningCosts,
    annualLeasePayment,
    annualKmTotal: lease.annualKmTotal,
    annualKmBusiness: lease.annualKmBusiness,
    daysAvailable,
    employeePostTaxContrib: employeeContrib,
    isEV: lease.isEV,
  }

  const fbtResult = lease.method === 'ecm'
    ? calcECM(params)
    : calcStatutory(params)

  // Residual/balloon: post-tax lump sum in the final year of the lease (based on activeYears.to)
  const toYear = typeof to === 'string' ? parseInt(to.slice(0, 4), 10) : (to || year)
  const residualPayment = (residual > 0 && year === toYear) ? residual : 0

  return {
    reduction: fbtResult.pretaxPackageReduction,
    employeePostTaxContrib: employeeContrib,
    residualPayment,
    fbtResult,
  }
}

/**
 * Run the full simulation for a scenario.
 *
 * @param {object} scenario  - full scenario from data model
 * @param {object} opts
 * @param {object} opts.leverAdjustments - Impact Analyser overrides
 * @returns {Array<object>} yearSnapshots
 */
export function runSimulation(scenario, { leverAdjustments = {} } = {}) {
  const {
    household,
    super: superAccounts,
    properties,
    shares,
    treasuryBonds: treasuryBondsInput,
    commodities: commoditiesInput,
    investmentBonds,
    otherAssets: otherAssetsInput = [],
    otherIncome: otherIncomeInput = [],
    debts: debtsInput = [],
    expenses,
    assumptions,
    simulationEndAge,
    surplusRoutingOrder,
    drawdownOrder: drawdownOrderInput,
  } = scenario

  const currentYear = new Date().getFullYear()
  const personA = household.personA
  const personB = household.personB

  // Determine simulation end year — based on the older person (earlier birth year)
  // Only consider persons with a valid date of birth
  const birthYearA = personA.dateOfBirth ? new Date(personA.dateOfBirth).getFullYear() : null
  const birthYearB = personB.dateOfBirth ? new Date(personB.dateOfBirth).getFullYear() : null
  const olderBirthYear = birthYearA && birthYearB
    ? Math.min(birthYearA, birthYearB)
    : birthYearA || birthYearB || currentYear
  const simEndYear = olderBirthYear + simulationEndAge

  // Mutable state — guard against missing super accounts
  const superProfileA = superAccounts.find(s => s.personLabel === 'A') || {}
  const superProfileB = superAccounts.find(s => s.personLabel === 'B') || {}
  let superA = { ...superProfileA, currentBalance: superProfileA.currentBalance || 0 }
  let superB = { ...superProfileB, currentBalance: superProfileB.currentBalance || 0 }
  let currentShares = { ...shares }
  let currentTreasuryBonds = { ...(treasuryBondsInput || { currentValue: 0, holdings: [], annualContribution: 0, contributionMode: 'fixed', annualIncreaseRate: 0, couponRate: 0, preserveCapital: false, preserveCapitalFromAge: null, ratePeriods: [] }) }
  let currentCommodities = { ...(commoditiesInput || { currentValue: 0, holdings: [], annualContribution: 0, contributionMode: 'fixed', annualIncreaseRate: 0, ratePeriods: [] }) }
  let currentBonds = investmentBonds.map(b => ({ ...b }))
  let currentOtherAssets = otherAssetsInput.map(a => ({ ...a }))
  let currentProperties = properties.map(p => ({ ...p }))
  let currentDebts = debtsInput.map(d => ({ ...d }))
  // Fold initial offset balances into cash — offset IS cash that reduces mortgage interest
  let cashBuffer = currentProperties.reduce((sum, p) => sum + (p.offsetBalance || 0), 0)
  currentProperties = currentProperties.map(p => ({
    ...p,
    hasOffset: p.hasOffset || (p.offsetBalance > 0) || (p.offsetAnnualTopUp > 0),
    offsetBalance: 0,
  }))
  let firstDeficitYear = null
  let cumulativeDeficit = 0

  const yearSnapshots = []

  for (let year = currentYear; year <= simEndYear; year++) {
    const yearsElapsed = year - currentYear
    const ageA = getAge(personA.dateOfBirth, year)
    const ageB = getAge(personB.dateOfBirth, year)
    const retiredA = hasRetired(personA, year)
    const retiredB = hasRetired(personB, year)

    // Resolve per-year assumptions — support pre/post-retirement return overrides
    const returnsAdj = leverAdjustments.returns || {}
    const allRetiredForReturns = retiredA && (personB.dateOfBirth ? retiredB : true)
    const returnOverride = returnsAdj.preRetirement || returnsAdj.postRetirement
      ? (allRetiredForReturns ? returnsAdj.postRetirement || {} : returnsAdj.preRetirement || {})
      : returnsAdj
    const yearAssumptions = Object.keys(returnOverride).length > 0
      ? { ...assumptions, ...returnOverride }
      : assumptions

    // ── Step 1: Resolve salaries ──────────────────────────────────────────
    // Check for salary change overrides (part-time, career break, etc.)
    const baseSalaryA = resolveBaseSalary(personA, year, currentYear)
    const baseSalaryB = resolveBaseSalary(personB, year, currentYear)
    const baseAnnualA = toAnnualSalary(personA.currentSalary, personA.salaryPeriod)
    const baseAnnualB = toAnnualSalary(personB.currentSalary, personB.salaryPeriod)
    // Apply wage growth only when using the base salary (not during a salary change override)
    const salaryA = retiredA ? 0 : (baseSalaryA !== baseAnnualA
      ? baseSalaryA  // salary change period — user sets exact amount, no wage growth
      : growSalary(baseAnnualA, personA.wageGrowthRate || yearAssumptions.wageGrowthRate, yearsElapsed))
    const salaryB = retiredB ? 0 : (baseSalaryB !== baseAnnualB
      ? baseSalaryB
      : growSalary(baseAnnualB, personB.wageGrowthRate || yearAssumptions.wageGrowthRate, yearsElapsed))

    const { packagingReduction: packReductionA, packagingSummary: packSummaryA } = resolvePackagingReductions(personA, salaryA)
    const { packagingReduction: packReductionB, packagingSummary: packSummaryB } = resolvePackagingReductions(personB, salaryB)
    const { reduction: leaseReductionA, employeePostTaxContrib: leasePostTaxA, residualPayment: leaseResidualA, fbtResult: fbtA } = resolveNovatedLeaseReduction(personA, year)
    const { reduction: leaseReductionB, employeePostTaxContrib: leasePostTaxB, residualPayment: leaseResidualB, fbtResult: fbtB } = resolveNovatedLeaseReduction(personB, year)

    // ── Step 2: Income tax ────────────────────────────────────────────────
    // Zero out salary sacrifice and voluntary contributions when retired (no salary to sacrifice)
    const superA_forContrib = retiredA
      ? { ...superA, salarySacrificeAmount: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }
      : superA
    const superB_forContrib = retiredB
      ? { ...superB, salarySacrificeAmount: 0, voluntaryConcessional: 0, voluntaryNonConcessional: 0 }
      : superB
    const superContribA_pre = processContributions(superA_forContrib, salaryA, year)
    const superContribB_pre = processContributions(superB_forContrib, salaryB, year)

    const taxA = calcPersonTax({
      grossSalary: salaryA,
      salarySacrifice: superContribA_pre.salarySacrificeAmount,
      packagingReduction: packReductionA,
      novatedLeaseReduction: leaseReductionA,
      inPensionPhase: ageA != null && hasReachedPreservationAge(ageA) && retiredA,
    })

    const taxB = calcPersonTax({
      grossSalary: salaryB,
      salarySacrifice: superContribB_pre.salarySacrificeAmount,
      packagingReduction: packReductionB,
      novatedLeaseReduction: leaseReductionB,
      inPensionPhase: ageB != null && hasReachedPreservationAge(ageB) && retiredB,
    })

    // ── Step 3 & 4: Super contributions + cap checks ──────────────────────
    const superA_result = growSuperBalance({
      openingBalance: superA.currentBalance,
      contributions: superContribA_pre.totalNetToFund,
      superProfile: superA,
      year,
      personAge: ageA || 0,
      retirementYear: personA.dateOfBirth ? new Date(personA.dateOfBirth).getFullYear() + personA.retirementAge : null,
      assumptions: yearAssumptions,
    })

    const superB_result = growSuperBalance({
      openingBalance: superB.currentBalance,
      contributions: superContribB_pre.totalNetToFund,
      superProfile: superB,
      year,
      personAge: ageB || 0,
      retirementYear: personB.dateOfBirth ? new Date(personB.dateOfBirth).getFullYear() + personB.retirementAge : null,
      assumptions: yearAssumptions,
    })

    // ── Step 6: Property ──────────────────────────────────────────────────
    // Offset is cash: distribute cash buffer across properties with mortgages for interest reduction
    // Each property gets up to its mortgage balance from the available cash pool
    let remainingCashForOffset = Math.max(0, cashBuffer)
    const cashForOffsetPerProperty = currentProperties.map(p => {
      if (!p.hasOffset || p.mortgageBalance <= 0) return 0
      const allocated = Math.min(remainingCashForOffset, p.mortgageBalance)
      remainingCashForOffset -= allocated
      return allocated
    })
    const propertyResults = currentProperties.map((p, i) => processPropertyYear(p, year, cashForOffsetPerProperty[i]))
    const totalNetRentalIncomeLoss = propertyResults.reduce((sum, r) => sum + r.netRentalIncomeLoss, 0)
    const totalMortgageRepayments = propertyResults.reduce((sum, r) => sum + r.annualRepayment, 0)
    const propertySaleProceeds = propertyResults.reduce((sum, r) => sum + (r.saleProceeds || 0), 0)
    const totalLandTax = propertyResults.reduce((sum, r) => sum + (r.landTax || 0), 0)
    const totalSellingCosts = propertyResults.reduce((sum, r) => sum + (r.sellingCosts || 0), 0)
    const totalPurchaseCashOutflow = propertyResults.reduce((sum, r) => sum + (r.purchaseCashOutflow || 0), 0)
    // Split CGT between A and B based on property ownership percentage
    const propertyCGT_A = propertyResults.reduce((sum, r, i) => {
      const pct = (currentProperties[i].ownershipPctA ?? 100) / 100
      return sum + (r.cgtAmount || 0) * pct
    }, 0)
    const propertyCGT_B = propertyResults.reduce((sum, r, i) => {
      const pct = (currentProperties[i].ownershipPctA ?? 100) / 100
      return sum + (r.cgtAmount || 0) * (1 - pct)
    }, 0)

    // ── Downsizer contribution — if property sold and person is 55+ ────
    let downsizerA = { amount: 0, eligible: false }
    let downsizerB = { amount: 0, eligible: false }
    if (propertySaleProceeds > 0) {
      for (let i = 0; i < propertyResults.length; i++) {
        if (propertyResults[i].saleProceeds > 0) {
          const pctA = currentProperties[i].ownershipPctA ?? 100
          if (ageA != null) {
            const dA = calcDownsizerContribution(propertyResults[i].saleProceeds, ageA, pctA)
            if (dA.eligible) {
              downsizerA = { amount: downsizerA.amount + dA.amount, eligible: true }
            }
          }
          if (ageB != null && personB.dateOfBirth) {
            const dB = calcDownsizerContribution(propertyResults[i].saleProceeds, ageB, 100 - pctA)
            if (dB.eligible) {
              downsizerB = { amount: downsizerB.amount + dB.amount, eligible: true }
            }
          }
        }
      }
      // Cap at $300k per person across all sales in a year
      downsizerA.amount = Math.min(downsizerA.amount, 300_000)
      downsizerB.amount = Math.min(downsizerB.amount, 300_000)
    }
    const totalDownsizer = downsizerA.amount + downsizerB.amount

    // ── Holdings aggregation — override category-level values from individual holdings ──
    // Shares holdings
    const sharesAgg = aggregateHoldings(currentShares.holdings)
    const effectiveShares = sharesAgg
      ? { ...currentShares, currentValue: sharesAgg.currentValue, dividendYield: sharesAgg.dividendYield, frankingPct: sharesAgg.frankingPct, ratePeriods: [{ fromYear: year, toYear: year, rate: sharesAgg.returnRate }] }
      : currentShares
    // Treasury bonds holdings
    const tbAgg = aggregateHoldings(currentTreasuryBonds.holdings)
    const effectiveTB = tbAgg
      ? { ...currentTreasuryBonds, currentValue: tbAgg.currentValue, couponRate: tbAgg.couponRate, ratePeriods: [{ fromYear: year, toYear: year, rate: tbAgg.returnRate }] }
      : currentTreasuryBonds
    // Commodities holdings
    const commAgg = aggregateHoldings(currentCommodities.holdings)
    const effectiveComm = commAgg
      ? { ...currentCommodities, currentValue: commAgg.currentValue, ratePeriods: [{ fromYear: year, toYear: year, rate: commAgg.returnRate }] }
      : currentCommodities

    // ── Step 7: Shares — growth phase only (contribution resolved after cashflow) ──
    const sharesResult = processSharesYear({
      shares: effectiveShares,
      year,
      personAge: Math.max(ageA || 0, ageB || 0),
      drawdownNeeded: 0,
      resolvedContribution: 0,  // no contribution in growth pass — resolved after cashflow
      assumptions: yearAssumptions,
    })

    // ── Step 7b: Treasury bonds — growth phase ──
    const tbResult = processTreasuryBondsYear({
      bonds: effectiveTB,
      year,
      personAge: Math.max(ageA || 0, ageB || 0),
      drawdownNeeded: 0,
      resolvedContribution: 0,
      assumptions: yearAssumptions,
    })

    // ── Step 7c: Commodities — growth phase ──
    const commResult = processCommoditiesYear({
      commodities: effectiveComm,
      year,
      drawdownNeeded: 0,
      resolvedContribution: 0,
      assumptions: yearAssumptions,
    })

    // ── Other income sources ──────────────────────────────────────────────
    const otherIncomeResult = processOtherIncome(otherIncomeInput, year, currentYear, yearAssumptions.inflationRate)

    // Recalculate tax with dividends + coupon income + property (CGT split by ownership %) + other income
    // Treasury bond coupon income split 50/50 between persons (taxed as ordinary income, no franking)
    const tbCouponHalf = tbResult.couponIncome * 0.5
    const taxAFinal = calcPersonTax({
      grossSalary: salaryA,
      salarySacrifice: superContribA_pre.salarySacrificeAmount,
      packagingReduction: packReductionA,
      novatedLeaseReduction: leaseReductionA,
      rentalIncomeLoss: totalNetRentalIncomeLoss,
      dividendIncome: sharesResult.cashDividend * 0.5,
      frankingCredit: sharesResult.frankingCredit * 0.5,
      capitalGain: propertyCGT_A,
      otherIncome: otherIncomeResult.taxableA + tbCouponHalf,
      inPensionPhase: ageA != null && hasReachedPreservationAge(ageA) && retiredA,
    })

    const hasTBCoupon = tbResult.couponIncome > 0
    const taxBFinal = (propertyCGT_B > 0 || otherIncomeResult.taxableB > 0 || hasTBCoupon) ? calcPersonTax({
      grossSalary: salaryB,
      salarySacrifice: superContribB_pre.salarySacrificeAmount,
      packagingReduction: packReductionB,
      novatedLeaseReduction: leaseReductionB,
      capitalGain: propertyCGT_B,
      otherIncome: otherIncomeResult.taxableB + tbCouponHalf,
      inPensionPhase: ageB != null && hasReachedPreservationAge(ageB) && retiredB,
    }) : taxB

    // ── Step 8: Resolve target contributions for ALL non-property investments ──
    // Post-retirement: all accumulation strategies cease — no new contributions
    const allRetired = retiredA && (personB.dateOfBirth ? retiredB : true)

    // Generic helper: resolve target contribution based on mode + annual increase rate
    function resolveTargetContribution(annualContribution, annualIncreaseRate, priorActual, isBond) {
      if (allRetired) return 0
      const base = annualContribution || 0
      const prior = priorActual || 0
      let target = base
      if (annualIncreaseRate > 0 && prior > 0) {
        // For bonds, increase rate is capped at 25% (125% rule)
        const effectiveRate = isBond ? Math.min(annualIncreaseRate, 0.25) : annualIncreaseRate
        target = Math.max(base, prior * (1 + effectiveRate))
      }
      return target
    }

    // --- Shares ---
    const sharesMode = currentShares.contributionMode || BOND_CONTRIBUTION_MODES.SURPLUS  // legacy default: surplus
    const sharesTarget = resolveTargetContribution(
      currentShares.annualContribution, currentShares.annualIncreaseRate || 0,
      currentShares.priorYearContribution || 0, false
    )
    let fixedSharesContribution = sharesMode === BOND_CONTRIBUTION_MODES.FIXED ? sharesTarget : 0

    // --- Bonds ---
    const bondTargetContributions = currentBonds.map(bond => {
      const mode = bond.contributionMode || BOND_CONTRIBUTION_MODES.FIXED
      const target = resolveTargetContribution(
        bond.annualContribution, bond.annualIncreaseRate || 0,
        bond.priorYearContribution || 0, true
      )
      return { mode, target }
    })
    const fixedBondContributions = currentBonds.map((_, i) =>
      bondTargetContributions[i].mode === BOND_CONTRIBUTION_MODES.FIXED ? bondTargetContributions[i].target : 0
    )
    const totalFixedBondContributions = fixedBondContributions.reduce((sum, c) => sum + c, 0)

    // --- Other assets ---
    const otherAssetTargetContributions = currentOtherAssets.map(asset => {
      const mode = asset.contributionMode || BOND_CONTRIBUTION_MODES.FIXED
      const target = resolveTargetContribution(
        asset.annualContribution, asset.annualIncreaseRate || 0,
        asset.priorYearContribution || 0, false
      )
      return { mode, target }
    })
    const fixedOtherAssetContributions = currentOtherAssets.map((_, i) =>
      otherAssetTargetContributions[i].mode === BOND_CONTRIBUTION_MODES.FIXED ? otherAssetTargetContributions[i].target : 0
    )
    const totalFixedOtherAssetContributions = fixedOtherAssetContributions.reduce((sum, c) => sum + c, 0)

    // --- Treasury bonds ---
    const tbMode = currentTreasuryBonds.contributionMode || BOND_CONTRIBUTION_MODES.FIXED
    const tbTarget = resolveTargetContribution(
      currentTreasuryBonds.annualContribution, currentTreasuryBonds.annualIncreaseRate || 0,
      currentTreasuryBonds.priorYearContribution || 0, false
    )
    let fixedTBContribution = tbMode === BOND_CONTRIBUTION_MODES.FIXED ? tbTarget : 0

    // --- Commodities ---
    const commMode = currentCommodities.contributionMode || BOND_CONTRIBUTION_MODES.FIXED
    const commTarget = resolveTargetContribution(
      currentCommodities.annualContribution, currentCommodities.annualIncreaseRate || 0,
      currentCommodities.priorYearContribution || 0, false
    )
    let fixedCommContribution = commMode === BOND_CONTRIBUTION_MODES.FIXED ? commTarget : 0

    // Total fixed contributions across all asset types
    const totalFixedContributions = fixedSharesContribution + fixedTBContribution + fixedCommContribution + totalFixedBondContributions + totalFixedOtherAssetContributions

    // Bond growth phase: fixed-mode bonds get their contribution now; surplus-mode bonds get 0
    const bondGrowthResults = currentBonds.map((bond, i) =>
      processBondYear({ bond, year, drawdownNeeded: 0, resolvedContribution: fixedBondContributions[i], assumptions: yearAssumptions })
    )

    // Other asset growth phase: fixed-mode assets get their contribution now; surplus-mode get 0
    const otherAssetGrowthResults = currentOtherAssets.map((asset, i) =>
      processOtherAssetYear({ asset, year, drawdownNeeded: 0, resolvedContribution: fixedOtherAssetContributions[i] })
    )

    // ── Step 9: Expenses ──────────────────────────────────────────────────
    // Resolve expense lever adjustments — support pre/post-retirement splits
    const rawExpAdj = leverAdjustments.expenses || {}
    const allRetiredForExpenses = retiredA && (personB.dateOfBirth ? retiredB : true)
    const resolvedExpAdj = rawExpAdj.preRetirement || rawExpAdj.postRetirement
      ? (allRetiredForExpenses ? rawExpAdj.postRetirement || {} : rawExpAdj.preRetirement || {})
      : rawExpAdj
    const expenseTree = resolveExpenseTree(
      expenses,
      year,
      currentYear,
      yearAssumptions.inflationRate,
      resolvedExpAdj,
    )
    const totalExpenses = expenseTree.total

    // ── Step 9b: Debts ────────────────────────────────────────────────────
    const debtResult = processAllDebts(currentDebts, year)
    const totalDebtRepayments = debtResult.totalRepayment
    const totalDebtBalance = debtResult.totalBalance

    // ── Age Pension (preliminary — calculated before cashflow for income inclusion) ──
    // NOTE: Full pension calc with final asset values is done post-balances (see below).
    // This preliminary calc uses opening-year balances for income inclusion.
    const hasHomePrimaryPrelim = currentProperties.some(p => p.isPrimaryResidence)
    const investmentPropertyEquityPrelim = currentProperties.reduce((sum, p) =>
      sum + (p.isPrimaryResidence ? 0 : Math.max(0, (p.currentValue || 0) - (p.mortgageBalance || 0))), 0)

    const agePensionPrelim = calcAgePension({
      ageA,
      ageB: personB.dateOfBirth ? ageB : null,
      retiredA,
      retiredB,
      isHomeowner: hasHomePrimaryPrelim,
      superABalance: superA.currentBalance,
      superAInPension: superA_result.inPensionPhase,
      superBBalance: superB.currentBalance,
      superBInPension: superB_result.inPensionPhase,
      sharesValue: currentShares.currentValue,
      treasuryBondsValue: currentTreasuryBonds.currentValue,
      commoditiesValue: currentCommodities.currentValue,
      bondLiquidity: currentBonds.reduce((s, b) => s + (b.currentBalance || 0), 0),
      otherAssetsValue: currentOtherAssets.reduce((s, a) => s + (a.currentValue || 0), 0),
      cashBuffer: Math.max(0, cashBuffer),
      investmentPropertyEquity: investmentPropertyEquityPrelim,
      otherIncome: otherIncomeResult.total,
    })

    // ── Step 10: Net cashflow ─────────────────────────────────────────────
    // Compute preliminary income without asset withdrawals
    const totalIncomePreBond =
      taxAFinal.netTakeHome +
      taxBFinal.netTakeHome +
      (totalNetRentalIncomeLoss > 0 ? totalNetRentalIncomeLoss : 0) +
      sharesResult.cashDividend +
      tbResult.couponIncome +           // Treasury bond coupon (already taxed via otherIncome in calcPersonTax)
      taxAFinal.frankingRefund +
      superA_result.drawdown +
      superB_result.drawdown +
      propertySaleProceeds +
      otherIncomeResult.nonTaxable +  // non-taxable other income (taxable already in netTakeHome)
      agePensionPrelim.totalPension    // Age Pension is tax-free for pensioners

    // Division 293 tax — additional personal tax liability for high-income earners
    const div293TaxA = superContribA_pre.div293Tax || 0
    const div293TaxB = superContribB_pre.div293Tax || 0
    const totalDiv293Tax = div293TaxA + div293TaxB

    // Novated lease post-tax costs: employee post-tax contribution + residual balloon (final year)
    // Pre-tax package reduction is already deducted from netTakeHome (salary packaging)
    const totalLeasePostTaxCost =
      (leasePostTaxA || 0) + (leasePostTaxB || 0) +
      (leaseResidualA || 0) + (leaseResidualB || 0)

    // Fixed contributions should not force asset drawdowns — cap at available cashflow
    const essentialOutflows = totalExpenses + totalMortgageRepayments + totalDebtRepayments + totalDiv293Tax + totalDownsizer + totalLeasePostTaxCost + totalPurchaseCashOutflow
    const availableForContributions = Math.max(0, totalIncomePreBond - essentialOutflows)
    const cappedFixedContributions = Math.min(totalFixedContributions, availableForContributions)

    // Scale individual contributions proportionally if capped
    if (cappedFixedContributions < totalFixedContributions && totalFixedContributions > 0) {
      const contribScale = cappedFixedContributions / totalFixedContributions
      fixedSharesContribution *= contribScale
      fixedTBContribution *= contribScale
      fixedCommContribution *= contribScale
      for (let i = 0; i < fixedBondContributions.length; i++) {
        fixedBondContributions[i] *= contribScale
      }
      for (let i = 0; i < fixedOtherAssetContributions.length; i++) {
        fixedOtherAssetContributions[i] *= contribScale
      }
    }

    const totalOutflows =
      essentialOutflows +
      cappedFixedContributions

    // ── Post-retirement income routing ──────────────────────────────────
    // When retired, other income sources with routeTo != 'cashflow' are directed
    // to specific vehicles. The gross amount already flowed through tax; now
    // allocate it as a contribution to the target vehicle (reducing cashflow).
    let routedSharesContribution = 0
    let routedTBContribution = 0
    let routedCommContribution = 0
    let routedCashContribution = 0
    const routedBondContributions = currentBonds.map(() => 0)
    const routedOtherAssetContributions = currentOtherAssets.map(() => 0)

    if (allRetired && otherIncomeResult.breakdown.length > 0) {
      for (const item of otherIncomeResult.breakdown) {
        const source = otherIncomeInput.find(s => s.id === item.id)
        if (!source || !source.routeTo || source.routeTo === 'cashflow') continue

        const routeAmount = item.amount  // gross amount (tax already deducted in netTakeHome)
        if (source.routeTo === 'shares') {
          routedSharesContribution += routeAmount
        } else if (source.routeTo === 'treasuryBonds') {
          routedTBContribution += routeAmount
        } else if (source.routeTo === 'commodities') {
          routedCommContribution += routeAmount
        } else if (source.routeTo === 'bonds') {
          // Spread across bonds equally (or first bond if only one)
          if (currentBonds.length > 0) {
            const perBond = routeAmount / currentBonds.length
            for (let i = 0; i < currentBonds.length; i++) {
              routedBondContributions[i] += perBond
            }
          }
        } else if (source.routeTo === 'otherAssets') {
          if (currentOtherAssets.length > 0) {
            const perAsset = routeAmount / currentOtherAssets.length
            for (let i = 0; i < currentOtherAssets.length; i++) {
              routedOtherAssetContributions[i] += perAsset
            }
          }
        } else if (source.routeTo === 'cash') {
          routedCashContribution += routeAmount
        }
      }
    }
    const totalRoutedContributions = routedSharesContribution + routedTBContribution + routedCommContribution +
      routedBondContributions.reduce((s, c) => s + c, 0) +
      routedOtherAssetContributions.reduce((s, c) => s + c, 0)
    // Note: routedCashContribution is NOT subtracted — it stays in cashflow and
    // gets added to cashBuffer after the surplus/deficit path

    // ── Sale proceeds routing — direct to chosen investment vehicle ────────
    // Proceeds are already in totalIncomePreBond; subtract directed amounts so
    // they bypass the surplus waterfall and land in the target asset instead.
    let saleProceedsSharesContribution = 0
    let saleProceedsTBContribution = 0
    let saleProceedsCommContribution = 0
    let saleProceedsCashContribution = 0
    const saleProceedsBondContributions = currentBonds.map(() => 0)
    const saleProceedsOtherAssetContributions = currentOtherAssets.map(() => 0)
    let saleProceedsOffsetContribution = 0
    // saleProceedsOffsetContribution tracks display only — offset proceeds go to cash

    for (let i = 0; i < propertyResults.length; i++) {
      const proceeds = propertyResults[i].saleProceeds || 0
      if (proceeds <= 0) continue
      const dest = currentProperties[i].saleEvent?.destination || 'cash'
      if (dest === 'shares') {
        saleProceedsSharesContribution += proceeds
      } else if (dest === 'treasuryBonds') {
        saleProceedsTBContribution += proceeds
      } else if (dest === 'commodities') {
        saleProceedsCommContribution += proceeds
      } else if (dest === 'bonds') {
        if (currentBonds.length > 0) {
          const perBond = proceeds / currentBonds.length
          for (let j = 0; j < currentBonds.length; j++) saleProceedsBondContributions[j] += perBond
        } else {
          saleProceedsCashContribution += proceeds
        }
      } else if (dest === 'otherAssets') {
        if (currentOtherAssets.length > 0) {
          const perAsset = proceeds / currentOtherAssets.length
          for (let j = 0; j < currentOtherAssets.length; j++) saleProceedsOtherAssetContributions[j] += perAsset
        } else {
          saleProceedsCashContribution += proceeds
        }
      } else if (dest === 'offset' || (dest && dest.startsWith('offset:'))) {
        // Offset IS cash — sale proceeds to offset just go to cash buffer
        // Cash automatically offsets mortgage interest at start of each year
        saleProceedsCashContribution += proceeds
        saleProceedsOffsetContribution += proceeds  // track for display
      } else {
        // 'cash' or 'super' (super handled via downsizer) — stays in general cashflow
        saleProceedsCashContribution += proceeds
      }
    }
    const totalDirectedSaleProceeds = saleProceedsSharesContribution + saleProceedsTBContribution +
      saleProceedsCommContribution + saleProceedsOffsetContribution + saleProceedsCashContribution +
      saleProceedsBondContributions.reduce((s, c) => s + c, 0) +
      saleProceedsOtherAssetContributions.reduce((s, c) => s + c, 0)

    // Routed contributions are mandatory outflows (income already in totalIncomePreBond,
    // routing removes it from general cashflow and directs it to the target vehicle)
    const prelimNetCashflow = totalIncomePreBond - totalOutflows - totalRoutedContributions - totalDirectedSaleProceeds

    // Route surplus / fill deficit
    let surplus = 0
    let surplusToOffset = 0
    let sharesAdjustment = 0
    let surplusSharesContribution = 0
    let tbAdjustment = 0
    let surplusTBContribution = 0
    let commAdjustment = 0
    let surplusCommContribution = 0
    let cashDrawdown = 0
    let superAExtra = 0
    let superBExtra = 0
    const bondDrawdowns = currentBonds.map(() => 0)
    const surplusBondContributions = currentBonds.map(() => 0)
    const otherAssetDrawdowns = currentOtherAssets.map(() => 0)
    const surplusOtherAssetContributions = currentOtherAssets.map(() => 0)

    // Track mortgage payoff events this year
    const mortgagePayoffs = []

    if (prelimNetCashflow >= 0) {
      surplus = prelimNetCashflow

      // Route surplus through priority order (waterfall)
      // Auto-add surplus-mode assets that aren't already in the routing order
      // (matches UI auto-add logic so engine stays in sync even if order was saved before asset was set to surplus mode)
      let effectiveRoutingOrder = [...(surplusRoutingOrder || ['offset', 'shares', 'cash'])]
      const hasSurplusBonds = bondTargetContributions.some(b => b.mode === BOND_CONTRIBUTION_MODES.SURPLUS)
      const hasSurplusOtherAssets = otherAssetTargetContributions.some(a => a.mode === BOND_CONTRIBUTION_MODES.SURPLUS)
      const hasSurplusShares = sharesMode === BOND_CONTRIBUTION_MODES.SURPLUS
      const hasSurplusTB = tbMode === BOND_CONTRIBUTION_MODES.SURPLUS
      const hasSurplusComm = commMode === BOND_CONTRIBUTION_MODES.SURPLUS
      if (hasSurplusShares && !effectiveRoutingOrder.includes(SURPLUS_DESTINATIONS.SHARES)) {
        const cashIdx = effectiveRoutingOrder.indexOf(SURPLUS_DESTINATIONS.CASH)
        effectiveRoutingOrder.splice(cashIdx >= 0 ? cashIdx : effectiveRoutingOrder.length, 0, SURPLUS_DESTINATIONS.SHARES)
      }
      if (hasSurplusTB && !effectiveRoutingOrder.includes(SURPLUS_DESTINATIONS.TREASURY_BONDS)) {
        const cashIdx = effectiveRoutingOrder.indexOf(SURPLUS_DESTINATIONS.CASH)
        effectiveRoutingOrder.splice(cashIdx >= 0 ? cashIdx : effectiveRoutingOrder.length, 0, SURPLUS_DESTINATIONS.TREASURY_BONDS)
      }
      if (hasSurplusComm && !effectiveRoutingOrder.includes(SURPLUS_DESTINATIONS.COMMODITIES)) {
        const cashIdx = effectiveRoutingOrder.indexOf(SURPLUS_DESTINATIONS.CASH)
        effectiveRoutingOrder.splice(cashIdx >= 0 ? cashIdx : effectiveRoutingOrder.length, 0, SURPLUS_DESTINATIONS.COMMODITIES)
      }
      if (hasSurplusBonds && !effectiveRoutingOrder.includes(SURPLUS_DESTINATIONS.BONDS)) {
        const cashIdx = effectiveRoutingOrder.indexOf(SURPLUS_DESTINATIONS.CASH)
        effectiveRoutingOrder.splice(cashIdx >= 0 ? cashIdx : effectiveRoutingOrder.length, 0, SURPLUS_DESTINATIONS.BONDS)
      }
      if (hasSurplusOtherAssets && !effectiveRoutingOrder.includes(SURPLUS_DESTINATIONS.OTHER_ASSETS)) {
        const cashIdx = effectiveRoutingOrder.indexOf(SURPLUS_DESTINATIONS.CASH)
        effectiveRoutingOrder.splice(cashIdx >= 0 ? cashIdx : effectiveRoutingOrder.length, 0, SURPLUS_DESTINATIONS.OTHER_ASSETS)
      }

      let remaining = surplus
      for (const dest of effectiveRoutingOrder) {
        if (remaining <= 0) break
        if (dest === SURPLUS_DESTINATIONS.OFFSET) {
          // Offset IS cash — routing to offset means routing to cash buffer
          // Only absorb up to the total mortgage headroom (cash beyond mortgage doesn't help offset)
          const totalMortgageHeadroom = currentProperties.reduce((sum, p, i) => {
            if (!p.hasOffset || p.mortgageBalance <= 0) return sum
            return sum + Math.max(0, p.mortgageBalance - cashBuffer)
          }, 0)
          const toOffset = Math.min(remaining, Math.max(0, totalMortgageHeadroom))
          if (toOffset > 0) {
            cashBuffer += toOffset
            surplusToOffset += toOffset
            remaining -= toOffset
          }
        } else if (dest === SURPLUS_DESTINATIONS.SHARES) {
          // Allocate surplus to shares when in surplus mode, up to target
          if (sharesMode === BOND_CONTRIBUTION_MODES.SURPLUS && sharesTarget > 0) {
            const allocated = Math.min(remaining, sharesTarget)
            surplusSharesContribution = allocated
            remaining -= allocated
          }
          // If no target set (annualContribution=0), shares don't absorb surplus —
          // remaining flows to the next destination in the waterfall
        } else if (dest === SURPLUS_DESTINATIONS.TREASURY_BONDS) {
          if (tbMode === BOND_CONTRIBUTION_MODES.SURPLUS && tbTarget > 0) {
            const allocated = Math.min(remaining, tbTarget)
            surplusTBContribution = allocated
            remaining -= allocated
          }
        } else if (dest === SURPLUS_DESTINATIONS.COMMODITIES) {
          if (commMode === BOND_CONTRIBUTION_MODES.SURPLUS && commTarget > 0) {
            const allocated = Math.min(remaining, commTarget)
            surplusCommContribution = allocated
            remaining -= allocated
          }
        } else if (dest === SURPLUS_DESTINATIONS.BONDS) {
          // Allocate surplus to surplus-mode bonds (capped at 125% of prior year)
          for (let i = 0; i < currentBonds.length; i++) {
            if (remaining <= 0) break
            if (bondTargetContributions[i].mode !== BOND_CONTRIBUTION_MODES.SURPLUS) continue
            const target = bondTargetContributions[i].target
            const prior = currentBonds[i].priorYearContribution || 0
            const max125 = prior > 0 ? prior * INVESTMENT_BOND_125_PCT_RULE : Infinity
            const capped = Math.min(target, max125)
            const allocated = Math.min(remaining, capped)
            surplusBondContributions[i] = allocated
            remaining -= allocated
          }
        } else if (dest === SURPLUS_DESTINATIONS.OTHER_ASSETS) {
          // Allocate surplus to surplus-mode other assets
          for (let i = 0; i < currentOtherAssets.length; i++) {
            if (remaining <= 0) break
            if (otherAssetTargetContributions[i].mode !== BOND_CONTRIBUTION_MODES.SURPLUS) continue
            const target = otherAssetTargetContributions[i].target
            const allocated = Math.min(remaining, target)
            surplusOtherAssetContributions[i] = allocated
            remaining -= allocated
          }
        } else if (dest === SURPLUS_DESTINATIONS.CASH) {
          cashBuffer += remaining
          remaining = 0
        }
      }
      // Anything left after waterfall goes to cash
      if (remaining > 0) {
        cashBuffer += remaining
      }

      // Mortgage payoff: check if any property with payOffWhenAble can be paid off
      // from available liquid assets (cash + shares)
      for (let i = 0; i < currentProperties.length; i++) {
        const p = currentProperties[i]
        if (!p.payOffWhenAble || p.mortgageBalance <= 0) continue
        const netMortgage = Math.max(0, propertyResults[i].mortgageBalance - (propertyResults[i].offsetBalance || 0))
        if (netMortgage <= 0) continue
        const availableLiquidity = cashBuffer + Math.max(0, sharesResult.closingValue + sharesAdjustment + surplusSharesContribution + fixedSharesContribution + saleProceedsSharesContribution) + Math.max(0, tbResult.closingValue + tbAdjustment + saleProceedsTBContribution) + Math.max(0, commResult.closingValue + commAdjustment + saleProceedsCommContribution)
        if (availableLiquidity >= netMortgage) {
          let toPay = netMortgage
          const fromCashPay = Math.min(toPay, Math.max(0, cashBuffer))
          cashBuffer -= fromCashPay
          toPay -= fromCashPay
          if (toPay > 0) {
            sharesAdjustment -= toPay
          }
          propertyResults[i] = {
            ...propertyResults[i],
            mortgageBalance: 0,
            offsetBalance: 0,
            annualRepayment: 0,
          }
          mortgagePayoffs.push({ propertyIndex: i, amount: netMortgage, year })
        }
      }
    } else {
      let remaining = Math.abs(prelimNetCashflow)

      // Drawdown waterfall — configurable priority order
      const effectiveDrawdownOrder = drawdownOrderInput || DEFAULT_DRAWDOWN_ORDER
      for (const source of effectiveDrawdownOrder) {
        if (remaining <= 0) break

        if (source === DRAWDOWN_SOURCES.CASH) {
          const fromCash = Math.min(remaining, Math.max(0, cashBuffer))
          cashBuffer -= fromCash
          remaining -= fromCash
          cashDrawdown += fromCash

        } else if (source === DRAWDOWN_SOURCES.SHARES) {
          if (!currentShares.preserveCapital) {
            const fromShares = Math.min(remaining, sharesResult.closingValue + Math.max(0, sharesAdjustment))
            sharesAdjustment -= fromShares
            remaining -= fromShares
          }

        } else if (source === DRAWDOWN_SOURCES.TREASURY_BONDS) {
          if (!currentTreasuryBonds.preserveCapital) {
            const fromTB = Math.min(remaining, tbResult.closingValue + Math.max(0, tbAdjustment))
            tbAdjustment -= fromTB
            remaining -= fromTB
          }

        } else if (source === DRAWDOWN_SOURCES.COMMODITIES) {
          const fromComm = Math.min(remaining, commResult.closingValue + Math.max(0, commAdjustment))
          commAdjustment -= fromComm
          remaining -= fromComm

        } else if (source === DRAWDOWN_SOURCES.BONDS) {
          // Tax-free bonds first, then pre-10yr bonds
          for (let i = 0; i < currentBonds.length && remaining > 0; i++) {
            if (bondGrowthResults[i].isTaxFree) {
              const available = bondGrowthResults[i].closingBalance
              const draw = Math.min(remaining, available)
              bondDrawdowns[i] = draw
              remaining -= draw
            }
          }
          for (let i = 0; i < currentBonds.length && remaining > 0; i++) {
            if (!bondGrowthResults[i].isTaxFree) {
              const available = bondGrowthResults[i].closingBalance
              const draw = Math.min(remaining, available)
              bondDrawdowns[i] = draw
              remaining -= draw
            }
          }

        } else if (source === DRAWDOWN_SOURCES.OTHER_ASSETS) {
          for (let i = 0; i < currentOtherAssets.length && remaining > 0; i++) {
            if (currentOtherAssets[i].canDrawdown) {
              const available = otherAssetGrowthResults[i].closingValue
              const draw = Math.min(remaining, available)
              otherAssetDrawdowns[i] = draw
              remaining -= draw
            }
          }

        } else if (source === DRAWDOWN_SOURCES.SUPER) {
          if (remaining > 0 && superA_result.inPensionPhase) {
            superAExtra = Math.min(remaining, superA_result.closingBalance)
            remaining -= superAExtra
          }
          if (remaining > 0 && superB_result.inPensionPhase) {
            superBExtra = Math.min(remaining, superB_result.closingBalance)
            remaining -= superBExtra
          }
        }
      }
    }

    // ── Final results with resolved contributions + drawdowns ──

    // Apply routed cash contributions
    if (routedCashContribution > 0) {
      cashBuffer += routedCashContribution
    }

    // Apply sale proceeds — cash buffer
    if (saleProceedsCashContribution > 0) {
      cashBuffer += saleProceedsCashContribution
    }

    // Offset proceeds already routed to cash above (offset IS cash)



    // Shares: total contribution = fixed + surplus + routed income + sale proceeds
    const finalSharesContribution = fixedSharesContribution + surplusSharesContribution + routedSharesContribution + saleProceedsSharesContribution
    const sharesNetAdjustment = finalSharesContribution + sharesAdjustment

    // Treasury bonds: total contribution = fixed + surplus + routed income + sale proceeds
    const finalTBContribution = fixedTBContribution + surplusTBContribution + routedTBContribution + saleProceedsTBContribution
    const tbNetAdjustment = finalTBContribution + tbAdjustment

    // Commodities: total contribution = fixed + surplus + routed income + sale proceeds
    const finalCommContribution = fixedCommContribution + surplusCommContribution + routedCommContribution + saleProceedsCommContribution
    const commNetAdjustment = finalCommContribution + commAdjustment

    // Bonds: total contribution = fixed + surplus + routed income + sale proceeds
    const finalBondContributions = currentBonds.map((_, i) =>
      fixedBondContributions[i] + surplusBondContributions[i] + routedBondContributions[i] + saleProceedsBondContributions[i]
    )
    const bondResults = currentBonds.map((bond, i) =>
      processBondYear({ bond, year, drawdownNeeded: bondDrawdowns[i], resolvedContribution: finalBondContributions[i], assumptions: yearAssumptions })
    )
    const totalBondContributions = finalBondContributions.reduce((sum, c) => sum + c, 0)
    const totalSurplusBondContributions = surplusBondContributions.reduce((sum, c) => sum + c, 0)

    // Other assets: total contribution = fixed + surplus + routed income + sale proceeds
    const finalOtherAssetContributions = currentOtherAssets.map((_, i) =>
      fixedOtherAssetContributions[i] + surplusOtherAssetContributions[i] + routedOtherAssetContributions[i] + saleProceedsOtherAssetContributions[i]
    )
    const otherAssetResults = currentOtherAssets.map((asset, i) =>
      processOtherAssetYear({ asset, year, drawdownNeeded: otherAssetDrawdowns[i], resolvedContribution: finalOtherAssetContributions[i] })
    )
    const totalOtherAssetContributions = finalOtherAssetContributions.reduce((sum, c) => sum + c, 0)

    // Aggregate contributions for snapshot
    const totalInvestmentContributions = finalSharesContribution + finalTBContribution + finalCommContribution + totalBondContributions + totalOtherAssetContributions

    const totalBondWithdrawals = bondResults.reduce((sum, r) => sum + r.withdrawal, 0)
    const totalOtherAssetWithdrawals = otherAssetResults.reduce((sum, r) => sum + r.withdrawal, 0)
    const sharesDrawdown = Math.max(0, -sharesAdjustment)
    const tbDrawdown = Math.max(0, -tbAdjustment)
    const commDrawdown = Math.max(0, -commAdjustment)
    const totalIncome = totalIncomePreBond + totalBondWithdrawals + totalOtherAssetWithdrawals + sharesDrawdown + tbDrawdown + commDrawdown + cashDrawdown + superAExtra + superBExtra
    const netCashflow = totalIncome - totalOutflows - totalDirectedSaleProceeds - totalRoutedContributions
    // Tolerance: sub-$100 rounding errors from floating point are not real deficits
    const isDeficit = netCashflow < -100

    // Track cumulative deficit — the simulation continues but flags the shortfall
    if (isDeficit) {
      const shortfall = Math.abs(netCashflow)
      cumulativeDeficit += shortfall
      if (!firstDeficitYear) firstDeficitYear = year
      // Allow cashBuffer to go negative to represent unfunded shortfall
      cashBuffer -= shortfall
    }

    // ── Step 11: Sale events ──────────────────────────────────────────────
    // CGT already calculated in property results above

    // ── Step 12: Update balances ──────────────────────────────────────────
    // Downsizer contributions added directly to super (tax-free, outside caps)
    superA = { ...superA, currentBalance: Math.max(0, superA_result.closingBalance - superAExtra + downsizerA.amount) }
    superB = { ...superB, currentBalance: Math.max(0, superB_result.closingBalance - superBExtra + downsizerB.amount) }
    // Apply shares growth + resolved contributions + deficit drawdowns
    const newSharesValue = Math.max(0, sharesResult.closingValue + sharesNetAdjustment)
    currentShares = {
      ...currentShares,
      currentValue: newSharesValue,
      priorYearContribution: finalSharesContribution,
      holdings: currentShares.holdings?.length > 0
        ? distributeProportionally(currentShares.holdings, newSharesValue).map((v, i) => ({ ...currentShares.holdings[i], currentValue: Math.max(0, v) }))
        : currentShares.holdings,
    }
    // Treasury bonds
    const newTBValue = Math.max(0, tbResult.closingValue + tbNetAdjustment)
    currentTreasuryBonds = {
      ...currentTreasuryBonds,
      currentValue: newTBValue,
      priorYearContribution: finalTBContribution,
      holdings: currentTreasuryBonds.holdings?.length > 0
        ? distributeProportionally(currentTreasuryBonds.holdings, newTBValue).map((v, i) => ({ ...currentTreasuryBonds.holdings[i], currentValue: Math.max(0, v) }))
        : currentTreasuryBonds.holdings,
    }
    // Commodities
    const newCommValue = Math.max(0, commResult.closingValue + commNetAdjustment)
    currentCommodities = {
      ...currentCommodities,
      currentValue: newCommValue,
      priorYearContribution: finalCommContribution,
      holdings: currentCommodities.holdings?.length > 0
        ? distributeProportionally(currentCommodities.holdings, newCommValue).map((v, i) => ({ ...currentCommodities.holdings[i], currentValue: Math.max(0, v) }))
        : currentCommodities.holdings,
    }
    currentBonds = currentBonds.map((bond, i) => ({
      ...bond,
      currentBalance: bondResults[i].closingBalance,
      // Track actual contribution for 125% rule and annual increase ratchet
      priorYearContribution: bondResults[i].effectiveContribution,
    }))
    currentOtherAssets = currentOtherAssets.map((asset, i) => ({
      ...asset,
      currentValue: otherAssetResults[i].closingValue,
      priorYearContribution: otherAssetResults[i].effectiveContribution,  // Track actual for annual increase ratchet
    }))
    currentProperties = currentProperties.map((p, i) => ({
      ...p,
      currentValue: propertyResults[i].closingValue,
      mortgageBalance: propertyResults[i].mortgageBalance,
      loanTermYearsRemaining: propertyResults[i].loanTermYearsRemaining || p.loanTermYearsRemaining || 0,
    }))
    currentDebts = currentDebts.map((d, i) => ({
      ...d,
      currentBalance: debtResult.results[i].closingBalance,
    }))

    // Liquidity classification
    const propertyEquity = propertyResults.reduce((sum, r) => sum + r.equity, 0)
    const totalPropertyValue = propertyResults.reduce((sum, r) => sum + r.closingValue, 0)
    const totalMortgageBalance = propertyResults.reduce((sum, r) => sum + (r.mortgageBalance || 0), 0)
    const bondLiquidity = bondResults.reduce((sum, r, i) => {
      return sum + (r.isTaxFree ? currentBonds[i].currentBalance : 0)
    }, 0)
    const bondPreTenYr = bondResults.reduce((sum, r, i) => {
      return sum + (!r.isTaxFree ? currentBonds[i].currentBalance : 0)
    }, 0)

    const totalOtherAssetsValue = currentOtherAssets.reduce((sum, a) => sum + a.currentValue, 0)
    const totalOtherAssetsDrawdownable = currentOtherAssets.filter(a => a.canDrawdown).reduce((sum, a) => sum + a.currentValue, 0)
    const totalOtherAssetsLocked = totalOtherAssetsValue - totalOtherAssetsDrawdownable

    const totalLiquidAssets =
      cashBuffer +
      currentShares.currentValue +
      currentTreasuryBonds.currentValue +
      currentCommodities.currentValue +
      bondLiquidity +
      totalOtherAssetsDrawdownable +
      (superA_result.inPensionPhase ? superA.currentBalance : 0) +
      (superB_result.inPensionPhase ? superB.currentBalance : 0)

    const totalNetWorth =
      totalLiquidAssets +
      bondPreTenYr +
      totalOtherAssetsLocked +
      propertyEquity +
      (superA_result.isLocked ? superA.currentBalance : 0) +
      (superB_result.isLocked ? superB.currentBalance : 0) -
      totalDebtBalance

    // Collect warnings
    const warnings = [
      ...superContribA_pre.warnings,
      ...superContribB_pre.warnings,
      ...bondResults.flatMap(r => r.warnings),
      ...(isDeficit ? [`Deficit year: $${Math.round(Math.abs(netCashflow)).toLocaleString()} shortfall`] : []),
      ...mortgagePayoffs.map(mp => `Mortgage paid off ($${Math.round(mp.amount).toLocaleString()} from liquid assets)`),
      ...(downsizerA.amount > 0 ? [`Downsizer contribution (A): $${Math.round(downsizerA.amount).toLocaleString()} into super`] : []),
      ...(downsizerB.amount > 0 ? [`Downsizer contribution (B): $${Math.round(downsizerB.amount).toLocaleString()} into super`] : []),
      ...(agePensionPrelim.totalPension > 0 ? [`Age Pension: $${Math.round(agePensionPrelim.totalPension).toLocaleString()}/yr`] : []),
      ...(leaseResidualA > 0 ? [`Lease residual (A): $${Math.round(leaseResidualA).toLocaleString()} balloon payment (post-tax)`] : []),
      ...(leaseResidualB > 0 ? [`Lease residual (B): $${Math.round(leaseResidualB).toLocaleString()} balloon payment (post-tax)`] : []),
    ]

    yearSnapshots.push({
      year,
      ageA,
      ageB,
      retiredA,
      retiredB,
      // Income
      salaryA,
      salaryB,
      totalIncome,
      // Tax
      taxA: taxAFinal,
      taxB: taxBFinal,
      div293TaxA,
      div293TaxB,
      totalDiv293Tax,
      // Super
      superA: superA_result,
      superB: superB_result,
      employerContribA: superContribA_pre.employerContrib,
      employerContribB: superContribB_pre.employerContrib,
      superABalance: superA.currentBalance,
      superBBalance: superB.currentBalance,
      // Property
      propertyResults,
      propertyEquity,
      totalPropertyValue,
      totalMortgageBalance,
      totalLandTax,
      totalSellingCosts,
      totalPurchaseCashOutflow,
      // Shares
      sharesValue: currentShares.currentValue,
      sharesResult,
      sharesContribution: finalSharesContribution,
      sharesDrawdown,
      // Treasury bonds
      treasuryBondsValue: currentTreasuryBonds.currentValue,
      tbResult,
      tbContribution: finalTBContribution,
      tbDrawdown,
      // Commodities
      commoditiesValue: currentCommodities.currentValue,
      commResult,
      commContribution: finalCommContribution,
      commDrawdown,
      cashDrawdown,
      superAExtra,
      superBExtra,
      // Bonds
      bondResults,
      bondLiquidity,
      bondPreTenYr,
      totalBondContributions,
      totalSurplusBondContributions,
      // Other assets
      otherAssetResults,
      totalOtherAssetsValue,
      totalOtherAssetContributions,
      // Investment contributions (all non-property assets)
      totalInvestmentContributions,
      // Novated lease
      leaseReductionA,
      leaseReductionB,
      leasePostTaxA: leasePostTaxA || 0,
      leasePostTaxB: leasePostTaxB || 0,
      leaseResidualA: leaseResidualA || 0,
      leaseResidualB: leaseResidualB || 0,
      totalLeasePostTaxCost,
      // Other income
      otherIncomeResult,
      totalOtherIncome: otherIncomeResult.total,
      // Debts
      debtResult,
      totalDebtBalance,
      totalDebtRepayments,
      // Expenses
      expenseTree,
      totalExpenses,
      // Cashflow
      totalOutflows,
      totalDirectedSaleProceeds,
      totalRoutedContributions,
      surplusToOffset,
      saleProceedsCashContribution,
      saleProceedsOffsetContribution,
      netCashflow,
      isDeficit,
      surplus,
      cashBuffer,
      // Net worth
      totalLiquidAssets,
      totalNetWorth,
      // Warnings
      warnings,
      // Markers for Gap dashboard
      superAUnlocked: ageA != null && ageA >= 60 && !superA_result.isLocked,
      superBUnlocked: ageB != null && ageB >= 60 && !superB_result.isLocked,
      // Age Pension
      agePension: agePensionPrelim,
      // Downsizer contributions
      downsizerA: downsizerA.amount,
      downsizerB: downsizerB.amount,
      totalDownsizer,
      // Deficit tracking
      cumulativeDeficit,
      firstDeficitYear,
      // Mortgage payoff events
      mortgagePayoffs,
    })
  }

  // Summary flags for UI warnings
  const deficitYears = yearSnapshots.filter(s => s.isDeficit).map(s => s.year)
  yearSnapshots.deficitYears = deficitYears
  yearSnapshots.firstDeficitYear = firstDeficitYear
  yearSnapshots.cumulativeDeficit = cumulativeDeficit

  return yearSnapshots
}

/**
 * Retirement date solver — finds the earliest year where the plan is sustainable.
 * Iterates over candidate retirement ages for personA.
 *
 * @param {object} scenario
 * @returns {{ retirementYear: number | null, retirementAge: number | null }}
 */
export function solveRetirementDate(scenario) {
  const personA = scenario.household.personA
  const birthYear = personA.dateOfBirth ? new Date(personA.dateOfBirth).getFullYear() : null
  if (!birthYear) return { retirementYear: null, retirementAge: null }

  for (let age = 40; age <= 70; age++) {
    const testScenario = {
      ...scenario,
      household: {
        ...scenario.household,
        personA: { ...personA, retirementAge: age },
      },
    }
    const snapshots = runSimulation(testScenario)

    // Check if any year goes to negative net worth — if not, this age is viable
    const hasCriticalDeficit = snapshots.some(s => s.totalLiquidAssets < 0)
    if (!hasCriticalDeficit) {
      return { retirementYear: birthYear + age, retirementAge: age }
    }
  }

  return { retirementYear: null, retirementAge: null }
}
