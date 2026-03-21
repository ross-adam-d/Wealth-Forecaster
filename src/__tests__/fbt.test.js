import { describe, it, expect } from 'vitest'
import { calcStatutory, calcECM, compareMethodsSideBySide } from '../modules/fbt.js'

// FBT constants (from spec / ATO):
//   FBT rate: 47%
//   Gross-up factor (Type 1): 2.0802
//   Statutory rate: 20%

describe('calcStatutory', () => {
  const baseParams = {
    vehicleCostPrice: 60_000,
    annualRunningCosts: 8_000,
    employeePostTaxContrib: 0,
    isEV: false,
  }

  it('calculates taxable value as 20% of vehicle cost price', () => {
    const result = calcStatutory(baseParams)
    // 60,000 * 0.20 = 12,000
    expect(result.taxableValue).toBeCloseTo(12_000, 0)
    expect(result.rawTaxableValue).toBeCloseTo(12_000, 0)
  })

  it('calculates grossed-up value correctly', () => {
    const result = calcStatutory(baseParams)
    // 12,000 * 2.0802 = 24,962.4
    expect(result.grossedUpValue).toBeCloseTo(24_962.4, 0)
  })

  it('calculates FBT liability at 47%', () => {
    const result = calcStatutory(baseParams)
    // 24,962.4 * 0.47 ≈ 11,732
    expect(result.fbtLiability).toBeCloseTo(11_732, 0)
  })

  it('pre-tax = lease payment + running costs - ECM', () => {
    // Without annualLeasePayment: pretax = 0 + 8,000 - 0 = 8,000
    const result = calcStatutory(baseParams)
    expect(result.pretaxPackageReduction).toBeCloseTo(8_000, 0)

    // With lease payment: pretax = 15,000 + 8,000 - 0 = 23,000
    const withLease = calcStatutory({ ...baseParams, annualLeasePayment: 15_000 })
    expect(withLease.pretaxPackageReduction).toBeCloseTo(23_000, 0)

    // With lease payment + ECM: pretax = 15,000 + 8,000 - 5,000 = 18,000
    const withECM = calcStatutory({ ...baseParams, annualLeasePayment: 15_000, employeePostTaxContrib: 5_000 })
    expect(withECM.pretaxPackageReduction).toBeCloseTo(18_000, 0)
  })

  it('employee post-tax contribution reduces taxable value dollar-for-dollar', () => {
    const withContrib = { ...baseParams, employeePostTaxContrib: 5_000 }
    const result = calcStatutory(withContrib)
    // rawTaxable = 12,000, employee contrib = 5,000 → taxable = 7,000
    expect(result.taxableValue).toBeCloseTo(7_000, 0)
    expect(result.fbtLiability).toBeLessThan(calcStatutory(baseParams).fbtLiability)
  })

  it('employee contribution equal to taxable value eliminates FBT', () => {
    const withFullContrib = { ...baseParams, employeePostTaxContrib: 12_000 }
    const result = calcStatutory(withFullContrib)
    expect(result.taxableValue).toBe(0)
    expect(result.fbtLiability).toBe(0)
    expect(result.warnings.some(w => w.includes('eliminates'))).toBe(true)
  })

  it('taxable value cannot go below zero', () => {
    const overContrib = { ...baseParams, employeePostTaxContrib: 20_000 }
    const result = calcStatutory(overContrib)
    expect(result.taxableValue).toBe(0)
  })

  it('pro-rates taxable value for partial year availability', () => {
    const halfYear = { ...baseParams, daysAvailable: 183 }
    const fullYear = calcStatutory(baseParams)
    const partial = calcStatutory(halfYear)
    expect(partial.rawTaxableValue).toBeCloseTo(fullYear.rawTaxableValue * (183 / 365), 0)
  })

  describe('EV exemption', () => {
    it('returns zero FBT for EV', () => {
      const ev = { ...baseParams, isEV: true }
      const result = calcStatutory(ev)
      expect(result.fbtLiability).toBe(0)
      expect(result.taxableValue).toBe(0)
      expect(result.method).toBe('ev_exempt')
    })

    it('EV still packages running costs pre-tax', () => {
      const ev = { ...baseParams, isEV: true }
      const result = calcStatutory(ev)
      // Only running costs packaged pre-tax (no taxable value component)
      expect(result.pretaxPackageReduction).toBeCloseTo(8_000, 0)
    })

    it('warns about EV exemption legislative risk', () => {
      const ev = { ...baseParams, isEV: true }
      const result = calcStatutory(ev)
      expect(result.warnings.length).toBeGreaterThan(0)
    })
  })
})

