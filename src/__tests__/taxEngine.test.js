import { describe, it, expect } from 'vitest'
import {
  calcIncomeTax,
  calcMedicareLevy,
  calcFrankingCredit,
  calcPersonTax,
  resolvePackagingReductions,
  getMarginalRate,
} from '../engine/taxEngine.js'

// ── calcIncomeTax ──────────────────────────────────────────────────────────
// ATO FY2025 brackets:
//   $0 – $18,200:     nil
//   $18,201 – $45,000:  19c per $1 over $18,200
//   $45,001 – $120,000: $5,092 + 32.5c per $1 over $45,000
//   $120,001 – $180,000: $29,467 + 37c per $1 over $120,000
//   $180,001+:          $51,667 + 45c per $1 over $180,000

describe('calcIncomeTax', () => {
  it('returns 0 for zero income', () => {
    expect(calcIncomeTax(0)).toBe(0)
  })

  it('returns 0 for income at or below tax-free threshold ($18,200)', () => {
    expect(calcIncomeTax(18_200)).toBe(0)
  })

  it('applies 19% bracket correctly at $20,000', () => {
    // (20,000 - 18,201) * 0.19 = 1,799 * 0.19 = 341.81
    expect(calcIncomeTax(20_000)).toBeCloseTo(341.81, 1)
  })

  it('applies 19% bracket at $45,000 boundary', () => {
    // (45,000 - 18,201) * 0.19 = 26,799 * 0.19 = 5,091.81
    expect(calcIncomeTax(45_000)).toBeCloseTo(5_091.81, 1)
  })

  it('applies 32.5% bracket at $80,000', () => {
    // 5,092 + (80,000 - 45,001) * 0.325 = 5,092 + 11,374.675 = 16,466.68
    expect(calcIncomeTax(80_000)).toBeCloseTo(16_466.68, 0)
  })

  it('applies 32.5% bracket at $120,000 boundary', () => {
    // 5,092 + (120,000 - 45,001) * 0.325 = 5,092 + 24,374.68 = 29,466.68
    expect(calcIncomeTax(120_000)).toBeCloseTo(29_466.68, 0)
  })

  it('applies 37% bracket at $150,000', () => {
    // 29,467 + (150,000 - 120,001) * 0.37 = 29,467 + 11,099.63 = 40,566.63
    expect(calcIncomeTax(150_000)).toBeCloseTo(40_566.63, 0)
  })

  it('applies 45% bracket at $200,000', () => {
    // 51,667 + (200,000 - 180,001) * 0.45 = 51,667 + 8,999.55 = 60,666.55
    expect(calcIncomeTax(200_000)).toBeCloseTo(60_666.55, 0)
  })

  it('returns 0 for negative income', () => {
    expect(calcIncomeTax(-5_000)).toBe(0)
  })
})

// ── calcMedicareLevy ──────────────────────────────────────────────────────

describe('calcMedicareLevy', () => {
  it('returns 0 at or below shade-in threshold', () => {
    expect(calcMedicareLevy(26_000)).toBe(0)
  })

  it('applies 2% above threshold', () => {
    expect(calcMedicareLevy(80_000)).toBeCloseTo(1_600, 0)
  })

  it('applies 2% at $120,000', () => {
    expect(calcMedicareLevy(120_000)).toBeCloseTo(2_400, 0)
  })
})

// ── calcFrankingCredit ────────────────────────────────────────────────────
// Formula: credit = dividend * frankingPct * (0.30 / 0.70)
// 70% franked $1,000 → credit = 1,000 * 0.70 * (3/7) = $300 exactly

describe('calcFrankingCredit', () => {
  it('calculates 70% franked dividend correctly', () => {
    const { credit } = calcFrankingCredit(1_000, 0.70)
    expect(credit).toBeCloseTo(300, 2)
  })

  it('calculates 100% franked dividend correctly', () => {
    // 1,000 * 1.0 * (0.30/0.70) = 428.57
    const { credit } = calcFrankingCredit(1_000, 1.0)
    expect(credit).toBeCloseTo(428.57, 1)
  })

  it('returns zero credit for unfranked dividend', () => {
    const { credit } = calcFrankingCredit(1_000, 0)
    expect(credit).toBe(0)
  })

  it('grossUp equals credit amount', () => {
    const { grossUp, credit } = calcFrankingCredit(2_000, 0.70)
    expect(grossUp).toBe(credit)
  })
})

// ── calcPersonTax ─────────────────────────────────────────────────────────

