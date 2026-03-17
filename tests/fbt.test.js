/**
 * Unit tests for fbt.js — all four novated lease scenarios.
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest'
import { calcStatutory, calcECM, compareMethodsSideBySide } from '../src/modules/fbt.js'

const BASE_VEHICLE = 45_000
const RUNNING_COSTS = 8_000
const KM_TOTAL = 25_000
const KM_BUSINESS = 15_000  // 60% business use

// ----------------------------------------------------------
// Scenario 1: Statutory Formula — no employee contribution
// ----------------------------------------------------------
describe('Statutory Formula — no employee contribution', () => {
  const result = calcStatutory({
    vehicleCostPrice: BASE_VEHICLE,
    annualRunningCosts: RUNNING_COSTS,
    employeePostTaxContrib: 0,
  })

  it('uses statutory method', () => {
    expect(result.method).toBe('statutory')
  })

  it('taxable value = vehicle cost × 20%', () => {
    expect(result.taxableValue).toBeCloseTo(BASE_VEHICLE * 0.20, 2)
  })

  it('grossed up value = taxable value × 2.0802', () => {
    expect(result.grossedUpValue).toBeCloseTo(result.taxableValue * 2.0802, 2)
  })

  it('FBT liability = grossed up value × 47%', () => {
    expect(result.fbtLiability).toBeCloseTo(result.grossedUpValue * 0.47, 2)
  })

  it('pre-tax package reduction = taxable value + running costs', () => {
    expect(result.pretaxPackageReduction).toBeCloseTo(result.rawTaxableValue + RUNNING_COSTS, 2)
  })

  it('FBT liability > 0 when no employee contribution', () => {
    expect(result.fbtLiability).toBeGreaterThan(0)
  })
})

// ----------------------------------------------------------
// Scenario 2: Statutory Formula — with employee post-tax contribution
// ----------------------------------------------------------
describe('Statutory Formula — with employee post-tax contribution', () => {
  const taxableValueNoContrib = BASE_VEHICLE * 0.20
  const result = calcStatutory({
    vehicleCostPrice: BASE_VEHICLE,
    annualRunningCosts: RUNNING_COSTS,
    employeePostTaxContrib: taxableValueNoContrib, // eliminates FBT
  })

  it('taxable value reduced to 0 by full employee contribution', () => {
    expect(result.taxableValue).toBe(0)
  })

  it('FBT liability = 0 when contribution covers full taxable value', () => {
    expect(result.fbtLiability).toBe(0)
  })

  it('employee contribution recorded correctly', () => {
    expect(result.employeePostTaxContrib).toBeCloseTo(taxableValueNoContrib, 2)
  })

  it('warning issued confirming FBT elimination', () => {
    expect(result.warnings.some(w => w.includes('eliminates FBT'))).toBe(true)
  })
})

// ----------------------------------------------------------
// Scenario 3: ECM — no employee contribution
// ----------------------------------------------------------
describe('ECM — no employee contribution', () => {
  const result = calcECM({
    vehicleCostPrice: BASE_VEHICLE,
    annualRunningCosts: RUNNING_COSTS,
    annualKmTotal: KM_TOTAL,
    annualKmBusiness: KM_BUSINESS,
    employeePostTaxContrib: 0,
  })

  it('uses ecm method', () => {
    expect(result.method).toBe('ecm')
  })

  it('business use % = 60%', () => {
    expect(result.businessUsePct).toBeCloseTo(0.60, 4)
  })

  it('total vehicle costs includes depreciation', () => {
    const depreciation = BASE_VEHICLE / 8
    expect(result.totalVehicleCosts).toBeCloseTo(RUNNING_COSTS + depreciation, 2)
  })

  it('taxable value = total costs × (1 - 60%) × 20%', () => {
    const depreciation = BASE_VEHICLE / 8
    const totalCosts = RUNNING_COSTS + depreciation
    const expected = totalCosts * 0.40 * 0.20
    expect(result.taxableValue).toBeCloseTo(expected, 2)
  })

  it('ECM taxable value is less than statutory when business use is high', () => {
    const statutory = calcStatutory({ vehicleCostPrice: BASE_VEHICLE, annualRunningCosts: RUNNING_COSTS })
    expect(result.taxableValue).toBeLessThan(statutory.taxableValue)
  })

  it('FBT liability > 0 when no employee contribution', () => {
    expect(result.fbtLiability).toBeGreaterThan(0)
  })
})

// ----------------------------------------------------------
// Scenario 4: ECM — employee contribution to zero FBT
// ----------------------------------------------------------
describe('ECM — employee contribution to zero FBT', () => {
  // First calculate without contribution to get the taxable value
  const noContrib = calcECM({
    vehicleCostPrice: BASE_VEHICLE,
    annualRunningCosts: RUNNING_COSTS,
    annualKmTotal: KM_TOTAL,
    annualKmBusiness: KM_BUSINESS,
    employeePostTaxContrib: 0,
  })

  const result = calcECM({
    vehicleCostPrice: BASE_VEHICLE,
    annualRunningCosts: RUNNING_COSTS,
    annualKmTotal: KM_TOTAL,
    annualKmBusiness: KM_BUSINESS,
    employeePostTaxContrib: noContrib.rawTaxableValue,
  })

  it('taxable value = 0 after full employee contribution', () => {
    expect(result.taxableValue).toBe(0)
  })

  it('FBT liability = 0', () => {
    expect(result.fbtLiability).toBe(0)
  })

  it('grossed up value = 0', () => {
    expect(result.grossedUpValue).toBe(0)
  })

  it('employee contribution equals original ECM taxable value', () => {
    expect(result.employeePostTaxContrib).toBeCloseTo(noContrib.rawTaxableValue, 2)
  })
})

// ----------------------------------------------------------
// Side-by-side comparison
// ----------------------------------------------------------
describe('compareMethodsSideBySide', () => {
  const result = compareMethodsSideBySide(
    { vehicleCostPrice: BASE_VEHICLE, annualRunningCosts: RUNNING_COSTS, employeePostTaxContrib: 0 },
    { vehicleCostPrice: BASE_VEHICLE, annualRunningCosts: RUNNING_COSTS, annualKmTotal: KM_TOTAL, annualKmBusiness: KM_BUSINESS, employeePostTaxContrib: 0 }
  )

  it('returns both statutory and ecm results', () => {
    expect(result.statutory).toBeDefined()
    expect(result.ecm).toBeDefined()
  })

  it('recommends ecm when business use is high', () => {
    expect(result.recommended).toBe('ecm')
  })
})

// ----------------------------------------------------------
// EV exemption
// ----------------------------------------------------------
describe('EV exemption', () => {
  const result = calcStatutory({
    vehicleCostPrice: BASE_VEHICLE,
    annualRunningCosts: RUNNING_COSTS,
    isEV: true,
  })

  it('FBT liability = 0 for EV', () => {
    expect(result.fbtLiability).toBe(0)
  })

  it('taxable value = 0 for EV', () => {
    expect(result.taxableValue).toBe(0)
  })

  it('shows EV legislative warning', () => {
    expect(result.warnings.some(w => w.includes('legislative change'))).toBe(true)
  })
})