describe('calcECM', () => {
  const baseParams = {
    vehicleCostPrice: 60_000,
    annualRunningCosts: 8_000,
    annualKmTotal: 20_000,
    annualKmBusiness: 5_000, // 25% business use
    employeePostTaxContrib: 0,
    isEV: false,
  }

  it('calculates business use percentage from km', () => {
    const result = calcECM(baseParams)
    expect(result.businessUsePct).toBeCloseTo(0.25, 2)
  })

  it('includes depreciation in total vehicle costs', () => {
    const result = calcECM(baseParams)
    // depreciation = 60,000 / 8 = 7,500
    expect(result.depreciation).toBeCloseTo(7_500, 0)
    expect(result.totalVehicleCosts).toBeCloseTo(8_000 + 7_500, 0)
  })

  it('calculates taxable value: total costs * private use * 20%', () => {
    const result = calcECM(baseParams)
    // totalCosts = 15,500, private use = 75%, taxable value rate = 20%
    // 15,500 * 0.75 * 0.20 = 2,325
    expect(result.rawTaxableValue).toBeCloseTo(2_325, 0)
    expect(result.taxableValue).toBeCloseTo(2_325, 0)
  })

  it('results in lower FBT than statutory for high-business-use vehicles', () => {
    const statutory = calcStatutory({
      vehicleCostPrice: 60_000,
      annualRunningCosts: 8_000,
      employeePostTaxContrib: 0,
    })
    const ecm = calcECM({ ...baseParams, annualKmBusiness: 18_000 }) // 90% business use
    expect(ecm.fbtLiability).toBeLessThan(statutory.fbtLiability)
  })

  it('zero business use means maximum FBT under ECM', () => {
    const zeroBusinessUse = { ...baseParams, annualKmBusiness: 0 }
    const result = calcECM(zeroBusinessUse)
    expect(result.businessUsePct).toBe(0)
    // 100% private use → highest possible ECM taxable value
    expect(result.rawTaxableValue).toBeGreaterThan(calcECM(baseParams).rawTaxableValue)
  })

  it('100% business use results in zero FBT', () => {
    const fullBusiness = { ...baseParams, annualKmBusiness: 20_000 }
    const result = calcECM(fullBusiness)
    expect(result.taxableValue).toBe(0)
    expect(result.fbtLiability).toBe(0)
  })

  it('handles zero total km gracefully (no division by zero)', () => {
    const noKm = { ...baseParams, annualKmTotal: 0, annualKmBusiness: 0 }
    expect(() => calcECM(noKm)).not.toThrow()
    const result = calcECM(noKm)
    expect(result.businessUsePct).toBe(0)
  })

  it('returns zero FBT for EV', () => {
    const ev = { ...baseParams, isEV: true }
    const result = calcECM(ev)
    expect(result.fbtLiability).toBe(0)
    expect(result.method).toBe('ev_exempt')
  })
})

describe('compareMethodsSideBySide', () => {
  const params = {
    vehicleCostPrice: 60_000,
    annualRunningCosts: 8_000,
    annualKmTotal: 20_000,
    annualKmBusiness: 5_000,
    employeePostTaxContrib: 0,
  }

  it('returns both statutory and ECM results', () => {
    const result = compareMethodsSideBySide(
      { vehicleCostPrice: 60_000, annualRunningCosts: 8_000 },
      params,
    )
    expect(result.statutory).toBeDefined()
    expect(result.ecm).toBeDefined()
  })

  it('recommends lower-FBT method', () => {
    const result = compareMethodsSideBySide(
      { vehicleCostPrice: 60_000, annualRunningCosts: 8_000 },
      params,
    )
    const lowerFBT = result.ecm.fbtLiability <= result.statutory.fbtLiability ? 'ecm' : 'statutory'
    expect(result.recommended).toBe(lowerFBT)
  })
})
