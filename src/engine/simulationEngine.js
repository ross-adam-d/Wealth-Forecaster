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
import { processOtherAssetYear } from '../modules/otherAssets.js'
import { processOtherIncome } from '../modules/otherIncome.js'
import { processAllDebts } from '../modules/debts.js'
import { SURPLUS_DESTINATIONS, BOND_CONTRIBUTION_MODES, INVESTMENT_BOND_125_PCT_RULE } from '../constants/index.js'

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
function resolveNovatedLeaseReduction(person, year) {
  const lease = person.packaging?.novatedLease
  if (!lease) return { reduction: 0, fbtResult: null }

  // Check active window
  const from = lease.activeYears?.from
  const to = lease.activeYears?.to
  if (from != null && year < from) return { reduction: 0, fbtResult: null }
  if (to != null && year > to) return { reduction: 0, fbtResult: null }

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
    otherAssets: otherAssetsInput = [],
    otherIncome: otherIncomeInput = [],
    debts: debtsInput = [],
    expenses,
    assumptions,
    simulationEndAge,
    surplusRoutingOrder,
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
  let currentBonds = investmentBonds.map(b => ({ ...b }))
  let currentOtherAssets = otherAssetsInput.map(a => ({ ...a }))
  let currentProperties = properties.map(p => ({ ...p }))
  let currentDebts = debtsInput.map(d => ({ ...d }))
  let cashBuffer = 0
  let firstDeficitYear = null
  let cumulativeDeficit = 0

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
    const { reduction: leaseReductionA, fbtResult: fbtA } = resolveNovatedLeaseReduction(personA, year)
    const { reduction: leaseReductionB, fbtResult: fbtB } = resolveNovatedLeaseReduction(personB, year)

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
    // Split CGT between A and B based on property ownership percentage
    const propertyCGT_A = propertyResults.reduce((sum, r, i) => {
      const pct = (currentProperties[i].ownershipPctA ?? 100) / 100
      return sum + (r.cgtAmount || 0) * pct
    }, 0)
    const propertyCGT_B = propertyResults.reduce((sum, r, i) => {
      const pct = (currentProperties[i].ownershipPctA ?? 100) / 100
      return sum + (r.cgtAmount || 0) * (1 - pct)
    }, 0)

    // ── Step 7: Shares — growth phase only (contribution resolved after cashflow) ──
    const sharesResult = processSharesYear({
      shares: currentShares,
      year,
      personAge: Math.max(ageA || 0, ageB || 0),
      drawdownNeeded: 0,
      resolvedContribution: 0,  // no contribution in growth pass — resolved after cashflow
      assumptions,
    })

    // ── Other income sources ──────────────────────────────────────────────
    const otherIncomeResult = processOtherIncome(otherIncomeInput, year, currentYear)

    // Recalculate tax with dividends + property (CGT split by ownership %) + other income
    const taxAFinal = calcPersonTax({
      grossSalary: salaryA,
      salarySacrifice: superContribA_pre.salarySacrificeAmount,
      packagingReduction: packReductionA,
      novatedLeaseReduction: leaseReductionA,
      rentalIncomeLoss: totalNetRentalIncomeLoss,
      dividendIncome: sharesResult.cashDividend * 0.5,
      frankingCredit: sharesResult.frankingCredit * 0.5,
      capitalGain: propertyCGT_A,
      otherIncome: otherIncomeResult.taxableA,
      inPensionPhase: ageA != null && hasReachedPreservationAge(ageA) && retiredA,
    })

    const taxBFinal = (propertyCGT_B > 0 || otherIncomeResult.taxableB > 0) ? calcPersonTax({
      grossSalary: salaryB,
      salarySacrifice: superContribB_pre.salarySacrificeAmount,
      packagingReduction: packReductionB,
      novatedLeaseReduction: leaseReductionB,
      capitalGain: propertyCGT_B,
      otherIncome: otherIncomeResult.taxableB,
      inPensionPhase: ageB != null && hasReachedPreservationAge(ageB) && retiredB,
    }) : taxB

    // ── Step 8: Resolve target contributions for ALL non-property investments ──
    // Generic helper: resolve target contribution based on mode + annual increase rate
    function resolveTargetContribution(annualContribution, annualIncreaseRate, priorActual, isBond) {
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
    const fixedSharesContribution = sharesMode === BOND_CONTRIBUTION_MODES.FIXED ? sharesTarget : 0

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

    // Total fixed contributions across all asset types
    const totalFixedContributions = fixedSharesContribution + totalFixedBondContributions + totalFixedOtherAssetContributions

    // Bond growth phase: fixed-mode bonds get their contribution now; surplus-mode bonds get 0
    const bondGrowthResults = currentBonds.map((bond, i) =>
      processBondYear({ bond, year, drawdownNeeded: 0, resolvedContribution: fixedBondContributions[i], assumptions })
    )

    // Other asset growth phase: fixed-mode assets get their contribution now; surplus-mode get 0
    const otherAssetGrowthResults = currentOtherAssets.map((asset, i) =>
      processOtherAssetYear({ asset, year, drawdownNeeded: 0, resolvedContribution: fixedOtherAssetContributions[i] })
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

    // ── Step 9b: Debts ────────────────────────────────────────────────────
    const debtResult = processAllDebts(currentDebts, year)
    const totalDebtRepayments = debtResult.totalRepayment
    const totalDebtBalance = debtResult.totalBalance

    // ── Step 10: Net cashflow ─────────────────────────────────────────────
    // Compute preliminary income without asset withdrawals
    const totalIncomePreBond =
      taxAFinal.netTakeHome +
      taxBFinal.netTakeHome +
      (totalNetRentalIncomeLoss > 0 ? totalNetRentalIncomeLoss : 0) +
      sharesResult.cashDividend +
      taxAFinal.frankingRefund +
      superA_result.drawdown +
      superB_result.drawdown +
      propertySaleProceeds +
      otherIncomeResult.nonTaxable  // non-taxable other income (taxable already in netTakeHome)

    // Fixed contributions are guaranteed outflows (like expenses)
    const totalOutflows =
      totalExpenses +
      totalMortgageRepayments +
      totalDebtRepayments +
      totalFixedContributions

    const prelimNetCashflow = totalIncomePreBond - totalOutflows

    // Route surplus / fill deficit
    let surplus = 0
    let sharesAdjustment = 0
    let surplusSharesContribution = 0
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
      let remaining = surplus
      for (const dest of surplusRoutingOrder) {
        if (remaining <= 0) break
        if (dest === SURPLUS_DESTINATIONS.OFFSET) {
          // Top up offset accounts on properties that have mortgages
          for (let i = 0; i < currentProperties.length; i++) {
            if (remaining <= 0) break
            const p = currentProperties[i]
            if (p.mortgageBalance > 0) {
              const headroom = Math.max(0, p.mortgageBalance - (propertyResults[i].offsetBalance || 0))
              const toOffset = Math.min(remaining, headroom)
              if (toOffset > 0) {
                propertyResults[i] = { ...propertyResults[i], offsetBalance: (propertyResults[i].offsetBalance || 0) + toOffset }
                remaining -= toOffset
              }
            }
          }
        } else if (dest === SURPLUS_DESTINATIONS.SHARES) {
          // Allocate surplus to shares when in surplus mode
          if (sharesMode === BOND_CONTRIBUTION_MODES.SURPLUS) {
            if (sharesTarget > 0) {
              // Explicit target: allocate up to that amount
              const allocated = Math.min(remaining, sharesTarget)
              surplusSharesContribution = allocated
              remaining -= allocated
            } else {
              // No explicit target (legacy or annualContribution=0): absorb all remaining surplus
              surplusSharesContribution = remaining
              remaining = 0
            }
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
        const availableLiquidity = cashBuffer + Math.max(0, sharesResult.closingValue + sharesAdjustment + surplusSharesContribution + fixedSharesContribution)
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

      // 1. Cash buffer (clamp at 0 — never draw from negative cash)
      const fromCash = Math.min(remaining, Math.max(0, cashBuffer))
      cashBuffer -= fromCash
      remaining -= fromCash
      cashDrawdown += fromCash

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

      // 4. Other assets (drawdown-eligible)
      if (remaining > 0) {
        for (let i = 0; i < currentOtherAssets.length && remaining > 0; i++) {
          if (currentOtherAssets[i].canDrawdown) {
            const available = otherAssetGrowthResults[i].closingValue
            const draw = Math.min(remaining, available)
            otherAssetDrawdowns[i] = draw
            remaining -= draw
          }
        }
      }

      // 5. Extra super drawdown — pension-phase super is liquid
      if (remaining > 0 && superA_result.inPensionPhase) {
        superAExtra = Math.min(remaining, superA_result.closingBalance)
        remaining -= superAExtra
      }
      if (remaining > 0 && superB_result.inPensionPhase) {
        superBExtra = Math.min(remaining, superB_result.closingBalance)
        remaining -= superBExtra
      }
    }

    // ── Final results with resolved contributions + drawdowns ──

    // Shares: total contribution = fixed + surplus
    const finalSharesContribution = fixedSharesContribution + surplusSharesContribution
    // sharesAdjustment tracks drawdowns (negative) from deficit path; contributions are separate
    // Combine: positive contribution adds to value, negative adjustment subtracts
    const sharesNetAdjustment = finalSharesContribution + sharesAdjustment

    // Bonds: total contribution = fixed + surplus
    const finalBondContributions = currentBonds.map((_, i) =>
      fixedBondContributions[i] + surplusBondContributions[i]
    )
    const bondResults = currentBonds.map((bond, i) =>
      processBondYear({ bond, year, drawdownNeeded: bondDrawdowns[i], resolvedContribution: finalBondContributions[i], assumptions })
    )
    const totalBondContributions = finalBondContributions.reduce((sum, c) => sum + c, 0)
    const totalSurplusBondContributions = surplusBondContributions.reduce((sum, c) => sum + c, 0)

    // Other assets: total contribution = fixed + surplus
    const finalOtherAssetContributions = currentOtherAssets.map((_, i) =>
      fixedOtherAssetContributions[i] + surplusOtherAssetContributions[i]
    )
    const otherAssetResults = currentOtherAssets.map((asset, i) =>
      processOtherAssetYear({ asset, year, drawdownNeeded: otherAssetDrawdowns[i], resolvedContribution: finalOtherAssetContributions[i] })
    )
    const totalOtherAssetContributions = finalOtherAssetContributions.reduce((sum, c) => sum + c, 0)

    // Aggregate contributions for snapshot
    const totalInvestmentContributions = finalSharesContribution + totalBondContributions + totalOtherAssetContributions

    const totalBondWithdrawals = bondResults.reduce((sum, r) => sum + r.withdrawal, 0)
    const totalOtherAssetWithdrawals = otherAssetResults.reduce((sum, r) => sum + r.withdrawal, 0)
    // sharesDrawdown is positive when shares are sold to cover a deficit
    const sharesDrawdown = Math.max(0, -sharesAdjustment)
    // Include all asset drawdowns in income so netCashflow and isDeficit
    // reflect the true funded position — isDeficit only fires when ALL
    // liquid sources (cash + shares + bonds + other assets + pension-phase super) are exhausted
    const totalIncome = totalIncomePreBond + totalBondWithdrawals + totalOtherAssetWithdrawals + sharesDrawdown + cashDrawdown + superAExtra + superBExtra
    const netCashflow = totalIncome - totalOutflows
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
    superA = { ...superA, currentBalance: Math.max(0, superA_result.closingBalance - superAExtra) }
    superB = { ...superB, currentBalance: Math.max(0, superB_result.closingBalance - superBExtra) }
    // Apply shares growth + resolved contributions + deficit drawdowns
    currentShares = {
      ...currentShares,
      currentValue: Math.max(0, sharesResult.closingValue + sharesNetAdjustment),
      priorYearContribution: finalSharesContribution,  // Track actual for annual increase ratchet
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
      offsetBalance: propertyResults[i].offsetBalance,
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
      // Shares
      sharesValue: currentShares.currentValue,
      sharesResult,
      sharesContribution: finalSharesContribution,
      sharesDrawdown,
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
