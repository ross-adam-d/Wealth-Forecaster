import { describe, it, expect } from 'vitest'
import { resolveRatePeriodRate, validateRatePeriods } from '../engine/ratePeriodEngine.js'

describe('resolveRatePeriodRate', () => {
  const singlePeriod = [{ fromYear: 2026, toYear: 2090, rate: 0.07 }]

  it('resolves rate within a single period', () => {
    expect(resolveRatePeriodRate(singlePeriod, 2026)).toBe(0.07)
    expect(resolveRatePeriodRate(singlePeriod, 2050)).toBe(0.07)
    expect(resolveRatePeriodRate(singlePeriod, 2090)).toBe(0.07)
  })

  it('returns fallback rate when year is before all periods', () => {
    expect(resolveRatePeriodRate(singlePeriod, 2025, 0.05)).toBe(0.05)
  })

  it('uses last period rate when year is beyond all periods', () => {
    expect(resolveRatePeriodRate(singlePeriod, 2095)).toBe(0.07)
  })

  it('returns fallback for empty rate periods', () => {
    expect(resolveRatePeriodRate([], 2030, 0.05)).toBe(0.05)
    expect(resolveRatePeriodRate(null, 2030, 0.05)).toBe(0.05)
  })

  it('resolves correct period in multi-period scenario', () => {
    const periods = [
      { fromYear: 2026, toYear: 2030, rate: 0.08 },
      { fromYear: 2031, toYear: 2060, rate: 0.06 },
    ]
    expect(resolveRatePeriodRate(periods, 2028)).toBe(0.08)
    expect(resolveRatePeriodRate(periods, 2031)).toBe(0.06)
    expect(resolveRatePeriodRate(periods, 2050)).toBe(0.06)
  })

  it('uses last period rate beyond all defined periods in multi-period', () => {
    const periods = [
      { fromYear: 2026, toYear: 2030, rate: 0.08 },
      { fromYear: 2031, toYear: 2060, rate: 0.06 },
    ]
    expect(resolveRatePeriodRate(periods, 2070)).toBe(0.06)
  })

  it('handles boundary years correctly', () => {
    const periods = [
      { fromYear: 2026, toYear: 2030, rate: 0.08 },
      { fromYear: 2031, toYear: 2060, rate: 0.06 },
    ]
    expect(resolveRatePeriodRate(periods, 2030)).toBe(0.08)
    expect(resolveRatePeriodRate(periods, 2031)).toBe(0.06)
  })
})

describe('validateRatePeriods', () => {
  it('returns valid for period covering full sim range', () => {
    const periods = [{ fromYear: 2026, toYear: 2115, rate: 0.07 }]
    const result = validateRatePeriods(periods, 2026, 2115)
    expect(result.valid).toBe(true)
    expect(result.gaps).toHaveLength(0)
  })

  it('identifies gap at start of simulation', () => {
    const periods = [{ fromYear: 2030, toYear: 2090, rate: 0.07 }]
    const result = validateRatePeriods(periods, 2026, 2090)
    expect(result.valid).toBe(false)
    expect(result.gaps[0]).toEqual({ from: 2026, to: 2029 })
  })

  it('identifies gap between periods', () => {
    const periods = [
      { fromYear: 2026, toYear: 2030, rate: 0.08 },
      { fromYear: 2033, toYear: 2090, rate: 0.06 },
    ]
    const result = validateRatePeriods(periods, 2026, 2090)
    expect(result.valid).toBe(false)
    expect(result.gaps).toContainEqual({ from: 2031, to: 2032 })
  })

  it('returns invalid with full gap for empty periods', () => {
    const result = validateRatePeriods([], 2026, 2090)
    expect(result.valid).toBe(false)
  })
})
