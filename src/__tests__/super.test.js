import { describe, it, expect } from 'vitest'
import {
  getSGRate,
  getMinDrawdownRate,
  hasReachedPreservationAge,
  processContributions,
  growSuperBalance,
} from '../modules/super.js'

// ── getSGRate ──────────────────────────────────────────────────────────────
// Schedule: FY2025 = 11.5%, FY2026+ = 12%

describe('getSGRate', () => {
  it('returns 11.5% for FY2025', () => {
    expect(getSGRate(2025)).toBe(0.115)
  })

  it('returns 12% from FY2026 onwards', () => {
    expect(getSGRate(2026)).toBe(0.12)
    expect(getSGRate(2030)).toBe(0.12)
    expect(getSGRate(2050)).toBe(0.12)
  })
})

// ── getMinDrawdownRate ────────────────────────────────────────────────────
// ATO minimum pension drawdown rates by age bracket

describe('getMinDrawdownRate', () => {
  it('returns 4% for ages under 65', () => {
    expect(getMinDrawdownRate(60)).toBe(0.04)
    expect(getMinDrawdownRate(64)).toBe(0.04)
  })

  it('returns 5% for ages 65–74', () => {
    expect(getMinDrawdownRate(65)).toBe(0.05)
    expect(getMinDrawdownRate(70)).toBe(0.05)
    expect(getMinDrawdownRate(74)).toBe(0.05)
  })

  it('returns 6% for ages 75–79', () => {
    expect(getMinDrawdownRate(75)).toBe(0.06)
    expect(getMinDrawdownRate(79)).toBe(0.06)
  })

  it('returns 7% for ages 80–84', () => {
    expect(getMinDrawdownRate(80)).toBe(0.07)
  })

  it('returns 9% for ages 85–89', () => {
    expect(getMinDrawdownRate(85)).toBe(0.09)
  })

  it('returns 14% for age 90+', () => {
    expect(getMinDrawdownRate(90)).toBe(0.14)
    expect(getMinDrawdownRate(100)).toBe(0.14)
  })
})

// ── hasReachedPreservationAge ─────────────────────────────────────────────

describe('hasReachedPreservationAge', () => {
  it('returns false below preservation age (60)', () => {
    expect(hasReachedPreservationAge(59)).toBe(false)
  })

  it('returns true at preservation age', () => {
    expect(hasReachedPreservationAge(60)).toBe(true)
  })

  it('returns true above preservation age', () => {
    expect(hasReachedPreservationAge(65)).toBe(true)
  })
})

// ── processContributions ─────────────────────────────────────────────────

