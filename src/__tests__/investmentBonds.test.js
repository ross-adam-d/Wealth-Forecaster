import { describe, it, expect } from 'vitest'
import { processBondYear } from '../modules/investmentBonds.js'

const assumptions = {}

const baseBond = {
  currentBalance: 50_000,
  annualContribution: 5_000,
  inceptionDate: '2026-01-01',
  ratePeriods: [{ fromYear: 2026, toYear: 2090, rate: 0.07 }],
  priorYearContribution: 0,
}

describe('processBondYear', () => {
  describe('growth and internal tax', () => {
    it('applies 30% internal tax on gross earnings', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, assumptions })
      // grossEarnings = (50,000 + 5,000) * 0.07 = 3,850
      expect(result.grossEarnings).toBeCloseTo(3_850, 0)
      expect(result.internalTax).toBeCloseTo(3_850 * 0.30, 0)
      expect(result.netEarnings).toBeCloseTo(3_850 * 0.70, 0)
    })

    it('closing balance = opening + contribution + net earnings', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, assumptions })
      // 50,000 + 5,000 + 2,695 = 57,695
      expect(result.closingBalance).toBeCloseTo(50_000 + 5_000 + result.netEarnings, 0)
    })
  })

  describe('10-year threshold tracking', () => {
    it('correctly identifies bond not yet tax-free', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, assumptions })
      // inception 2026, year 2026 → 0 years elapsed
      expect(result.isTaxFree).toBe(false)
      expect(result.yearsElapsed).toBe(0)
    })

    it('correctly identifies bond as tax-free after 10 years', () => {
      const matureBond = { ...baseBond, inceptionDate: '2014-01-01' }
      const result = processBondYear({ bond: matureBond, year: 2026, assumptions })
      // inception 2014, year 2026 → 12 years elapsed
      expect(result.isTaxFree).toBe(true)
      expect(result.yearsElapsed).toBeGreaterThanOrEqual(10)
    })

    it('emits milestone warning when bond reaches 10-year threshold this year', () => {
      const nearMatureBond = { ...baseBond, inceptionDate: '2016-01-01' }
      const result = processBondYear({ bond: nearMatureBond, year: 2026, assumptions })
      // inception 2016, year 2026 → exactly 10 years
      expect(result.isTaxFree).toBe(true)
      expect(result.warnings.some(w => w.includes('10-year threshold'))).toBe(true)
    })
  })

  describe('125% contribution rule', () => {
    it('allows any contribution in first year (no prior year)', () => {
      const result = processBondYear({ bond: { ...baseBond, priorYearContribution: 0 }, year: 2026, assumptions })
      expect(result.effectiveContribution).toBe(5_000)
      expect(result.excessContribution).toBe(0)
    })

    it('caps contribution at 125% of prior year when prior year > 0', () => {
      const bond = { ...baseBond, priorYearContribution: 5_000, annualContribution: 7_000 }
      const result = processBondYear({ bond, year: 2027, assumptions })
      // Max = 5,000 * 1.25 = 6,250
      expect(result.effectiveContribution).toBeCloseTo(6_250, 0)
      expect(result.excessContribution).toBeCloseTo(750, 0)
    })

    it('issues warning on 125% rule breach', () => {
      const bond = { ...baseBond, priorYearContribution: 5_000, annualContribution: 7_000 }
      const result = processBondYear({ bond, year: 2027, assumptions })
      expect(result.warnings.some(w => w.includes('125%'))).toBe(true)
    })

    it('does not breach if within 125% of prior year', () => {
      const bond = { ...baseBond, priorYearContribution: 5_000, annualContribution: 6_250 }
      const result = processBondYear({ bond, year: 2027, assumptions })
      expect(result.effectiveContribution).toBe(6_250)
      expect(result.excessContribution).toBe(0)
    })
  })

  describe('withdrawals', () => {
    it('no assessable income or tax offset on tax-free withdrawal', () => {
      const matureBond = { ...baseBond, inceptionDate: '2010-01-01' }
      const result = processBondYear({ bond: matureBond, year: 2026, drawdownNeeded: 10_000, assumptions })
      expect(result.isTaxFree).toBe(true)
      expect(result.assessableIncome).toBe(0)
      expect(result.taxOffset).toBe(0)
      expect(result.clockReset).toBe(false)
    })

    it('pre-10yr withdrawal adds earnings component to assessable income', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, drawdownNeeded: 10_000, assumptions })
      expect(result.isTaxFree).toBe(false)
      expect(result.assessableIncome).toBeGreaterThan(0)
      expect(result.clockReset).toBe(true)
    })

    it('pre-10yr withdrawal provides 30% tax offset to avoid double-taxation', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, drawdownNeeded: 10_000, assumptions })
      // taxOffset = earningsWithdrawn * 0.30
      expect(result.taxOffset).toBeCloseTo(result.assessableIncome * 0.30, 2)
    })

    it('pre-10yr withdrawal resets 10-year clock', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, drawdownNeeded: 10_000, assumptions })
      expect(result.clockReset).toBe(true)
    })

    it('warns on pre-10yr withdrawal', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, drawdownNeeded: 10_000, assumptions })
      expect(result.warnings.some(w => w.includes('RESET'))).toBe(true)
    })

    it('withdrawal cannot exceed available balance', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, drawdownNeeded: 200_000, assumptions })
      expect(result.withdrawal).toBeLessThanOrEqual(result.openingBalance + result.effectiveContribution + result.netEarnings)
      expect(result.closingBalance).toBeGreaterThanOrEqual(0)
    })

    it('no withdrawal when drawdownNeeded is 0', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, drawdownNeeded: 0, assumptions })
      expect(result.withdrawal).toBe(0)
      expect(result.clockReset).toBe(false)
    })
  })

  describe('resolvedContribution parameter', () => {
    it('uses resolvedContribution instead of annualContribution when provided', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, resolvedContribution: 10_000, assumptions })
      // Growth = (50,000 + 10,000) * 0.07 = 4,200
      expect(result.grossEarnings).toBeCloseTo(4_200, 0)
      expect(result.effectiveContribution).toBe(10_000)
    })

    it('falls back to annualContribution when resolvedContribution is null', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, resolvedContribution: null, assumptions })
      expect(result.effectiveContribution).toBe(5_000)
    })

    it('allows zero resolvedContribution (surplus mode with no surplus)', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, resolvedContribution: 0, assumptions })
      expect(result.effectiveContribution).toBe(0)
      // Growth = 50,000 * 0.07 = 3,500
      expect(result.grossEarnings).toBeCloseTo(3_500, 0)
    })

    it('applies 125% cap to resolvedContribution', () => {
      const bond = { ...baseBond, priorYearContribution: 5_000 }
      const result = processBondYear({ bond, year: 2027, resolvedContribution: 8_000, assumptions })
      // Max = 5,000 * 1.25 = 6,250
      expect(result.effectiveContribution).toBeCloseTo(6_250, 0)
      expect(result.excessContribution).toBeCloseTo(1_750, 0)
    })
  })

  describe('liquidity tagging', () => {
    it('tags pre-10yr bond as accessible with tax penalty', () => {
      const result = processBondYear({ bond: baseBond, year: 2026, assumptions })
      expect(result.liquidityTag).toBe('accessible_pre10yr_tax_penalty')
    })

    it('tags post-10yr bond as tax free', () => {
      const matureBond = { ...baseBond, inceptionDate: '2010-01-01' }
      const result = processBondYear({ bond: matureBond, year: 2026, assumptions })
      expect(result.liquidityTag).toBe('tax_free')
    })
  })
})
