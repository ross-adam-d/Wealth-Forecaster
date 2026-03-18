import { describe, it, expect } from 'vitest'
import { processSharesYear } from '../modules/shares.js'

const assumptions = { sharesReturnRate: 0.08 }

const baseShares = {
  currentValue: 100_000,
  annualContribution: 0,
  dividendYield: 0.035,
  frankingPct: 0.70,
  preserveCapital: false,
  preserveCapitalFromAge: null,
  ratePeriods: [{ fromYear: 2026, toYear: 2090, rate: 0.08 }],
}

describe('processSharesYear', () => {
  it('grows portfolio at specified rate', () => {
    const result = processSharesYear({ shares: baseShares, year: 2026, personAge: 50, assumptions })
    // Capital growth = 100,000 * 0.08 = 8,000
    expect(result.capitalGrowth).toBeCloseTo(8_000, 0)
    expect(result.closingValue).toBeCloseTo(108_000, 0)
  })

  it('calculates cash dividends from opening value', () => {
    const result = processSharesYear({ shares: baseShares, year: 2026, personAge: 50, assumptions })
    // 100,000 * 0.035 = 3,500
    expect(result.cashDividend).toBeCloseTo(3_500, 0)
  })

  it('calculates franking credit correctly (70% franked)', () => {
    const result = processSharesYear({ shares: baseShares, year: 2026, personAge: 50, assumptions })
    // 3,500 * 0.70 * (0.30 / 0.70) = 3,500 * 0.30 = 1,050
    expect(result.frankingCredit).toBeCloseTo(1_050, 0)
  })

  it('returns zero franking credit for unfranked shares', () => {
    const unfranked = { ...baseShares, frankingPct: 0 }
    const result = processSharesYear({ shares: unfranked, year: 2026, personAge: 50, assumptions })
    expect(result.frankingCredit).toBe(0)
  })

  it('adds annual contribution to closing value', () => {
    const withContrib = { ...baseShares, annualContribution: 10_000 }
    const result = processSharesYear({ shares: withContrib, year: 2026, personAge: 50, assumptions })
    // 108,000 + 10,000 = 118,000
    expect(result.closingValue).toBeCloseTo(118_000, 0)
    expect(result.totalInflow).toBe(10_000)
  })

  it('draws down from portfolio when needed', () => {
    const result = processSharesYear({
      shares: baseShares,
      year: 2026,
      personAge: 65,
      drawdownNeeded: 10_000,
      assumptions,
    })
    expect(result.actualDrawdown).toBe(10_000)
    expect(result.closingValue).toBeCloseTo(108_000 - 10_000, 0)
  })

  it('does not drawdown beyond available value', () => {
    const result = processSharesYear({
      shares: { ...baseShares, currentValue: 5_000 },
      year: 2026,
      personAge: 65,
      drawdownNeeded: 50_000,
      assumptions,
    })
    expect(result.actualDrawdown).toBeLessThanOrEqual(result.closingValue + result.actualDrawdown)
    expect(result.closingValue).toBeGreaterThanOrEqual(0)
  })

  it('does not drawdown when preserve capital is active', () => {
    const preserved = { ...baseShares, preserveCapital: true }
    const result = processSharesYear({
      shares: preserved,
      year: 2026,
      personAge: 65,
      drawdownNeeded: 10_000,
      assumptions,
    })
    expect(result.actualDrawdown).toBe(0)
    expect(result.isPreservingCapital).toBe(true)
  })

  it('allows drawdown when preserve capital age not yet reached', () => {
    const ageGated = { ...baseShares, preserveCapital: true, preserveCapitalFromAge: 70 }
    const result = processSharesYear({
      shares: ageGated,
      year: 2026,
      personAge: 65, // below the gate age
      drawdownNeeded: 10_000,
      assumptions,
    })
    expect(result.actualDrawdown).toBe(10_000)
    expect(result.isPreservingCapital).toBe(false)
  })

  it('preserves capital once age threshold is reached', () => {
    const ageGated = { ...baseShares, preserveCapital: true, preserveCapitalFromAge: 65 }
    const result = processSharesYear({
      shares: ageGated,
      year: 2026,
      personAge: 65,
      drawdownNeeded: 10_000,
      assumptions,
    })
    expect(result.isPreservingCapital).toBe(true)
    expect(result.actualDrawdown).toBe(0)
  })

  it('uses rate from rate periods, not assumptions fallback', () => {
    const customRate = { ...baseShares, ratePeriods: [{ fromYear: 2020, toYear: 2090, rate: 0.10 }] }
    const result = processSharesYear({ shares: customRate, year: 2026, personAge: 50, assumptions })
    expect(result.rate).toBe(0.10)
    expect(result.capitalGrowth).toBeCloseTo(10_000, 0)
  })

  it('calculates CGT on drawdown (approximate cost basis)', () => {
    const result = processSharesYear({
      shares: baseShares,
      year: 2026,
      personAge: 65,
      drawdownNeeded: 10_000,
      assumptions,
    })
    // cgtOnDrawdown > 0 when there's a drawdown
    expect(result.cgtOnDrawdown).toBeGreaterThan(0)
  })
})