describe('processContributions', () => {
  const baseProfile = {
    employerScheme: 'sg',
    salarySacrificeAmount: 0,
    voluntaryConcessional: 0,
    voluntaryNonConcessional: 0,
  }

  it('calculates SG contribution at 12% for FY2026', () => {
    const result = processContributions(baseProfile, 100_000, 2026)
    expect(result.employerContrib).toBeCloseTo(12_000, 0)
  })

  it('applies 15% contributions tax on concessional amounts', () => {
    const result = processContributions(baseProfile, 100_000, 2026)
    // SG = 12,000 → net to fund = 12,000 * 0.85 = 10,200
    expect(result.totalNetToFund).toBeCloseTo(10_200, 0)
  })

  it('adds salary sacrifice to concessional total', () => {
    const profile = { ...baseProfile, salarySacrificeAmount: 10_000 }
    const result = processContributions(profile, 100_000, 2026)
    // SG 12,000 + sacrifice 10,000 = 22,000 concessional
    expect(result.totalConcessional).toBeCloseTo(22_000, 0)
    expect(result.concessionalBreached).toBe(false)
  })

  it('warns when concessional cap ($30,000) is breached', () => {
    // SG 12,000 + sacrifice 20,000 = 32,000 → breach
    const profile = { ...baseProfile, salarySacrificeAmount: 20_000 }
    const result = processContributions(profile, 100_000, 2026)
    expect(result.totalConcessional).toBeCloseTo(32_000, 0)
    expect(result.concessionalBreached).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('warns when non-concessional cap ($110,000) is breached', () => {
    const profile = { ...baseProfile, voluntaryNonConcessional: 120_000 }
    const result = processContributions(profile, 100_000, 2026)
    expect(result.nonConcessionalBreached).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('non-concessional contributions enter fund without contributions tax', () => {
    const profile = { ...baseProfile, voluntaryNonConcessional: 50_000 }
    const result = processContributions(profile, 100_000, 2026)
    // NCC goes in at face value, only concessional is taxed
    expect(result.totalNetToFund).toBeCloseTo(10_200 + 50_000, 0)
  })
})

// ── growSuperBalance ──────────────────────────────────────────────────────

describe('growSuperBalance', () => {
  const baseAssumptions = {
    superAccumulationRate: 0.07,
    superPensionRate: 0.06,
  }

  it('grows correctly in accumulation phase', () => {
    const result = growSuperBalance({
      openingBalance: 500_000,
      contributions: 10_000,
      superProfile: { ratePeriods: [], isTTR: false },
      year: 2026,
      personAge: 55,
      retirementYear: 2040,
      assumptions: baseAssumptions,
    })
    // (500,000 + 10,000) * 1.07 = 545,700
    expect(result.grownBalance).toBeCloseTo(545_700, 0)
    expect(result.drawdown).toBe(0)
    expect(result.closingBalance).toBeCloseTo(545_700, 0)
    expect(result.isLocked).toBe(true)
    expect(result.inPensionPhase).toBe(false)
  })

  it('applies minimum drawdown in pension phase', () => {
    // Age 70 → 5% drawdown
    const result = growSuperBalance({
      openingBalance: 500_000,
      contributions: 0,
      superProfile: { ratePeriods: [], isTTR: false },
      year: 2026,
      personAge: 70,
      retirementYear: 2020, // already retired
      assumptions: baseAssumptions,
    })
    // Grows at 6% pension rate: 500,000 * 1.06 = 530,000
    expect(result.grownBalance).toBeCloseTo(530_000, 0)
    expect(result.inPensionPhase).toBe(true)
    // Drawdown at 5% of grown balance: 530,000 * 0.05 = 26,500
    expect(result.drawdown).toBeCloseTo(26_500, 0)
    expect(result.closingBalance).toBeCloseTo(503_500, 0)
    expect(result.isLocked).toBe(false)
  })

  it('uses pension rate (6%) not accumulation rate (7%) in pension phase', () => {
    const pension = growSuperBalance({
      openingBalance: 500_000,
      contributions: 0,
      superProfile: { ratePeriods: [], isTTR: false },
      year: 2026,
      personAge: 70,
      retirementYear: 2020,
      assumptions: baseAssumptions,
    })
    const accum = growSuperBalance({
      openingBalance: 500_000,
      contributions: 0,
      superProfile: { ratePeriods: [], isTTR: false },
      year: 2026,
      personAge: 55,
      retirementYear: 2040,
      assumptions: baseAssumptions,
    })
    expect(pension.rate).toBe(0.06)
    expect(accum.rate).toBe(0.07)
  })

  it('balance cannot go below zero', () => {
    const result = growSuperBalance({
      openingBalance: 0,
      contributions: 0,
      superProfile: { ratePeriods: [], isTTR: false },
      year: 2026,
      personAge: 95,
      retirementYear: 2000,
      assumptions: baseAssumptions,
    })
    expect(result.closingBalance).toBeGreaterThanOrEqual(0)
  })

  it('remains locked below preservation age', () => {
    const result = growSuperBalance({
      openingBalance: 200_000,
      contributions: 5_000,
      superProfile: { ratePeriods: [], isTTR: false },
      year: 2026,
      personAge: 45,
      retirementYear: 2045,
      assumptions: baseAssumptions,
    })
    expect(result.isLocked).toBe(true)
  })

  it('does NOT enter pension phase if retired but below preservation age', () => {
    // Retired early (e.g. retirementYear 2020) but only age 45 — super must stay locked
    const result = growSuperBalance({
      openingBalance: 500_000,
      contributions: 0,
      superProfile: { ratePeriods: [], isTTR: false },
      year: 2026,
      personAge: 45,
      retirementYear: 2020, // already retired
      assumptions: baseAssumptions,
    })
    expect(result.inPensionPhase).toBe(false)
    expect(result.drawdown).toBe(0)
    expect(result.isLocked).toBe(true)
    // Must grow at accumulation rate, not pension rate
    expect(result.rate).toBe(baseAssumptions.superAccumulationRate)
  })
})
