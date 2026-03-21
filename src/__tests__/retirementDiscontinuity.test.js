/**
 * Diagnostic test: retirement age 52 vs 53 discontinuity
 * Reproduces the reported bug where changing retirement by 1 year causes:
 * - Bonds disappear from cashflow
 * - Shares/dividends skyrocket
 * - 5-year deficit → 7M surplus
 */
import { describe, it, expect } from 'vitest'
import { runSimulation } from '../engine/simulationEngine.js'
import { createDefaultScenario, createDefaultInvestmentBond } from '../utils/schema.js'

function makeRossScenario(retirementAge) {
  const base = createDefaultScenario('Ross test')
  // Person A: born ~1974, retiring at 52 or 53
  base.household.personA.dateOfBirth = '1974-06-15'
  base.household.personA.currentSalary = 180_000
  base.household.personA.retirementAge = retirementAge
  // Person B: working until 60
  base.household.personB.dateOfBirth = '1976-03-01'
  base.household.personB.currentSalary = 80_000
  base.household.personB.retirementAge = 60
  base.simulationEndAge = 90

  // Shares — legacy data (no contributionMode set)
  base.shares.currentValue = 200_000
  base.shares.annualContribution = 30_000
  // NOTE: no contributionMode set — tests legacy behavior

  // Bond: 40k/year — legacy data (no contributionMode set)
  const bond = {
    ...createDefaultInvestmentBond(),
    name: 'Education fund',
    currentBalance: 100_000,
    annualContribution: 40_000,
    inceptionDate: '2020-01-01',
  }
  // Remove new fields to simulate legacy data
  delete bond.contributionMode
  delete bond.annualIncreaseRate
  base.investmentBonds = [bond]

  // Also remove contributionMode from shares to simulate legacy
  delete base.shares.contributionMode
  delete base.shares.annualIncreaseRate

  // Expenses: reasonable living costs
  base.expenses = {
    id: 'root',
    label: 'Expenses',
    type: 'category',
    amountType: 'annual',
    amount: 80_000,
    children: [],
  }

  base.surplusRoutingOrder = ['offset', 'shares', 'cash']

  return base
}

