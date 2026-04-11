import { describe, it, expect } from 'vitest'
import { aggregateHoldings, distributeProportionally, projectHoldings } from '../utils/holdings.js'

describe('aggregateHoldings', () => {
  it('returns null for empty or missing holdings', () => {
    expect(aggregateHoldings([])).toBe(null)
    expect(aggregateHoldings(null)).toBe(null)
    expect(aggregateHoldings(undefined)).toBe(null)
  })

  it('returns null when total value is 0 (caller falls back to top-level value)', () => {
    // Holdings with zero values should not override the category-level currentValue —
    // this happens e.g. when tickers are entered but live prices haven't loaded yet.
    expect(aggregateHoldings([{ currentValue: 0, returnRate: 0.05 }])).toBe(null)
    expect(aggregateHoldings([{ currentValue: 0 }, { currentValue: 0 }])).toBe(null)
  })

  it('computes weighted average for shares holdings', () => {
    const holdings = [
      { currentValue: 60000, returnRate: 0.08, dividendYield: 0.04, frankingPct: 0.70 },
      { currentValue: 40000, returnRate: 0.06, dividendYield: 0.02, frankingPct: 0.50 },
    ]
    const result = aggregateHoldings(holdings)
    expect(result.currentValue).toBe(100000)
    // 60% * 0.08 + 40% * 0.06 = 0.072
    expect(result.returnRate).toBeCloseTo(0.072, 6)
    // 60% * 0.04 + 40% * 0.02 = 0.032
    expect(result.dividendYield).toBeCloseTo(0.032, 6)
    // 60% * 0.70 + 40% * 0.50 = 0.62
    expect(result.frankingPct).toBeCloseTo(0.62, 6)
  })

  it('computes weighted average for treasury bond holdings with couponRate', () => {
    const holdings = [
      { currentValue: 30000, returnRate: 0.04, couponRate: 0.03 },
      { currentValue: 70000, returnRate: 0.05, couponRate: 0.04 },
    ]
    const result = aggregateHoldings(holdings)
    expect(result.currentValue).toBe(100000)
    // 30% * 0.04 + 70% * 0.05 = 0.047
    expect(result.returnRate).toBeCloseTo(0.047, 6)
    // 30% * 0.03 + 70% * 0.04 = 0.037
    expect(result.couponRate).toBeCloseTo(0.037, 6)
  })

  it('uses custom rateField for super pension phase', () => {
    const holdings = [
      { currentValue: 80000, returnRate: 0.08, pensionReturnRate: 0.05 },
      { currentValue: 20000, returnRate: 0.04, pensionReturnRate: 0.03 },
    ]
    const result = aggregateHoldings(holdings, 'pensionReturnRate')
    // 80% * 0.05 + 20% * 0.03 = 0.046
    expect(result.returnRate).toBeCloseTo(0.046, 6)
  })

  it('handles single holding', () => {
    const holdings = [{ currentValue: 50000, returnRate: 0.07, dividendYield: 0.035 }]
    const result = aggregateHoldings(holdings)
    expect(result.currentValue).toBe(50000)
    expect(result.returnRate).toBeCloseTo(0.07, 6)
    expect(result.dividendYield).toBeCloseTo(0.035, 6)
  })

  it('ignores missing optional fields gracefully', () => {
    const holdings = [{ currentValue: 10000, returnRate: 0.05 }]
    const result = aggregateHoldings(holdings)
    expect(result.dividendYield).toBe(0)
    expect(result.frankingPct).toBe(0)
    expect(result.couponRate).toBe(0)
  })
})

describe('distributeProportionally', () => {
  it('returns empty array for no holdings', () => {
    expect(distributeProportionally([], 1000)).toEqual([])
    expect(distributeProportionally(null, 1000)).toEqual([])
  })

  it('distributes by weight', () => {
    const holdings = [
      { currentValue: 60000 },
      { currentValue: 40000 },
    ]
    const result = distributeProportionally(holdings, 10000)
    expect(result[0]).toBeCloseTo(6000, 2)
    expect(result[1]).toBeCloseTo(4000, 2)
  })

  it('distributes equally when all values are 0', () => {
    const holdings = [
      { currentValue: 0 },
      { currentValue: 0 },
      { currentValue: 0 },
    ]
    const result = distributeProportionally(holdings, 9000)
    expect(result[0]).toBeCloseTo(3000, 2)
    expect(result[1]).toBeCloseTo(3000, 2)
    expect(result[2]).toBeCloseTo(3000, 2)
  })

  it('handles negative amounts (drawdown)', () => {
    const holdings = [
      { currentValue: 75000 },
      { currentValue: 25000 },
    ]
    const result = distributeProportionally(holdings, -10000)
    expect(result[0]).toBeCloseTo(-7500, 2)
    expect(result[1]).toBeCloseTo(-2500, 2)
  })
})

describe('projectHoldings', () => {
  it('returns empty array for no holdings', () => {
    expect(projectHoldings([], 100000, 5)).toEqual([])
    expect(projectHoldings(null, 100000, 5)).toEqual([])
  })

  it('projects holdings forward and normalises to category total', () => {
    const holdings = [
      { currentValue: 50000, returnRate: 0.10 },  // grows faster
      { currentValue: 50000, returnRate: 0.05 },  // grows slower
    ]
    const categoryClosing = 150000
    const result = projectHoldings(holdings, categoryClosing, 5)

    // Faster grower should have more than 50% of the pie
    expect(result[0].projectedValue).toBeGreaterThan(75000)
    expect(result[1].projectedValue).toBeLessThan(75000)

    // Sum should equal category closing
    const sum = result.reduce((s, h) => s + h.projectedValue, 0)
    expect(sum).toBeCloseTo(categoryClosing, 2)
  })

  it('distributes equally when all values are 0', () => {
    const holdings = [
      { currentValue: 0, returnRate: 0.05 },
      { currentValue: 0, returnRate: 0.08 },
    ]
    const result = projectHoldings(holdings, 100000, 10)
    expect(result[0].projectedValue).toBeCloseTo(50000, 2)
    expect(result[1].projectedValue).toBeCloseTo(50000, 2)
  })

  it('uses custom rateField', () => {
    const holdings = [
      { currentValue: 50000, returnRate: 0.08, pensionReturnRate: 0.04 },
      { currentValue: 50000, returnRate: 0.08, pensionReturnRate: 0.06 },
    ]
    const result = projectHoldings(holdings, 100000, 10, 'pensionReturnRate')
    // Holding with 6% pension rate should have more than holding with 4%
    expect(result[1].projectedValue).toBeGreaterThan(result[0].projectedValue)
  })

  it('preserves original holding fields', () => {
    const holdings = [
      { id: 'abc', name: 'VAS', currentValue: 50000, returnRate: 0.07 },
    ]
    const result = projectHoldings(holdings, 60000, 1)
    expect(result[0].id).toBe('abc')
    expect(result[0].name).toBe('VAS')
    expect(result[0].projectedValue).toBeCloseTo(60000, 2)
  })
})
