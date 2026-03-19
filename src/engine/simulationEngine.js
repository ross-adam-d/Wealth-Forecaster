/**
 * Simulation Engine — Orchestrator
 *
 * Runs year-by-year from current year to simulation end age.
 * Follows the exact 12-step calculation order from the spec (Section 5).
 * Returns an array of year snapshots for chart and table rendering.
 */

import { resolvePackagingReductions, calcPersonTax, calcFrankingCredit } from './taxEngine.js'
import { calcECM, calcStatutory } from '../modules/fbt.js'
import { processContributions, growSuperBalance, hasReachedPreservationAge } from '../modules/super.js'
import { processPropertyYear } from '../modules/property.js'
import { processSharesYear } from '../modules/shares.js'
import { processBondYear } from '../modules/investmentBonds.js'
import { resolveExpenseTree } from '../modules/expenses.js'
import { SURPLUS_DESTINATIONS } from '../constants/index.js'

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
function resolveNovatedLeaseReduction(person) {
  const lease = person.packaging?.novatedLease
  if (!lease) return { reduction: 0, fbtResult: null }

  const params = {
    vehicleCostPrice: lease.vehicleCostPrice,
    annualRunningCosts: lease.annualRunningCosts,
    annualKmTotal: lease.annualKmTotal,
    annualKmBusiness: lease.annualKmBusiness,
    employeePostTaxContrib: lease.employeePostTaxContribution,
    isEV: lease.isEV,
  }

  const fbtResult = lease.method === 'ecm'
    ? calcECM(params)
    : calcStatutory(params)

  return { reduction: fbtResult.pretaxPackageReduction, fbtResult }
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
    investmentBonds,
    expenses,
    assumptions,
    simulationEndAge,
    surplusRoutingOrder,
  } = scenario

  const currentYear = new Date().getFullYear()
  const personA = household.personA
  const personB = household.personB

  // Determine simulation end year
  const olderBirthYear = Math.min(
    personA.dateOfBirth ? new Date(personA.dateOfBirth).getFullYear() : currentYear,
    personB.dateOfBirth ? new Date(personB.dateOfBirth).getFullYear() : currentYear,
  )
  const simEndYear = olderBirthYear + simulationEndAge

  // Mutable state
  let superA = { ...superAccounts.find(s => s.personLabel === 'A'), currentBalance: superAccounts.find(s => s.personLabel === 'A')?.currentBalance || 0 }
  let superB = { ...superAccounts.find(s => s.personLabel === 'B'), currentBalance: superAccounts.find(s => s.personLabel === 'B')?.currentBalance || 0 }
  let currentShares = { ...shares }
  let currentBonds = investmentBonds.map(b => ({ ...b }))
  let currentProperties = properties.map(p => ({ ...p }))
  let cashBuffer = 0

  const yearSnapshots = []

  for (let year = currentYear; year <= simEndYear; year++) {
    const yearsElapsed = year - currentYear
    const ageA = getAge(personA.dateOfBirth, year)
    const ageB = getAge(personB.dateOfBirth, year)
    const retiredA = hasRetired(personA, year)
    const retiredB = hasRetired(personB, year)

    // ── Step 1: Resolve salaries ──────────────────────────────────────────
    const salaryA = retiredA ? 0 : growSalary(personA.currentSalary, personA.wageGrowthRate || assumptions.wageGrowthRate, yearsElapsed)
    const salaryB = retiredB ? 0 : growSalary(personB.currentSalary, personB.wageGrowthRate || assumptions.wageGrowthRate, yearsElapsed)

    const { packagingReduction: packReductionA, packagingSummary: packSummaryA } = resolvePackagingReductions(personA, salaryA)
    const { packagingReduction: packReductionB, packagingSummary: packSummaryB } = resolvePackagingReductions(personB, salaryB)
    const { reduction: leaseReductionA, fbtResult: fbtA } = resolveNovatedLeaseReduction(personA)
    const { reduction: leaseReductionB, fbtResult: fbtB } = resolveNovatedLeaseReduction(personB)

    // ── Step 2: Income tax ────────────────────────────────────────────────
    const superContribA_pre = processContributions(superA, salaryA, year)
    const superContribB_pre = processContributions(superB, salaryB, year)

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
      assumptions,
    })

    const superB_result = growSuperBalance({
      openingBalance: superB.currentBalance,
      contributions: superContribB_pre.totalNetToFund,
      superProfile: superB,
      year,
      personAge: ageB || 0,
      retirementYear: personB.dateOfBirth ? new Date(personB.dateOfBirth).getFullYear() + personB.retirementAge : null,
      assumptions,
    })

    // ── Step 6: Property ──────────────────────────────────────────────────
    const propertyResults = currentProperties.map(p => processPropertyYear(p, year))
    const totalNetRentalIncomeLoss = propertyResults.reduce((sum, r) => sum + r.netRentalIncomeLoss, 0)
    const totalMortgageRepayments = propertyResults.reduce((sum, r) => sum + r.annualRepayment, 0)
    const propertySaleProceeds = propertyResults.reduce((sum, r) => sum + (r.saleProceeds || 0), 0)
    const propertyCGT = propertyResults.reduce((sum, r) => sum + (r.cgtAmount || 0), 0)

    // ── Step 7: Shares ────────────────────────────────────────────────────
    const sharesResult = processSharesYear({
      shares: currentShares,
      year,
      personAge: Math.max(ageA || 0, ageB || 0),
      drawdownNeeded: 0, // resolved after net cashflow calc
      surplusToAdd: 0,
      assumptions,
    })

    // Recalculate tax with dividends + property
    const taxAFinal = calcPersonTax({
      grossSalary: salaryA,
      salarySacrifice: superContribA_pre.salarySacrificeAmount,
      packagingReduction: packReductionA,
      novatedLeaseReduction: leaseReductionA,
      rentalIncomeLoss: totalNetRentalIncomeLoss,
      dividendIncome: sharesResult.cashDividend * 0.5, // split between partners
      frankingCredit: sharesResult.frankingCredit * 0.5,
      capitalGain: propertyCGT,
      inPensionPhase: ageA != null && hasReachedPreservationAge(ageA) && retiredA,
    })

    // ── Step 8: Investment bonds — growth phase only (drawdown resolved after cashflow) ──
    const bondGrowthResults = currentBonds.map(bond =>
      processBondYear({ bond, year, drawdownNeeded: 0, assumptions })
    )

    // ── Step 9: Expenses ──────────────────────────────────────────────────
    const expenseTree = resolveExpenseTree(
      expenses,
      year,
      currentYear,
      assumptions.inflationRate,
      leverAdjustments.expenses || {},
    )
    const totalExpenses = expenseTree.total

    // ── Step 10: Net cashflow ─────────────────────────────────────────────
    // Compute preliminary income without bond withdrawals (bonds are discretionary drawdown)
    const totalIncomePreBond =
      taxAFinal.netTakeHome +
      taxB.netTakeHome +
      (totalNetRentalIncomeLoss > 0 ? totalNetRentalIncomeLoss : 0) +
      sharesResult.cashDividend +
      taxAFinal.frankingRefund +
      superA_result.drawdown +
      superB_result.drawdown +
      propertySaleProceeds

    // Salary sacrifice is already excluded from netTakeHome — do not add to outflows again
    const totalOutflows =
      totalExpenses +
      totalMortgageRepayments

    const prelimNetCashflow = totalIncomePreBond - totalOutflows

    // Route surplus / fill deficit — waterfall: cash → shares → bonds (tax-free first)
    let surplus = 0
    let sharesAdjustment = 0
    const bondDrawdowns = currentBonds.map(() => 0)

    if (prelimNetCashflow >= 0) {
      surplus = prelimNetCashflow
      if (surplusRoutingOrder[0] === SURPLUS_DESTINATIONS.SHARES) {
        sharesAdjustment = surplus
      } else {
        cashBuffer += surplus
      }
    } else {
      let remaining = Math.abs(prelimNetCashflow)

      // 1. Cash buffer
      const fromCash = Math.min(remaining, cashBuffer)
      cashBuffer -= fromCash
      remaining -= fromCash

      // 2. Shares (if not preserve-capital)
      if (remaining > 0 && !currentShares.preserveCapital) {
        const fromShares = Math.min(remaining, sharesResult.closingValue)
        sharesAdjustment = -fromShares
        remaining -= fromShares
      }

      // 3. Bonds — tax-free bonds first, then pre-10yr bonds
      if (remaining > 0) {
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
      }
    }

    // Final bond results with actual drawdowns applied
    const bondResults = currentBonds.map((bond, i) =>
      processBondYear({ bond, year, drawdownNeeded: bondDrawdowns[i], assumptions })
    )

    const totalBondWithdrawals = bondResults.reduce((sum, r) => sum + r.withdrawal, 0)
    const totalIncome = totalIncomePreBond + totalBondWithdrawals
    const netCashflow = totalIncome - totalOutflows
    const isDeficit = netCashflow < 0

    // ── Step 11: Sale events ──────────────────────────────────────────────
    // CGT already calculated in property results above

    // ── Step 12: Update balances ──────────────────────────────────────────
    superA = { ...superA, currentBalance: superA_result.closingBalance }
    superB = { ...superB, currentBalance: superB_result.closingBalance }
    // Apply shares growth (closingValue) plus any surplus routed to shares or deficit drawn from shares
    currentShares = { ...currentShares, currentValue: Math.max(0, sharesResult.closingValue + sharesAdjustment) }
    currentBonds = currentBonds.map((bond, i) => ({
      ...bond,
      currentBalance: bondResults[i].closingBalance,
      priorYearContribution: bond.annualContribution,
    }))
    currentProperties = currentProperties.map((p, i) => ({
      ...p,
      currentValue: propertyResults[i].closingValue,
      mortgageBalance: propertyResults[i].mortgageBalance,
      offsetBalance: propertyResults[i].offsetBalance,
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

    const totalLiquidAssets =
      cashBuffer +
      currentShares.currentValue +
      bondLiquidity +
      (superA_result.inPensionPhase ? superA.currentBalance : 0) +
      (superB_result.inPensionPhase ? superB.currentBalance : 0)

    const totalNetWorth =
      totalLiquidAssets +
      bondPreTenYr +
      propertyEquity +
      (superA_result.isLocked ? superA.currentBalance : 0) +
      (superB_result.isLocked ? superB.currentBalance : 0)

    // Collect warnings
    const warnings = [
      ...superContribA_pre.warnings,
      ...superContribB_pre.warnings,
      ...bondResults.flatMap(r => r.warnings),
      ...(isDeficit ? [`Deficit year: $${Math.round(Math.abs(netCashflow)).toLocaleString()} shortfall`] : []),
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
      taxB,
      // Super
      superA: superA_result,
      superB: superB_result,
      superABalance: superA.currentBalance,
      superBBalance: superB.currentBalance,
      // Property
      propertyResults,
      propertyEquity,
      totalPropertyValue,
      totalMortgageBalance,
      // Shares
      sharesValue: currentShares.currentValue,
      sharesResult,
      // Bonds
      bondResults,
      bondLiquidity,
      bondPreTenYr,
      // Expenses
      expenseTree,
      totalExpenses,
      // Cashflow
      totalOutflows,
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
    })
  }

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
