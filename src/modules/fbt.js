/**
 * FBT Module — Novated Lease Calculations
 *
 * Self-contained. No side effects. All four scenarios:
 *   1. Statutory Formula — no employee contribution
 *   2. Statutory Formula — with employee post-tax contribution
 *   3. Operating Cost Method (ECM) — no employee contribution
 *   4. Operating Cost Method (ECM) — with employee contribution to $0 FBT
 *
 * Build and validate in isolation before wiring to tax engine.
 */

import {
  FBT_RATE,
  FBT_GROSS_UP_TYPE1,
  NOVATED_LEASE_STATUTORY_RATE,
} from '../constants/index.js'

// Vehicle effective life for depreciation under ECM
const VEHICLE_EFFECTIVE_LIFE_YEARS = 8

/**
 * Statutory Formula Method.
 * Taxable value = base value × 20% × (days available / 365)
 *
 * @param {object} params
 * @param {number} params.vehicleCostPrice       - inc. GST, excl. rego/CTP
 * @param {number} params.annualRunningCosts      - fuel, rego, insurance, maintenance
 * @param {number} params.daysAvailable           - default 365
 * @param {number} params.employeePostTaxContrib  - reduces taxable value dollar-for-dollar
 * @param {boolean} params.isEV                  - EV toggle (currently FBT-exempt)
 * @returns {object} FBT calculation result
 */
export function calcStatutory({
  vehicleCostPrice,
  annualRunningCosts,
  daysAvailable = 365,
  employeePostTaxContrib = 0,
  isEV = false,
}) {
  if (isEV) {
    return evExemptResult(annualRunningCosts)
  }

  const baseValue = vehicleCostPrice
  const rawTaxableValue = baseValue * NOVATED_LEASE_STATUTORY_RATE * (daysAvailable / 365)
  const taxableValue = Math.max(0, rawTaxableValue - employeePostTaxContrib)

  return buildResult({
    method: 'statutory',
    taxableValue,
    rawTaxableValue,
    annualRunningCosts,
    employeePostTaxContrib,
    isEV,
  })
}

/**
 * Operating Cost Method (ECM).
 * Taxable value = total vehicle costs × (1 − business use %) × 20%
 *
 * Requires a valid logbook. Simulator assumes logbook is maintained.
 *
 * @param {object} params
 * @param {number} params.vehicleCostPrice
 * @param {number} params.annualRunningCosts      - fuel, rego, insurance, maintenance
 * @param {number} params.annualKmTotal
 * @param {number} params.annualKmBusiness
 * @param {number} params.annualLeasePayments     - if applicable
 * @param {number} params.annualFinanceCharges    - if applicable
 * @param {number} params.employeePostTaxContrib  - reduces taxable value to $0 if >= taxable value
 * @param {boolean} params.isEV
 * @returns {object} FBT calculation result
 */
export function calcECM({
  vehicleCostPrice,
  annualRunningCosts,
  annualKmTotal,
  annualKmBusiness,
  annualLeasePayments = 0,
  annualFinanceCharges = 0,
  employeePostTaxContrib = 0,
  isEV = false,
}) {
  if (isEV) {
    return evExemptResult(annualRunningCosts)
  }

  const businessUsePct = annualKmTotal > 0
    ? Math.min(1, annualKmBusiness / annualKmTotal)
    : 0

  const depreciation = vehicleCostPrice / VEHICLE_EFFECTIVE_LIFE_YEARS

  const totalVehicleCosts = annualRunningCosts + depreciation + annualLeasePayments + annualFinanceCharges

  const rawTaxableValue = totalVehicleCosts * (1 - businessUsePct) * 0.20
  const taxableValue = Math.max(0, rawTaxableValue - employeePostTaxContrib)

  return buildResult({
    method: 'ecm',
    taxableValue,
    rawTaxableValue,
    annualRunningCosts,
    totalVehicleCosts,
    businessUsePct,
    depreciation,
    annualLeasePayments,
    annualFinanceCharges,
    employeePostTaxContrib,
    isEV,
  })
}

/**
 * Compare both methods side-by-side. Returns both results plus the recommended method.
 */
export function compareMethodsSideBySide(statutoryParams, ecmParams) {
  const statutory = calcStatutory(statutoryParams)
  const ecm = calcECM(ecmParams)

  const recommended = ecm.fbtLiability <= statutory.fbtLiability ? 'ecm' : 'statutory'

  return {
    statutory,
    ecm,
    recommended,
    incomeTaxSavingDelta: Math.abs(ecm.incomeTaxSaving - statutory.incomeTaxSaving),
  }
}

// --- Shared helpers ---

function buildResult({ method, taxableValue, rawTaxableValue, annualRunningCosts, employeePostTaxContrib = 0, isEV = false, ...extra }) {
  const grossedUpValue = taxableValue * FBT_GROSS_UP_TYPE1
  const fbtLiability = grossedUpValue * FBT_RATE

  // Pre-tax package reduction = taxable value + running costs
  // (both packaged pre-tax via employer)
  const pretaxPackageReduction = rawTaxableValue + annualRunningCosts

  // Income tax saving: the amount saved by reducing assessable income
  // Estimate at top marginal rate (45%) — actual rate applied in tax engine
  const incomeTaxSaving = pretaxPackageReduction * 0.45

  return {
    method,
    isEV,
    taxableValue,
    rawTaxableValue,
    grossedUpValue,
    fbtLiability,
    pretaxPackageReduction,
    employeePostTaxContrib,
    incomeTaxSaving,
    netAnnualBenefit: incomeTaxSaving - employeePostTaxContrib,
    warnings: buildWarnings({ taxableValue, employeePostTaxContrib }),
    ...extra,
  }
}

function evExemptResult(annualRunningCosts) {
  return {
    method: 'ev_exempt',
    isEV: true,
    taxableValue: 0,
    rawTaxableValue: 0,
    grossedUpValue: 0,
    fbtLiability: 0,
    pretaxPackageReduction: annualRunningCosts,
    employeePostTaxContrib: 0,
    incomeTaxSaving: annualRunningCosts * 0.45,
    netAnnualBenefit: annualRunningCosts * 0.45,
    warnings: ['EV FBT exemption subject to legislative change. Verify current eligibility.'],
  }
}

function buildWarnings({ taxableValue, employeePostTaxContrib }) {
  const warnings = []
  if (employeePostTaxContrib > 0 && employeePostTaxContrib >= taxableValue) {
    warnings.push('Employee contribution eliminates FBT liability entirely.')
  }
  return warnings
}
