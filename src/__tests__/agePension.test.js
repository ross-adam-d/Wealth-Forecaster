import { describe, it, expect } from 'vitest'
import {
  calcDeemedIncome,
  calcAssetTestPension,
  calcIncomeTestPension,
  calcAgePension,
} from '../modules/agePension.js'
import {
  AGE_PENSION_MAX_SINGLE,
  AGE_PENSION_MAX_COUPLE,
  DEEMING_THRESHOLD_SINGLE,
} from '../constants/index.js'

// ── calcDeemedIncome ────────────────────────────────────────────────────

describe('calcDeemedIncome', () => {
  it('returns 0 for zero assets', () => {
    expect(calcDeemedIncome(0, true)).toBe(0)
  })

  it('applies lower rate below threshold (single)', () => {
    const result = calcDeemedIncome(50_000, true)
    expect(result).toBeCloseTo(50_000 * 0.0025, 2)
  })

  it('applies both rates above threshold (single)', () => {
    const assets = 100_000
    const expected = DEEMING_THRESHOLD_SINGLE * 0.0025 + (assets - DEEMING_THRESHOLD_SINGLE) * 0.0225
    const result = calcDeemedIncome(assets, true)
    expect(result).toBeCloseTo(expected, 2)
  })

  it('uses couple threshold when not single', () => {
    // $80k for couple — below couple threshold ($100,200), all at lower rate
    const result = calcDeemedIncome(80_000, false)
    expect(result).toBeCloseTo(80_000 * 0.0025, 2)
  })
})

// ── calcAssetTestPension ────────────────────────────────────────────────

describe('calcAssetTestPension', () => {
  it('returns max pension when assets below threshold (single homeowner)', () => {
    const result = calcAssetTestPension(200_000, true, true)
    expect(result).toBe(AGE_PENSION_MAX_SINGLE)
  })

  it('reduces pension above threshold', () => {
    // $50k above threshold → reduction = 50 × $78 = $3,900
    const assets = 301_750 + 50_000
    const result = calcAssetTestPension(assets, true, true)
    expect(result).toBeCloseTo(AGE_PENSION_MAX_SINGLE - 3_900, 0)
  })

  it('returns zero when assets very high', () => {
    const result = calcAssetTestPension(2_000_000, true, true)
    expect(result).toBe(0)
  })

  it('uses non-homeowner threshold when not homeowner', () => {
    // Non-homeowner threshold is higher — same assets yield higher pension
    const assets = 400_000
    const homeowner = calcAssetTestPension(assets, true, true)
    const nonHomeowner = calcAssetTestPension(assets, true, false)
    expect(nonHomeowner).toBeGreaterThan(homeowner)
  })

  it('uses couple thresholds for couples', () => {
    const result = calcAssetTestPension(300_000, false, true)
    expect(result).toBe(AGE_PENSION_MAX_COUPLE) // Below couple threshold
  })
})

// ── calcIncomeTestPension ───────────────────────────────────────────────

describe('calcIncomeTestPension', () => {
  it('returns max pension when income below free area (single)', () => {
    const result = calcIncomeTestPension(3_000, true)
    expect(result).toBe(AGE_PENSION_MAX_SINGLE)
  })

  it('reduces pension above free area at 50c per $1', () => {
    // $10k above free area → reduction = $10k × 0.5 = $5k
    const income = 5_304 + 10_000
    const result = calcIncomeTestPension(income, true)
    expect(result).toBeCloseTo(AGE_PENSION_MAX_SINGLE - 5_000, 0)
  })

  it('returns zero for very high income', () => {
    const result = calcIncomeTestPension(200_000, true)
    expect(result).toBe(0)
  })
})

// ── calcAgePension (integration) ────────────────────────────────────────

describe('calcAgePension', () => {
  const baseParams = {
    ageA: 68,
    ageB: null,
    retiredA: true,
    retiredB: false,
    isHomeowner: true,
    superABalance: 100_000,
    superAInPension: true,
    superBBalance: 0,
    superBInPension: false,
    sharesValue: 50_000,
    bondLiquidity: 0,
    otherAssetsValue: 0,
    cashBuffer: 20_000,
    investmentPropertyEquity: 0,
    otherIncome: 0,
  }

  it('returns zero for person below pension age', () => {
    const result = calcAgePension({ ...baseParams, ageA: 60 })
    expect(result.totalPension).toBe(0)
  })

  it('returns max pension for very low assets/income', () => {
    const result = calcAgePension({
      ...baseParams,
      superABalance: 10_000,
      sharesValue: 0,
      cashBuffer: 5_000,
    })
    expect(result.totalPension).toBe(AGE_PENSION_MAX_SINGLE)
  })

  it('returns partial pension for moderate assets', () => {
    const result = calcAgePension({
      ...baseParams,
      superABalance: 250_000,
      sharesValue: 80_000,
      cashBuffer: 30_000,
    })
    expect(result.totalPension).toBeGreaterThan(0)
    expect(result.totalPension).toBeLessThan(AGE_PENSION_MAX_SINGLE)
  })

  it('returns zero pension for very high assets', () => {
    const result = calcAgePension({
      ...baseParams,
      superABalance: 1_000_000,
      sharesValue: 500_000,
      cashBuffer: 200_000,
    })
    expect(result.totalPension).toBe(0)
  })

  it('uses the lesser of asset test and income test', () => {
    const result = calcAgePension(baseParams)
    expect(result.totalPension).toBe(Math.min(result.assetTestPension, result.incomeTestPension))
  })

  it('splits pension between eligible couple members', () => {
    const result = calcAgePension({
      ...baseParams,
      ageB: 68,
      superBBalance: 50_000,
      superBInPension: true,
    })
    expect(result.pensionA).toBeGreaterThan(0)
    expect(result.pensionB).toBeGreaterThan(0)
    expect(result.pensionA).toBeCloseTo(result.pensionB, 0)
    expect(result.totalPension).toBeCloseTo(result.pensionA + result.pensionB, 0)
  })

  it('only pays eligible member when one partner below age', () => {
    const result = calcAgePension({
      ...baseParams,
      ageB: 60, // below pension age
    })
    expect(result.pensionA).toBeGreaterThan(0)
    expect(result.pensionB).toBe(0)
  })

  it('does not count accumulation-phase super as assessable', () => {
    // Large super balance but NOT in pension phase → not counted
    const result = calcAgePension({
      ...baseParams,
      superABalance: 2_000_000,
      superAInPension: false,
      sharesValue: 0,
      cashBuffer: 10_000,
    })
    // Only $10k cash is assessable → should get full or near-full pension
    expect(result.totalPension).toBeCloseTo(AGE_PENSION_MAX_SINGLE, 0)
  })

  it('excludes primary residence from asset test', () => {
    // Homeowner with modest financial assets should get pension
    const result = calcAgePension({
      ...baseParams,
      isHomeowner: true,
      superABalance: 50_000,
      sharesValue: 0,
      cashBuffer: 10_000,
    })
    expect(result.totalPension).toBe(AGE_PENSION_MAX_SINGLE)
  })
})
