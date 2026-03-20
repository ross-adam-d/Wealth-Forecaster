/**
 * Integration tests for unified contribution model across all non-property investments.
 * Tests: shares, bonds, and other assets — fixed/surplus modes + annual increase.
 */
import { describe, it, expect } from 'vitest'
import { runSimulation } from '../engine/simulationEngine.js'
import { createDefaultScenario, createDefaultInvestmentBond, createDefaultOtherAsset } from '../utils/schema.js'

function makeScenario(overrides = {}) {
  const base = createDefaultScenario('Contrib test')
  base.household.personA.dateOfBirth = '1986-01-01'
  base.household.personA.currentSalary = 150_000
  base.household.personA.retirementAge = 65
  base.simulationEndAge = 70
  base.expenses.amount = 0
  base.expenses.children = []
  if (overrides.expenses != null) {
    base.expenses.amount = overrides.expenses
    base.expenses.amountType = 'annual'
    base.expenses.type = 'category'
  }
  if (overrides.shares) {
    base.shares = { ...base.shares, ...overrides.shares }
  }
  if (overrides.bonds) {
    base.investmentBonds = overrides.bonds.map(b => ({
      ...createDefaultInvestmentBond(),
      name: 'Test bond',
      currentBalance: 50_000,
      inceptionDate: '2020-01-01',
      ...b,
    }))
  }
  if (overrides.otherAssets) {
    base.otherAssets = overrides.otherAssets.map(a => ({
      ...createDefaultOtherAsset(),
      name: 'Test asset',
      currentValue: 50_000,
      ...a,
    }))
  }
  base.surplusRoutingOrder = overrides.surplusRoutingOrder || ['offset', 'shares', 'cash']
  return base
}

describe('Shares contribution modes', () => {
  it('fixed-mode shares deducted from cashflow as outflow', () => {
    const scenario = makeScenario({
      shares: { annualContribution: 20_000, contributionMode: 'fixed' },
    })
    const yr0 = runSimulation(scenario)[0]
    expect(yr0.sharesContribution).toBeCloseTo(20_000, 0)
    expect(yr0.totalOutflows).toBeGreaterThanOrEqual(20_000)
  })

  it('surplus-mode shares funded from surplus waterfall', () => {
    const scenario = makeScenario({
      shares: { annualContribution: 20_000, contributionMode: 'surplus' },
      surplusRoutingOrder: ['shares', 'cash'],
    })
    const yr0 = runSimulation(scenario)[0]
    expect(yr0.sharesContribution).toBeCloseTo(20_000, 0)
    // Not in totalOutflows (surplus-mode)
    expect(yr0.totalOutflows).toBeLessThan(20_000)
  })

  it('surplus-mode shares get zero in deficit year', () => {
    const scenario = makeScenario({
      shares: { annualContribution: 20_000, contributionMode: 'surplus' },
      surplusRoutingOrder: ['shares', 'cash'],
      expenses: 200_000,
    })
    const yr0 = runSimulation(scenario)[0]
    expect(yr0.sharesContribution).toBe(0)
  })

  it('surplus-mode shares capped by available surplus', () => {
    const scenario = makeScenario({
      shares: { annualContribution: 500_000, contributionMode: 'surplus' },
      surplusRoutingOrder: ['shares', 'cash'],
    })
    const yr0 = runSimulation(scenario)[0]
    expect(yr0.sharesContribution).toBeLessThan(500_000)
    expect(yr0.sharesContribution).toBeGreaterThan(0)
  })

  it('annual increase ratchets shares contribution each year', () => {
    const scenario = makeScenario({
      shares: { annualContribution: 10_000, contributionMode: 'fixed', annualIncreaseRate: 0.10 },
    })
    const snaps = runSimulation(scenario)
    expect(snaps[0].sharesContribution).toBeCloseTo(10_000, 0)
    // Year 1: max(10k, 10k * 1.10) = 11k
    expect(snaps[1].sharesContribution).toBeCloseTo(11_000, 0)
    // Year 2: max(10k, 11k * 1.10) = 12.1k
    expect(snaps[2].sharesContribution).toBeCloseTo(12_100, 0)
  })

  it('legacy shares (no contributionMode) default to surplus and absorb nothing without routing', () => {
    const scenario = makeScenario({
      shares: { annualContribution: 20_000 },  // no contributionMode set
      surplusRoutingOrder: ['offset', 'cash'],  // shares not in routing
    })
    const yr0 = runSimulation(scenario)[0]
    // Default surplus mode + not in routing order = no contribution
    expect(yr0.sharesContribution).toBe(0)
  })
})

