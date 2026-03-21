import { describe, it, expect } from 'vitest'
import { resolveOtherIncomeAmount, processOtherIncome } from '../modules/otherIncome.js'

describe('resolveOtherIncomeAmount', () => {
  const base = {
    amount: 10000,
    amountType: 'annual',
    activeFrom: 2026,
    activeTo: 2030,
    adjustmentType: 'none',
    adjustmentRate: 0,
    isTaxable: true,
    person: 'A',
  }

  it('returns amount within active window', () => {
    expect(resolveOtherIncomeAmount(base, 2026, 2026)).toBe(10000)
    expect(resolveOtherIncomeAmount(base, 2028, 2026)).toBe(10000)
    expect(resolveOtherIncomeAmount(base, 2030, 2026)).toBe(10000)
  })

  it('returns 0 outside active window', () => {
    expect(resolveOtherIncomeAmount(base, 2025, 2026)).toBe(0)
    expect(resolveOtherIncomeAmount(base, 2031, 2026)).toBe(0)
  })

  it('handles one-off — only in activeFrom year', () => {
    const oneOff = { ...base, amountType: 'one_off', activeFrom: 2027 }
    expect(resolveOtherIncomeAmount(oneOff, 2027, 2026)).toBe(10000)
    expect(resolveOtherIncomeAmount(oneOff, 2028, 2026)).toBe(0)
    expect(resolveOtherIncomeAmount(oneOff, 2026, 2026)).toBe(0)
  })

  it('converts monthly to annual', () => {
    const monthly = { ...base, amountType: 'monthly', amount: 1000 }
    expect(resolveOtherIncomeAmount(monthly, 2026, 2026)).toBe(12000)
  })

  it('applies percent increase', () => {
    const increasing = { ...base, adjustmentType: 'percent', adjustmentRate: 0.05 }
    // Year 0 (activeFrom): base amount
    expect(resolveOtherIncomeAmount(increasing, 2026, 2026)).toBe(10000)
    // Year 1: 10000 * 1.05
    expect(resolveOtherIncomeAmount(increasing, 2027, 2026)).toBeCloseTo(10500, 0)
    // Year 2: 10000 * 1.05^2
    expect(resolveOtherIncomeAmount(increasing, 2028, 2026)).toBeCloseTo(11025, 0)
  })

  it('applies percent decrease', () => {
    const decreasing = { ...base, adjustmentType: 'percent', adjustmentRate: -0.10 }
    expect(resolveOtherIncomeAmount(decreasing, 2027, 2026)).toBeCloseTo(9000, 0)
    expect(resolveOtherIncomeAmount(decreasing, 2028, 2026)).toBeCloseTo(8100, 0)
  })

  it('applies dollar increase', () => {
    const increasing = { ...base, adjustmentType: 'dollar', adjustmentRate: 2000 }
    expect(resolveOtherIncomeAmount(increasing, 2026, 2026)).toBe(10000)
    expect(resolveOtherIncomeAmount(increasing, 2027, 2026)).toBe(12000)
    expect(resolveOtherIncomeAmount(increasing, 2028, 2026)).toBe(14000)
  })

  it('applies dollar decrease, floors at 0', () => {
    const decreasing = { ...base, adjustmentType: 'dollar', adjustmentRate: -3000 }
    expect(resolveOtherIncomeAmount(decreasing, 2027, 2026)).toBe(7000)
    expect(resolveOtherIncomeAmount(decreasing, 2028, 2026)).toBe(4000)
    expect(resolveOtherIncomeAmount(decreasing, 2029, 2026)).toBe(1000)
    expect(resolveOtherIncomeAmount(decreasing, 2030, 2026)).toBe(0) // floored
  })

  it('returns 0 for zero amount', () => {
    expect(resolveOtherIncomeAmount({ ...base, amount: 0 }, 2026, 2026)).toBe(0)
  })

  it('defaults activeFrom to startYear when null', () => {
    const noFrom = { ...base, activeFrom: null, activeTo: null }
    expect(resolveOtherIncomeAmount(noFrom, 2026, 2026)).toBe(10000)
    expect(resolveOtherIncomeAmount(noFrom, 2050, 2026)).toBe(10000) // indefinite
  })
})

