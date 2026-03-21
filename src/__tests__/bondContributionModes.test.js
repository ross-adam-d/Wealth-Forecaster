import { describe, it, expect } from 'vitest'
import { runSimulation } from '../engine/simulationEngine.js'
import { createDefaultScenario, createDefaultInvestmentBond } from '../utils/schema.js'

function makeScenario(overrides = {}) {
  const base = createDefaultScenario('Bond test')
  base.household.personA.dateOfBirth = '1986-01-01'
  base.household.personA.currentSalary = 150_000
  base.household.personA.retirementAge = 65
  base.simulationEndAge = 70
  // Single bond
  const bond = {
    ...createDefaultInvestmentBond(),
    name: 'Test bond',
    currentBalance: 50_000,
    annualContribution: 40_000,
    inceptionDate: '2020-01-01',
    ...overrides.bond,
  }
  base.investmentBonds = [bond]
  base.surplusRoutingOrder = overrides.surplusRoutingOrder || ['offset', 'shares', 'cash']
  // Zero expenses to keep cashflow simple
  base.expenses.amount = 0
  base.expenses.children = []
  if (overrides.expenses != null) {
    base.expenses.amount = overrides.expenses
    base.expenses.amountType = 'annual'
    base.expenses.type = 'category'
  }
  return base
}

