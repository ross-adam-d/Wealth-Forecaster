import { describe, it, expect } from 'vitest'
import { parseYearMonth, yearFraction, extractYear } from '../utils/format.js'

// ── parseYearMonth ──────────────────────────────────────────────────────────

describe('parseYearMonth', () => {
  it('parses a plain year number', () => {
    expect(parseYearMonth(2030)).toEqual({ year: 2030, month: null })
  })

  it('parses a "YYYY" string', () => {
    expect(parseYearMonth('2030')).toEqual({ year: 2030, month: null })
  })

  it('parses a "YYYY-MM" string', () => {
    expect(parseYearMonth('2030-09')).toEqual({ year: 2030, month: 9 })
  })

  it('rejects invalid month', () => {
    expect(parseYearMonth('2030-13')).toEqual({ year: 2030, month: null })
    expect(parseYearMonth('2030-00')).toEqual({ year: 2030, month: null })
  })

  it('returns null for null/undefined', () => {
    expect(parseYearMonth(null)).toBeNull()
    expect(parseYearMonth(undefined)).toBeNull()
  })

  it('returns null for non-numeric string', () => {
    expect(parseYearMonth('abc')).toBeNull()
  })
})

// ── extractYear ─────────────────────────────────────────────────────────────

describe('extractYear', () => {
  it('extracts year from number', () => {
    expect(extractYear(2030)).toBe(2030)
  })

  it('extracts year from "YYYY-MM" string', () => {
    expect(extractYear('2030-09')).toBe(2030)
  })

  it('returns null for null', () => {
    expect(extractYear(null)).toBeNull()
  })
})

// ── yearFraction ────────────────────────────────────────────────────────────

describe('yearFraction', () => {
  it('returns 1 when no boundaries', () => {
    expect(yearFraction(2030, null, null)).toBe(1)
  })

  it('returns 1 when year is fully inside boundaries', () => {
    expect(yearFraction(2030, 2028, 2032)).toBe(1)
  })

  it('returns 0 before start year', () => {
    expect(yearFraction(2025, 2030, 2035)).toBe(0)
  })

  it('returns 0 after end year', () => {
    expect(yearFraction(2036, 2030, 2035)).toBe(0)
  })

  it('pro-rates start year with month precision', () => {
    // Starting in September: Sep-Dec = 4 months = 4/12
    expect(yearFraction(2030, '2030-09', null)).toBeCloseTo(4 / 12)
  })

  it('pro-rates end year with month precision', () => {
    // Ending in March: Jan-Mar = 3 months = 3/12
    expect(yearFraction(2035, null, '2035-03')).toBeCloseTo(3 / 12)
  })

  it('pro-rates both start and end in the same year', () => {
    // Mar-Sep = 7 months = 7/12
    expect(yearFraction(2030, '2030-03', '2030-09')).toBeCloseTo(7 / 12)
  })

  it('returns 0 if start month is after end month in same year', () => {
    expect(yearFraction(2030, '2030-09', '2030-03')).toBe(0)
  })

  it('handles plain year start with month end', () => {
    // Year 2035 ends in June: Jan-Jun = 6/12
    expect(yearFraction(2035, 2030, '2035-06')).toBeCloseTo(6 / 12)
  })

  it('handles month start with plain year end', () => {
    // Year 2030 starts in July: Jul-Dec = 6/12
    expect(yearFraction(2030, '2030-07', 2035)).toBeCloseTo(6 / 12)
  })
})