describe('processOtherIncome', () => {
  it('aggregates multiple sources and splits by tax attribution', () => {
    const sources = [
      { id: '1', name: 'Consulting', amount: 50000, amountType: 'annual', activeFrom: 2026, activeTo: null, adjustmentType: 'none', adjustmentRate: 0, isTaxable: true, person: 'A' },
      { id: '2', name: 'Trust distribution', amount: 20000, amountType: 'annual', activeFrom: 2026, activeTo: null, adjustmentType: 'none', adjustmentRate: 0, isTaxable: true, person: 'B' },
      { id: '3', name: 'Gift', amount: 10000, amountType: 'one_off', activeFrom: 2027, activeTo: null, adjustmentType: 'none', adjustmentRate: 0, isTaxable: false, person: 'A' },
      { id: '4', name: 'Joint rental', amount: 30000, amountType: 'annual', activeFrom: 2026, activeTo: null, adjustmentType: 'none', adjustmentRate: 0, isTaxable: true, person: 'household' },
    ]

    // 2026: consulting(50k A) + trust(20k B) + joint(30k → 15k each)
    const r2026 = processOtherIncome(sources, 2026, 2026)
    expect(r2026.total).toBe(100000)
    expect(r2026.taxableA).toBe(65000) // 50k + 15k
    expect(r2026.taxableB).toBe(35000) // 20k + 15k
    expect(r2026.nonTaxable).toBe(0)

    // 2027: adds the one-off gift
    const r2027 = processOtherIncome(sources, 2027, 2026)
    expect(r2027.total).toBe(110000)
    expect(r2027.nonTaxable).toBe(10000)

    // 2028: gift gone
    const r2028 = processOtherIncome(sources, 2028, 2026)
    expect(r2028.total).toBe(100000)
    expect(r2028.nonTaxable).toBe(0)
  })

  it('returns zeros for empty sources', () => {
    const r = processOtherIncome([], 2026, 2026)
    expect(r.total).toBe(0)
    expect(r.taxableA).toBe(0)
    expect(r.taxableB).toBe(0)
    expect(r.nonTaxable).toBe(0)
    expect(r.breakdown).toEqual([])
  })
})

describe('other income integration with simulation', () => {
  it('other income flows into totalIncome and is taxed correctly', async () => {
    const { runSimulation } = await import('../engine/simulationEngine.js')
    const { createDefaultScenario } = await import('../utils/schema.js')

    const scenario = createDefaultScenario('Other income test')
    scenario.household.personA.dateOfBirth = '1980-01-01'
    scenario.household.personA.currentSalary = 100000
    scenario.household.personA.retirementAge = 65
    scenario.simulationEndAge = 70

    // Add consulting income for Person A: 30k/yr from 2026 to 2030
    scenario.otherIncome = [{
      id: 'consulting',
      name: 'Consulting',
      amount: 30000,
      amountType: 'annual',
      activeFrom: new Date().getFullYear(),
      activeTo: new Date().getFullYear() + 4,
      adjustmentType: 'none',
      adjustmentRate: 0,
      isTaxable: true,
      person: 'A',
    }]

    const snaps = runSimulation(scenario)
    const yr0 = snaps[0]

    // Other income should appear in snapshot
    expect(yr0.totalOtherIncome).toBe(30000)
    // Total income should be higher than salary-only scenario
    expect(yr0.totalIncome).toBeGreaterThan(0)

    // Run without other income for comparison
    const scenarioNoOther = { ...scenario, otherIncome: [] }
    const snapsNo = runSimulation(scenarioNoOther)
    const yr0No = snapsNo[0]

    // Income should be higher with consulting income (after tax)
    expect(yr0.totalIncome).toBeGreaterThan(yr0No.totalIncome)
    // The difference should be less than 30k (taxed)
    const diff = yr0.totalIncome - yr0No.totalIncome
    expect(diff).toBeGreaterThan(0)
    expect(diff).toBeLessThan(30000) // reduced by marginal tax

    // After consulting ends, other income should be 0
    const afterEnd = snaps.find(s => s.year > new Date().getFullYear() + 4)
    if (afterEnd) {
      expect(afterEnd.totalOtherIncome).toBe(0)
    }
  })

  it('non-taxable other income flows to totalIncome without tax', async () => {
    const { runSimulation } = await import('../engine/simulationEngine.js')
    const { createDefaultScenario } = await import('../utils/schema.js')

    const scenario = createDefaultScenario('Non-taxable test')
    scenario.household.personA.dateOfBirth = '1980-01-01'
    scenario.household.personA.currentSalary = 0 // no salary
    scenario.household.personA.retirementAge = 65
    scenario.simulationEndAge = 70

    scenario.otherIncome = [{
      id: 'gift',
      name: 'Gift',
      amount: 50000,
      amountType: 'one_off',
      activeFrom: new Date().getFullYear(),
      activeTo: null,
      adjustmentType: 'none',
      adjustmentRate: 0,
      isTaxable: false,
      person: 'A',
    }]

    const snaps = runSimulation(scenario)
    const yr0 = snaps[0]

    // Non-taxable income should appear in full
    expect(yr0.totalOtherIncome).toBe(50000)
    // Should flow into totalIncome
    expect(yr0.totalIncome).toBeGreaterThanOrEqual(50000)

    // Year 1: one-off should be gone
    if (snaps.length > 1) {
      expect(snaps[1].totalOtherIncome).toBe(0)
    }
  })
})
