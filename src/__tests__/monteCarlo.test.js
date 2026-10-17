import { describe, it, expect } from 'vitest'
import { runSimulation } from '../engine/simulationEngine.js'
import { runMonteCarlo, generateReturnShocks, createRng, percentile } from '../engine/monteCarlo.js'
import { createDefaultScenario, createDefaultProperty } from '../utils/schema.js'
import { MONTE_CARLO_ASSET_RISK } from '../constants/index.js'

function couple({ cash = 50_000, livingExpenses = 60_000 } = {}) {
  const s = createDefaultScenario('MC couple')
  s.household.personA.dateOfBirth = '1980-03-01'
  s.household.personA.currentSalary = 140_000
  s.household.personA.retirementAge = 60
  s.household.personB.dateOfBirth = '1982-06-01'
  s.household.personB.currentSalary = 90_000
  s.household.personB.retirementAge = 60
  s.simulationEndAge = 92
  s.super[0].currentBalance = 300_000
  s.shares.currentValue = 150_000
  s.cashSavings = cash
  const p = createDefaultProperty()
  Object.assign(p, { currentValue: 1_000_000, mortgageBalance: 400_000, interestRate: 0.06, loanTermYearsRemaining: 20 })
  s.properties = [p]
  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [{ id: 'living', label: 'Living', type: 'category', amountType: 'annual', amount: livingExpenses, children: [] }],
  }
  return s
}

const ZERO_SHOCK = Object.fromEntries(Object.keys(MONTE_CARLO_ASSET_RISK).map(k => [k, 0]))

describe('runSimulation returnShocks', () => {
  it('zero shocks reproduce the deterministic forecast exactly', () => {
    const s = couple()
    const base = runSimulation(s)
    const shocked = runSimulation(s, { returnShocks: base.map(() => ZERO_SHOCK) })
    expect(shocked.map(x => x.totalNetWorth)).toEqual(base.map(x => x.totalNetWorth))
    expect(shocked.map(x => x.totalLiquidAssets)).toEqual(base.map(x => x.totalLiquidAssets))
  })

  it('negative shocks lower super, shares and property values', () => {
    const s = couple()
    const base = runSimulation(s)
    const down = Object.fromEntries(Object.keys(ZERO_SHOCK).map(k => [k, -0.05]))
    const shocked = runSimulation(s, { returnShocks: base.map(() => down) })
    const y = 10
    expect(shocked[y].superABalance).toBeLessThan(base[y].superABalance)
    expect(shocked[y].sharesValue).toBeLessThan(base[y].sharesValue)
    expect(shocked[y].totalPropertyValue).toBeLessThan(base[y].totalPropertyValue)
  })
})

describe('generateReturnShocks', () => {
  const shocks = generateReturnShocks(20_000, createRng(1))

  const stats = key => {
    const xs = shocks.map(s => s[key])
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
    return { xs, mean, sd }
  }

  it('each asset class has ~zero mean and its configured volatility', () => {
    for (const [asset, { volatility }] of Object.entries(MONTE_CARLO_ASSET_RISK)) {
      const { mean, sd } = stats(asset)
      expect(Math.abs(mean)).toBeLessThan(0.005)
      expect(sd).toBeCloseTo(volatility, 2)
    }
  })

  it('shares and super move together (correlation ≈ product of market betas)', () => {
    const a = stats('shares')
    const b = stats('super')
    const cov = a.xs.reduce((sum, x, i) => sum + (x - a.mean) * (b.xs[i] - b.mean), 0) / a.xs.length
    const corr = cov / (a.sd * b.sd)
    const expected = MONTE_CARLO_ASSET_RISK.shares.marketBeta * MONTE_CARLO_ASSET_RISK.super.marketBeta
    expect(corr).toBeCloseTo(expected, 1)
  })
})

describe('percentile', () => {
  it('interpolates between ranks', () => {
    expect(percentile([0, 10, 20, 30, 40], 50)).toBe(20)
    expect(percentile([0, 10], 25)).toBe(2.5)
    expect(percentile([], 50)).toBe(0)
  })
})

describe('runMonteCarlo', () => {
  it('is repeatable for the same seed', () => {
    const s = couple()
    const a = runMonteCarlo(s, { runs: 40, seed: 7 })
    const b = runMonteCarlo(s, { runs: 40, seed: 7 })
    expect(a).toEqual(b)
  })

  it('returns ordered percentile bands for every simulated year', () => {
    const s = couple()
    const mc = runMonteCarlo(s, { runs: 60 })
    expect(mc.years.length).toBe(runSimulation(s).length)
    for (const y of mc.years) {
      for (const band of [y.netWorth, y.liquid]) {
        expect(band.p10).toBeLessThanOrEqual(band.p25)
        expect(band.p25).toBeLessThanOrEqual(band.p50)
        expect(band.p50).toBeLessThanOrEqual(band.p75)
        expect(band.p75).toBeLessThanOrEqual(band.p90)
        expect(Number.isFinite(band.p10) && Number.isFinite(band.p90)).toBe(true)
      }
    }
  })

  it('bands widen over time', () => {
    const mc = runMonteCarlo(couple(), { runs: 60 })
    const spread = y => mc.years[y].netWorth.p90 - mc.years[y].netWorth.p10
    expect(spread(20)).toBeGreaterThan(spread(2))
  })

  it('success rate is 1 for a comfortable plan and 0 for an unaffordable one', () => {
    expect(runMonteCarlo(couple({ livingExpenses: 20_000 }), { runs: 30 }).successRate).toBe(1)
    expect(runMonteCarlo(couple({ cash: 0, livingExpenses: 400_000 }), { runs: 30 }).successRate).toBe(0)
  })
})