describe('calcPersonTax', () => {
  it('calculates correct net take-home for $80,000 salary', () => {
    // grossTax ≈ 16,467, medicare ≈ 1,600, total ≈ 18,067
    const result = calcPersonTax({ grossSalary: 80_000 })
    expect(result.grossTax).toBeCloseTo(16_466.68, 0)
    expect(result.medicareLevy).toBeCloseTo(1_600, 0)
    expect(result.totalTaxPayable).toBeCloseTo(18_066.68, 0)
    expect(result.netTakeHome).toBeCloseTo(61_933.32, 0)
  })

  it('salary sacrifice reduces assessable income', () => {
    // $120k salary, $10k sacrifice → taxable = $110k
    const result = calcPersonTax({ grossSalary: 120_000, salarySacrifice: 10_000 })
    expect(result.taxableIncome).toBe(110_000)
    // 5,092 + (110,000 - 45,001) * 0.325 = 5,092 + 21,124.68 = 26,216.68
    expect(result.grossTax).toBeCloseTo(26_216.68, 0)
    // Net take-home = 120,000 - 10,000 - tax - medicare
    expect(result.netTakeHome).toBeCloseTo(120_000 - 10_000 - 26_216.68 - 2_200, 0)
  })

  it('negative gearing reduces taxable income', () => {
    const withGearing = calcPersonTax({ grossSalary: 80_000, rentalIncomeLoss: -10_000 })
    const without = calcPersonTax({ grossSalary: 80_000 })
    expect(withGearing.taxableIncome).toBe(70_000)
    expect(withGearing.totalTaxPayable).toBeLessThan(without.totalTaxPayable)
  })

  it('rental profit increases taxable income', () => {
    const result = calcPersonTax({ grossSalary: 80_000, rentalIncomeLoss: 10_000 })
    expect(result.taxableIncome).toBe(90_000)
  })

  it('franking credit offsets tax liability', () => {
    const withFranking = calcPersonTax({ grossSalary: 80_000, dividendIncome: 3_500, frankingCredit: 1_050 })
    const without = calcPersonTax({ grossSalary: 80_000 })
    // Franking credit should reduce net tax
    expect(withFranking.netTax).toBeLessThan(without.netTax + 1_050)
  })

  it('franking credit is refundable in pension phase when exceeds tax', () => {
    // Zero salary in pension, small income below tax-free threshold → full refund
    const result = calcPersonTax({
      grossSalary: 0,
      dividendIncome: 500,
      frankingCredit: 214,
      inPensionPhase: true,
    })
    // grossTax on $714 ≈ 0 (below threshold) → full franking refund
    expect(result.frankingRefund).toBeCloseTo(214, 0)
    expect(result.grossTax).toBe(0)
  })

  it('franking credit is not refundable outside pension phase', () => {
    const result = calcPersonTax({
      grossSalary: 0,
      dividendIncome: 500,
      frankingCredit: 214,
      inPensionPhase: false,
    })
    expect(result.frankingRefund).toBe(0)
  })

  it('packaging reduction reduces assessable income', () => {
    const result = calcPersonTax({ grossSalary: 80_000, packagingReduction: 15_900 })
    expect(result.taxableIncome).toBe(64_100)
  })

  it('returns zero tax for income below tax-free threshold', () => {
    const result = calcPersonTax({ grossSalary: 15_000 })
    expect(result.grossTax).toBe(0)
    expect(result.medicareLevy).toBe(0)
  })
})

// ── resolvePackagingReductions ────────────────────────────────────────────

describe('resolvePackagingReductions', () => {
  it('returns zero for standard employer type', () => {
    const person = {
      employerType: 'standard',
      packaging: { pbiGeneral: 5_000, pbiMealEntertainment: 2_000 },
    }
    const { packagingReduction } = resolvePackagingReductions(person, 80_000)
    expect(packagingReduction).toBe(0)
  })

  it('applies PBI general cap ($15,900) for pbi_nfp', () => {
    const person = {
      employerType: 'pbi_nfp',
      packaging: { pbiGeneral: 15_900, pbiMealEntertainment: 0 },
    }
    const { packagingReduction } = resolvePackagingReductions(person, 80_000)
    expect(packagingReduction).toBe(15_900)
  })

  it('caps PBI general at $15,900 even if input is higher', () => {
    const person = {
      employerType: 'pbi_nfp',
      packaging: { pbiGeneral: 20_000, pbiMealEntertainment: 0 },
    }
    const { packagingReduction } = resolvePackagingReductions(person, 80_000)
    expect(packagingReduction).toBe(15_900)
  })

  it('sums PBI general + meal entertainment', () => {
    const person = {
      employerType: 'pbi_nfp',
      packaging: { pbiGeneral: 15_900, pbiMealEntertainment: 2_650 },
    }
    const { packagingReduction } = resolvePackagingReductions(person, 80_000)
    expect(packagingReduction).toBe(18_550)
  })

  it('applies QLD Health cap ($9,000)', () => {
    const person = {
      employerType: 'qld_health',
      packaging: { qldHealthGeneral: 9_000, qldHealthMealEntertainment: 2_650 },
    }
    const { packagingReduction } = resolvePackagingReductions(person, 80_000)
    expect(packagingReduction).toBe(11_650)
  })

  it('caps total packaging at gross salary', () => {
    const person = {
      employerType: 'pbi_nfp',
      packaging: { pbiGeneral: 15_900, pbiMealEntertainment: 2_650 },
    }
    const { packagingReduction } = resolvePackagingReductions(person, 10_000)
    expect(packagingReduction).toBe(10_000)
  })
})

// ── getMarginalRate ────────────────────────────────────────────────────────

describe('getMarginalRate', () => {
  it('returns 0 for income below threshold', () => {
    expect(getMarginalRate(10_000)).toBe(0)
  })

  it('returns 19% in second bracket', () => {
    expect(getMarginalRate(30_000)).toBe(0.19)
  })

  it('returns 32.5% in third bracket', () => {
    expect(getMarginalRate(80_000)).toBe(0.325)
  })

  it('returns 45% at top bracket', () => {
    expect(getMarginalRate(200_000)).toBe(0.45)
  })
})