describe('Other assets contribution modes', () => {
  it('fixed-mode other asset deducted from cashflow', () => {
    const scenario = makeScenario({
      otherAssets: [{ annualContribution: 15_000, contributionMode: 'fixed' }],
    })
    const yr0 = runSimulation(scenario)[0]
    expect(yr0.totalOtherAssetContributions).toBeCloseTo(15_000, 0)
    expect(yr0.totalOutflows).toBeGreaterThanOrEqual(15_000)
  })

  it('surplus-mode other asset funded from surplus', () => {
    const scenario = makeScenario({
      otherAssets: [{ annualContribution: 15_000, contributionMode: 'surplus' }],
      surplusRoutingOrder: ['otherAssets', 'cash'],
    })
    const yr0 = runSimulation(scenario)[0]
    expect(yr0.totalOtherAssetContributions).toBeCloseTo(15_000, 0)
  })

  it('surplus-mode other asset gets zero in deficit year', () => {
    const scenario = makeScenario({
      otherAssets: [{ annualContribution: 15_000, contributionMode: 'surplus' }],
      surplusRoutingOrder: ['otherAssets', 'cash'],
      expenses: 200_000,
    })
    const yr0 = runSimulation(scenario)[0]
    expect(yr0.totalOtherAssetContributions).toBe(0)
  })

  it('annual increase ratchets other asset contribution', () => {
    const scenario = makeScenario({
      otherAssets: [{ annualContribution: 10_000, contributionMode: 'fixed', annualIncreaseRate: 0.05 }],
    })
    const snaps = runSimulation(scenario)
    expect(snaps[0].totalOtherAssetContributions).toBeCloseTo(10_000, 0)
    expect(snaps[1].totalOtherAssetContributions).toBeCloseTo(10_500, 0)
    expect(snaps[2].totalOtherAssetContributions).toBeCloseTo(11_025, 0)
  })
})

describe('Mixed asset contributions', () => {
  it('all fixed contributions appear in totalOutflows', () => {
    const scenario = makeScenario({
      shares: { annualContribution: 10_000, contributionMode: 'fixed' },
      bonds: [{ annualContribution: 20_000, contributionMode: 'fixed' }],
      otherAssets: [{ annualContribution: 5_000, contributionMode: 'fixed' }],
    })
    const yr0 = runSimulation(scenario)[0]
    // totalOutflows includes all three fixed contributions
    expect(yr0.totalInvestmentContributions).toBeCloseTo(35_000, 0)
    expect(yr0.totalOutflows).toBeGreaterThanOrEqual(35_000)
  })

  it('surplus routing respects priority order across asset types', () => {
    // Small surplus scenario: only enough for one contribution
    const scenario = makeScenario({
      shares: { annualContribution: 100_000, contributionMode: 'surplus' },
      bonds: [{ annualContribution: 100_000, contributionMode: 'surplus' }],
      expenses: 60_000,
      surplusRoutingOrder: ['bonds', 'shares', 'cash'],
    })
    const yr0 = runSimulation(scenario)[0]
    // Bonds are first in priority — should get funded before shares
    expect(yr0.totalBondContributions).toBeGreaterThan(0)
    // Total can't exceed surplus
    expect(yr0.totalBondContributions + yr0.sharesContribution).toBeLessThanOrEqual(yr0.surplus + 100)
  })

  it('bond increase rate capped at 25% even if set higher', () => {
    const scenario = makeScenario({
      bonds: [{ annualContribution: 10_000, contributionMode: 'fixed', annualIncreaseRate: 0.50 }],
    })
    const snaps = runSimulation(scenario)
    // Year 0: 10k, Year 1: capped at 25% → max(10k, 10k * 1.25) = 12.5k (not 15k)
    expect(snaps[0].totalBondContributions).toBeCloseTo(10_000, 0)
    expect(snaps[1].totalBondContributions).toBeCloseTo(12_500, 0)
  })

  it('shares increase rate NOT capped', () => {
    const scenario = makeScenario({
      shares: { annualContribution: 10_000, contributionMode: 'fixed', annualIncreaseRate: 0.50 },
    })
    const snaps = runSimulation(scenario)
    // Year 1: max(10k, 10k * 1.50) = 15k (uncapped)
    expect(snaps[1].sharesContribution).toBeCloseTo(15_000, 0)
  })
})