describe('Retirement age discontinuity diagnostic', () => {
  it('compares retirement 52 vs 53 — key metrics should not have massive discontinuity', () => {
    const snap52 = runSimulation(makeRossScenario(52))
    const snap53 = runSimulation(makeRossScenario(53))

    // Check year 0 (current year)
    const yr0_52 = snap52[0]
    const yr0_53 = snap53[0]

    console.log('\n=== YEAR 0 COMPARISON ===')
    console.log('Ret 52 - totalOutflows:', yr0_52.totalOutflows, 'surplus:', yr0_52.surplus, 'netCashflow:', yr0_52.netCashflow)
    console.log('Ret 53 - totalOutflows:', yr0_53.totalOutflows, 'surplus:', yr0_53.surplus, 'netCashflow:', yr0_53.netCashflow)
    console.log('Ret 52 - bondContrib:', yr0_52.totalBondContributions, 'sharesContrib:', yr0_52.sharesContribution, 'sharesValue:', yr0_52.sharesValue)
    console.log('Ret 53 - bondContrib:', yr0_53.totalBondContributions, 'sharesContrib:', yr0_53.sharesContribution, 'sharesValue:', yr0_53.sharesValue)

    // Bond contributions should be the same in year 0 (both still working)
    expect(yr0_52.totalBondContributions).toBe(yr0_53.totalBondContributions)

    // Check mid-retirement year (say age 55 — year when person A is ~55)
    const midIdx = snap52.findIndex(s => s.ageA >= 55)
    if (midIdx >= 0) {
      const mid52 = snap52[midIdx]
      const mid53 = snap53[midIdx]
      console.log('\n=== AGE 55 COMPARISON ===')
      console.log('Ret 52 - bondContrib:', mid52.totalBondContributions, 'sharesValue:', mid52.sharesValue, 'dividends:', mid52.sharesResult?.cashDividend)
      console.log('Ret 53 - bondContrib:', mid53.totalBondContributions, 'sharesValue:', mid53.sharesValue, 'dividends:', mid53.sharesResult?.cashDividend)
      console.log('Ret 52 - totalIncome:', mid52.totalIncome, 'totalOutflows:', mid52.totalOutflows, 'netCashflow:', mid52.netCashflow)
      console.log('Ret 53 - totalIncome:', mid53.totalIncome, 'totalOutflows:', mid53.totalOutflows, 'netCashflow:', mid53.netCashflow)
      console.log('Ret 52 - isDeficit:', mid52.isDeficit, 'sharesDrawdown:', mid52.sharesDrawdown, 'cashDrawdown:', mid52.cashDrawdown)
      console.log('Ret 53 - isDeficit:', mid53.isDeficit, 'sharesDrawdown:', mid53.sharesDrawdown, 'cashDrawdown:', mid53.cashDrawdown)
    }

    // Check end of simulation
    const last52 = snap52[snap52.length - 1]
    const last53 = snap53[snap53.length - 1]
    console.log('\n=== FINAL YEAR COMPARISON ===')
    console.log('Ret 52 - netWorth:', last52.totalNetWorth, 'liquidAssets:', last52.totalLiquidAssets, 'sharesValue:', last52.sharesValue)
    console.log('Ret 53 - netWorth:', last53.totalNetWorth, 'liquidAssets:', last53.totalLiquidAssets, 'sharesValue:', last53.sharesValue)
    console.log('Ret 52 - deficitYears:', snap52.deficitYears?.length, 'cumulativeDeficit:', last52.cumulativeDeficit)
    console.log('Ret 53 - deficitYears:', snap53.deficitYears?.length, 'cumulativeDeficit:', last53.cumulativeDeficit)
    console.log('Ret 52 - cashBuffer:', last52.cashBuffer)
    console.log('Ret 53 - cashBuffer:', last53.cashBuffer)

    // The difference in final net worth should be proportional (not 7M)
    const diff = Math.abs(last53.totalNetWorth - last52.totalNetWorth)
    console.log('\nNet worth difference:', diff)

    // Check that bond contributions are consistent across all years
    const allBondContribs52 = snap52.map(s => s.totalBondContributions)
    const allBondContribs53 = snap53.map(s => s.totalBondContributions)
    console.log('\n=== BOND CONTRIBUTIONS ===')
    console.log('Ret 52 first 10:', allBondContribs52.slice(0, 10).map(Math.round))
    console.log('Ret 53 first 10:', allBondContribs53.slice(0, 10).map(Math.round))

    // Check shares contributions
    const allSharesContribs52 = snap52.map(s => s.sharesContribution)
    const allSharesContribs53 = snap53.map(s => s.sharesContribution)
    console.log('\n=== SHARES CONTRIBUTIONS ===')
    console.log('Ret 52 first 10:', allSharesContribs52.slice(0, 10).map(Math.round))
    console.log('Ret 53 first 10:', allSharesContribs53.slice(0, 10).map(Math.round))

    // Check shares values over time
    const sharesValues52 = snap52.map(s => Math.round(s.sharesValue))
    const sharesValues53 = snap53.map(s => Math.round(s.sharesValue))
    console.log('\n=== SHARES VALUES (every 5 yrs) ===')
    for (let i = 0; i < sharesValues52.length; i += 5) {
      console.log(`Year ${snap52[i].year} (ageA=${snap52[i].ageA}): ret52=${sharesValues52[i]}, ret53=${sharesValues53[i]}`)
    }

    // Check dividend income
    const divs52 = snap52.map(s => Math.round(s.sharesResult?.cashDividend || 0))
    const divs53 = snap53.map(s => Math.round(s.sharesResult?.cashDividend || 0))
    console.log('\n=== DIVIDENDS (every 5 yrs) ===')
    for (let i = 0; i < divs52.length; i += 5) {
      console.log(`Year ${snap52[i].year} (ageA=${snap52[i].ageA}): ret52=${divs52[i]}, ret53=${divs53[i]}`)
    }
  })

  it('bond contributions should appear every year regardless of retirement age', () => {
    const snap52 = runSimulation(makeRossScenario(52))
    const snap53 = runSimulation(makeRossScenario(53))

    // Every year should have bond contributions of ~40k (FIXED mode default)
    for (const s of snap52) {
      expect(s.totalBondContributions).toBeGreaterThan(0)
    }
    for (const s of snap53) {
      expect(s.totalBondContributions).toBeGreaterThan(0)
    }
  })

  it('shares contribution behavior with legacy data', () => {
    const scenario = makeRossScenario(53)
    // Legacy shares: no contributionMode → defaults to 'surplus'
    // annualContribution = 30k
    // surplusRoutingOrder includes 'shares'
    const snaps = runSimulation(scenario)

    console.log('\n=== LEGACY SHARES ROUTING ===')
    console.log('shares.contributionMode:', scenario.shares.contributionMode, '(undefined = surplus default)')
    console.log('shares.annualContribution:', scenario.shares.annualContribution)

    // Check what shares actually receives
    for (let i = 0; i < Math.min(5, snaps.length); i++) {
      const s = snaps[i]
      console.log(`Year ${s.year}: sharesContrib=${s.sharesContribution}, surplus=${s.surplus}, isDeficit=${s.isDeficit}`)
    }
  })
})