describe('Bond contribution modes — engine integration', () => {
  describe('fixed mode (default)', () => {
    it('deducts fixed bond contribution from cashflow as outflow', () => {
      const scenario = makeScenario({ bond: { contributionMode: 'fixed' } })
      const snapshots = runSimulation(scenario)
      const yr0 = snapshots[0]
      // totalOutflows should include the 40k bond contribution
      expect(yr0.totalBondContributions).toBeCloseTo(40_000, 0)
      // Bond contribution shows in totalOutflows
      expect(yr0.totalOutflows).toBeGreaterThanOrEqual(40_000)
    })

    it('bond balance grows with fixed contributions applied', () => {
      const scenario = makeScenario({ bond: { contributionMode: 'fixed' } })
      const snapshots = runSimulation(scenario)
      const yr0 = snapshots[0]
      // Bond should grow: 50k + 40k contribution + growth
      const bondClosing = yr0.bondResults[0].closingBalance
      expect(bondClosing).toBeGreaterThan(50_000 + 40_000)
    })

    it('fixed contributions are capped at available cashflow (no deficit-funded contributions)', () => {
      // Set expenses to eat almost all income, so 40k bond contribution would exceed available
      const scenario = makeScenario({
        bond: { contributionMode: 'fixed' },
        expenses: 100_000,
      })
      const snapshots = runSimulation(scenario)
      const yr0 = snapshots[0]
      // With 150k salary, ~100k expenses, contribution capped at available cashflow
      // Should be less than target but still contribute what's available
      expect(yr0.totalBondContributions).toBeLessThan(40_000)
      expect(yr0.totalBondContributions).toBeGreaterThan(0)
    })
  })

  describe('surplus mode', () => {
    it('contributes from surplus when bonds in routing order', () => {
      const scenario = makeScenario({
        bond: { contributionMode: 'surplus' },
        surplusRoutingOrder: ['bonds', 'cash'],
      })
      const snapshots = runSimulation(scenario)
      const yr0 = snapshots[0]
      // Surplus-mode bond should receive contribution from surplus
      expect(yr0.totalBondContributions).toBeGreaterThan(0)
      expect(yr0.totalSurplusBondContributions).toBeGreaterThan(0)
    })

    it('surplus-mode bonds auto-added to routing order when missing', () => {
      const scenario = makeScenario({
        bond: { contributionMode: 'surplus' },
        surplusRoutingOrder: ['offset', 'shares', 'cash'],
        // No 'bonds' in routing order — engine auto-adds before cash
      })
      const snapshots = runSimulation(scenario)
      const yr0 = snapshots[0]
      // Surplus-mode bonds are now auto-added to routing order
      expect(yr0.totalBondContributions).toBeGreaterThan(0)
      expect(yr0.totalSurplusBondContributions).toBeGreaterThan(0)
    })

    it('surplus-mode bond gets zero contribution in deficit year', () => {
      const scenario = makeScenario({
        bond: { contributionMode: 'surplus' },
        surplusRoutingOrder: ['bonds', 'cash'],
        expenses: 200_000, // more than income
      })
      const snapshots = runSimulation(scenario)
      const yr0 = snapshots[0]
      // No surplus → no bond contribution
      expect(yr0.totalSurplusBondContributions).toBe(0)
    })

    it('surplus-mode contribution capped by available surplus', () => {
      // Create scenario where surplus < target contribution
      const scenario = makeScenario({
        bond: { contributionMode: 'surplus', annualContribution: 200_000 },
        surplusRoutingOrder: ['bonds', 'cash'],
      })
      const snapshots = runSimulation(scenario)
      const yr0 = snapshots[0]
      // Contribution should be less than target because surplus is limited
      expect(yr0.totalBondContributions).toBeLessThan(200_000)
      expect(yr0.totalBondContributions).toBeGreaterThan(0)
    })

    it('is not deducted as fixed outflow', () => {
      const surplusScenario = makeScenario({
        bond: { contributionMode: 'surplus' },
        surplusRoutingOrder: ['bonds', 'cash'],
      })
      const fixedScenario = makeScenario({
        bond: { contributionMode: 'fixed' },
      })
      const surplusSnaps = runSimulation(surplusScenario)
      const fixedSnaps = runSimulation(fixedScenario)
      // Fixed mode has higher totalOutflows (includes bond contribution)
      // Surplus mode does not include bond in totalOutflows
      expect(fixedSnaps[0].totalOutflows).toBeGreaterThan(surplusSnaps[0].totalOutflows)
    })
  })

  describe('annual increase ratchet', () => {
    it('ratchets contribution up by increase rate each year in fixed mode', () => {
      const scenario = makeScenario({
        bond: { contributionMode: 'fixed', annualIncreaseRate: 0.25, annualContribution: 10_000 },
      })
      const snapshots = runSimulation(scenario)
      // Year 0: 10,000 (first year, no prior)
      // Year 1: max(10,000, 10,000 * 1.25) = 12,500
      // Year 2: max(10,000, 12,500 * 1.25) = 15,625
      expect(snapshots[0].totalBondContributions).toBeCloseTo(10_000, 0)
      expect(snapshots[1].totalBondContributions).toBeCloseTo(12_500, 0)
      expect(snapshots[2].totalBondContributions).toBeCloseTo(15_625, 0)
    })

    it('ratchets contribution in surplus mode when surplus available', () => {
      const scenario = makeScenario({
        bond: { contributionMode: 'surplus', annualIncreaseRate: 0.25, annualContribution: 10_000 },
        surplusRoutingOrder: ['bonds', 'cash'],
      })
      const snapshots = runSimulation(scenario)
      // Year 0: 10k; Year 1: should attempt 12.5k
      expect(snapshots[0].totalBondContributions).toBeCloseTo(10_000, 0)
      // Year 1 should be higher if surplus allows
      expect(snapshots[1].totalBondContributions).toBeGreaterThan(snapshots[0].totalBondContributions)
    })

    it('does not ratchet without increase rate', () => {
      const scenario = makeScenario({
        bond: { contributionMode: 'fixed', annualIncreaseRate: 0, annualContribution: 10_000 },
      })
      const snapshots = runSimulation(scenario)
      expect(snapshots[0].totalBondContributions).toBeCloseTo(10_000, 0)
      expect(snapshots[1].totalBondContributions).toBeCloseTo(10_000, 0)
      expect(snapshots[2].totalBondContributions).toBeCloseTo(10_000, 0)
    })
  })

  describe('priorYearContribution tracking', () => {
    it('tracks actual effective contribution for 125% rule', () => {
      const scenario = makeScenario({
        bond: { contributionMode: 'fixed', annualContribution: 10_000 },
      })
      const snapshots = runSimulation(scenario)
      // Year 0 effective = 10k, year 1 125% cap = 12.5k, but annualContribution is still 10k → 10k
      expect(snapshots[0].bondResults[0].effectiveContribution).toBeCloseTo(10_000, 0)
      expect(snapshots[1].bondResults[0].effectiveContribution).toBeCloseTo(10_000, 0)
    })
  })
})
