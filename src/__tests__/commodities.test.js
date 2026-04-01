import { describe, it, expect } from 'vitest'
import { processCommoditiesYear } from '../modules/commodities.js'

const defaults = {
  currentValue: 100000,
  annualContribution: 0,
  ratePeriods: [{ fromYear: 2026, toYear: 2090, rate: 0.05 }],
}

const assumptions = {
  commoditiesReturnRate: 0.05,
}

describe('processCommoditiesYear', () => {
  it('applies capital growth only — no income', () => {
    const result = processCommoditiesYear({
      commodities: defaults,
      year: 2026,
      assumptions,
    })
    expect(result.openingValue).toBe(100000)
    expect(result.capitalGrowth).toBeCloseTo(5000, 2)
    expect(result.closingValue).toBeCloseTo(105000, 2)
    expect(result.rate).toBe(0.05)
    // No income fields
    expect(result.couponIncome).toBeUndefined()
    expect(result.cashDividend).toBeUndefined()
  })

  it('applies contribution', () => {
    const result = processCommoditiesYear({
      commodities: defaults,
      year: 2026,
      resolvedContribution: 10000,
      assumptions,
    })
    // 100000 + 5000 growth + 10000 contribution = 115000
    expect(result.closingValue).toBeCloseTo(115000, 2)
    expect(result.effectiveContribution).toBe(10000)
  })

  it('draws down with CGT', () => {
    const result = processCommoditiesYear({
      commodities: defaults,
      year: 2026,
      drawdownNeeded: 30000,
      assumptions,
    })
    expect(result.actualDrawdown).toBe(30000)
    // CGT: 30000 * 0.5 * 0.5 = 7500
    expect(result.cgtOnDrawdown).toBeCloseTo(7500, 2)
    expect(result.closingValue).toBeCloseTo(75000, 2) // 105000 - 30000
  })

  it('drawdown cannot exceed available value', () => {
    const result = processCommoditiesYear({
      commodities: { ...defaults, currentValue: 3000 },
      year: 2026,
      drawdownNeeded: 100000,
      assumptions,
    })
    // 3000 + 150 growth = 3150 available
    expect(result.actualDrawdown).toBeCloseTo(3150, 2)
    expect(result.closingValue).toBe(0)
  })

  it('no drawdown when not needed', () => {
    const result = processCommoditiesYear({
      commodities: defaults,
      year: 2026,
      drawdownNeeded: 0,
      assumptions,
    })
    expect(result.actualDrawdown).toBe(0)
    expect(result.cgtOnDrawdown).toBe(0)
  })

  it('zero value scenario — no growth', () => {
    const result = processCommoditiesYear({
      commodities: { ...defaults, currentValue: 0 },
      year: 2026,
      assumptions,
    })
    expect(result.capitalGrowth).toBe(0)
    expect(result.closingValue).toBe(0)
  })

  it('uses assumption rate as fallback', () => {
    const noRatePeriods = { ...defaults, ratePeriods: [] }
    const result = processCommoditiesYear({
      commodities: noRatePeriods,
      year: 2026,
      assumptions,
    })
    expect(result.rate).toBe(0.05) // falls back to assumption
    expect(result.capitalGrowth).toBeCloseTo(5000, 2)
  })
})
