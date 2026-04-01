import { describe, it, expect } from 'vitest'
import { processTreasuryBondsYear } from '../modules/treasuryBonds.js'

const defaults = {
  currentValue: 100000,
  annualContribution: 0,
  couponRate: 0.03,
  preserveCapital: false,
  preserveCapitalFromAge: null,
  ratePeriods: [{ fromYear: 2026, toYear: 2090, rate: 0.04 }],
}

const assumptions = {
  treasuryBondsReturnRate: 0.04,
  treasuryBondsCouponRate: 0.03,
}

describe('processTreasuryBondsYear', () => {
  it('applies capital growth at rate period rate', () => {
    const result = processTreasuryBondsYear({
      bonds: defaults,
      year: 2026,
      personAge: 40,
      assumptions,
    })
    expect(result.openingValue).toBe(100000)
    expect(result.capitalGrowth).toBeCloseTo(4000, 2)
    expect(result.closingValue).toBeCloseTo(104000, 2)
    expect(result.rate).toBe(0.04)
  })

  it('computes coupon income at couponRate', () => {
    const result = processTreasuryBondsYear({
      bonds: defaults,
      year: 2026,
      personAge: 40,
      assumptions,
    })
    expect(result.couponIncome).toBeCloseTo(3000, 2)
  })

  it('coupon income has no franking credits', () => {
    const result = processTreasuryBondsYear({
      bonds: defaults,
      year: 2026,
      personAge: 40,
      assumptions,
    })
    // No franking fields in return object
    expect(result.frankingGrossUp).toBeUndefined()
    expect(result.frankingCredit).toBeUndefined()
  })

  it('applies contribution', () => {
    const result = processTreasuryBondsYear({
      bonds: defaults,
      year: 2026,
      personAge: 40,
      resolvedContribution: 5000,
      assumptions,
    })
    // 100000 + 4000 growth + 5000 contribution = 109000
    expect(result.closingValue).toBeCloseTo(109000, 2)
    expect(result.effectiveContribution).toBe(5000)
  })

  it('draws down with CGT', () => {
    const result = processTreasuryBondsYear({
      bonds: defaults,
      year: 2026,
      personAge: 40,
      drawdownNeeded: 20000,
      assumptions,
    })
    expect(result.actualDrawdown).toBe(20000)
    // CGT: 20000 * 0.5 estimated gain * 0.5 discount = 5000
    expect(result.cgtOnDrawdown).toBeCloseTo(5000, 2)
    expect(result.closingValue).toBeCloseTo(84000, 2) // 104000 - 20000
  })

  it('respects preserve capital — no drawdown', () => {
    const result = processTreasuryBondsYear({
      bonds: { ...defaults, preserveCapital: true },
      year: 2026,
      personAge: 40,
      drawdownNeeded: 20000,
      assumptions,
    })
    expect(result.actualDrawdown).toBe(0)
    expect(result.isPreservingCapital).toBe(true)
    expect(result.incomeOnly).toBeCloseTo(3000, 2)
  })

  it('preserve capital gated by age', () => {
    const bonds = { ...defaults, preserveCapital: true, preserveCapitalFromAge: 50 }
    const young = processTreasuryBondsYear({
      bonds,
      year: 2026,
      personAge: 40,
      drawdownNeeded: 10000,
      assumptions,
    })
    expect(young.isPreservingCapital).toBe(false)
    expect(young.actualDrawdown).toBe(10000)

    const old = processTreasuryBondsYear({
      bonds,
      year: 2026,
      personAge: 55,
      drawdownNeeded: 10000,
      assumptions,
    })
    expect(old.isPreservingCapital).toBe(true)
    expect(old.actualDrawdown).toBe(0)
  })

  it('drawdown cannot exceed available value', () => {
    const result = processTreasuryBondsYear({
      bonds: { ...defaults, currentValue: 5000 },
      year: 2026,
      personAge: 40,
      drawdownNeeded: 100000,
      assumptions,
    })
    // 5000 + 200 growth = 5200 available
    expect(result.actualDrawdown).toBeCloseTo(5200, 2)
    expect(result.closingValue).toBe(0)
  })

  it('falls back to assumption coupon rate when couponRate missing', () => {
    const bonds = { ...defaults, couponRate: undefined }
    const result = processTreasuryBondsYear({
      bonds,
      year: 2026,
      personAge: 40,
      assumptions,
    })
    expect(result.couponIncome).toBeCloseTo(3000, 2)
  })
})
