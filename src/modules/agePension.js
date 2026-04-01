/**
 * Age Pension Module
 *
 * Implements the Australian Age Pension means testing:
 * - Asset test (lower threshold + taper)
 * - Income test (deemed income from financial assets + other income)
 * - Pension = min(asset test result, income test result)
 *
 * References: Services Australia rates effective 20 March 2024.
 */

import {
  AGE_PENSION_AGE,
  AGE_PENSION_MAX_SINGLE,
  AGE_PENSION_MAX_COUPLE,
  ASSET_TEST_LOWER_SINGLE_HOMEOWNER,
  ASSET_TEST_LOWER_COUPLE_HOMEOWNER,
  ASSET_TEST_LOWER_SINGLE_NON_HOMEOWNER,
  ASSET_TEST_LOWER_COUPLE_NON_HOMEOWNER,
  ASSET_TEST_TAPER_RATE,
  INCOME_TEST_FREE_SINGLE,
  INCOME_TEST_FREE_COUPLE,
  INCOME_TEST_TAPER_SINGLE,
  INCOME_TEST_TAPER_COUPLE,
  DEEMING_LOWER_RATE,
  DEEMING_UPPER_RATE,
  DEEMING_THRESHOLD_SINGLE,
  DEEMING_THRESHOLD_COUPLE,
} from '../constants/index.js'

/**
 * Calculate deemed income from financial assets.
 * Financial assets = super (pension phase) + shares + bonds + other drawable assets + cash.
 * Super in accumulation phase is NOT counted (locked).
 *
 * @param {number} financialAssets - total assessable financial assets
 * @param {boolean} isSingle - true if single, false if couple
 * @returns {number} annual deemed income
 */
export function calcDeemedIncome(financialAssets, isSingle) {
  const threshold = isSingle ? DEEMING_THRESHOLD_SINGLE : DEEMING_THRESHOLD_COUPLE
  if (financialAssets <= 0) return 0
  if (financialAssets <= threshold) {
    return financialAssets * DEEMING_LOWER_RATE
  }
  return threshold * DEEMING_LOWER_RATE + (financialAssets - threshold) * DEEMING_UPPER_RATE
}

/**
 * Asset test: pension reduces by taper rate per $1,000 of assets above lower threshold.
 *
 * @param {number} assessableAssets - total assessable assets (excl. primary residence)
 * @param {boolean} isSingle
 * @param {boolean} isHomeowner - true if owns primary residence
 * @returns {number} annual pension under asset test
 */
export function calcAssetTestPension(assessableAssets, isSingle, isHomeowner) {
  const maxPension = isSingle ? AGE_PENSION_MAX_SINGLE : AGE_PENSION_MAX_COUPLE

  let lowerThreshold
  if (isSingle) {
    lowerThreshold = isHomeowner ? ASSET_TEST_LOWER_SINGLE_HOMEOWNER : ASSET_TEST_LOWER_SINGLE_NON_HOMEOWNER
  } else {
    lowerThreshold = isHomeowner ? ASSET_TEST_LOWER_COUPLE_HOMEOWNER : ASSET_TEST_LOWER_COUPLE_NON_HOMEOWNER
  }

  if (assessableAssets <= lowerThreshold) return maxPension

  const excessThousands = (assessableAssets - lowerThreshold) / 1000
  const reduction = excessThousands * ASSET_TEST_TAPER_RATE * 1000
  return Math.max(0, maxPension - reduction)
}

/**
 * Income test: pension reduces by taper rate per $ of income above free area.
 * For couples, combined income is used and combined taper applies.
 *
 * @param {number} assessableIncome - annual assessable income (deemed + other)
 * @param {boolean} isSingle
 * @returns {number} annual pension under income test
 */
export function calcIncomeTestPension(assessableIncome, isSingle) {
  const maxPension = isSingle ? AGE_PENSION_MAX_SINGLE : AGE_PENSION_MAX_COUPLE
  const freeArea = isSingle ? INCOME_TEST_FREE_SINGLE : INCOME_TEST_FREE_COUPLE
  const taperRate = isSingle ? INCOME_TEST_TAPER_SINGLE : INCOME_TEST_TAPER_COUPLE

  if (assessableIncome <= freeArea) return maxPension

  const excessIncome = assessableIncome - freeArea
  const reduction = excessIncome * taperRate
  return Math.max(0, maxPension - reduction)
}

/**
 * Calculate Age Pension entitlement for a household in a given year.
 *
 * @param {object} params
 * @param {number|null} params.ageA - age of person A
 * @param {number|null} params.ageB - age of person B (null if single)
 * @param {boolean} params.retiredA - is person A retired
 * @param {boolean} params.retiredB - is person B retired
 * @param {boolean} params.isHomeowner - owns primary residence
 * @param {number} params.superABalance - super balance A (pension phase only counts)
 * @param {boolean} params.superAInPension - is super A in pension phase
 * @param {number} params.superBBalance - super balance B
 * @param {boolean} params.superBInPension - is super B in pension phase
 * @param {number} params.sharesValue - share portfolio value
 * @param {number} params.bondLiquidity - accessible bond balances
 * @param {number} params.otherAssetsValue - other drawable asset values
 * @param {number} params.cashBuffer - cash/offset balances
 * @param {number} params.investmentPropertyEquity - non-primary-residence property equity
 * @param {number} params.treasuryBondsValue - treasury/corporate bonds value
 * @param {number} params.commoditiesValue - commodities portfolio value
 * @param {number} params.otherIncome - non-employment income (rental, dividends, etc.)
 * @returns {{ pensionA: number, pensionB: number, totalPension: number, assetTestPension: number, incomeTestPension: number, deemedIncome: number, assessableAssets: number }}
 */
export function calcAgePension({
  ageA,
  ageB,
  retiredA,
  retiredB,
  isHomeowner,
  superABalance,
  superAInPension,
  superBBalance,
  superBInPension,
  sharesValue,
  bondLiquidity,
  otherAssetsValue,
  cashBuffer,
  investmentPropertyEquity,
  treasuryBondsValue = 0,
  commoditiesValue = 0,
  otherIncome = 0,
}) {
  const noResult = { pensionA: 0, pensionB: 0, totalPension: 0, assetTestPension: 0, incomeTestPension: 0, deemedIncome: 0, assessableAssets: 0 }

  // Must be of pension age to be eligible
  const aEligible = ageA != null && ageA >= AGE_PENSION_AGE
  const bEligible = ageB != null && ageB >= AGE_PENSION_AGE
  if (!aEligible && !bEligible) return noResult

  const isSingle = ageB == null
  const isCoupleForTest = !isSingle

  // ── Assessable assets (excl. primary residence) ──
  // Super in pension phase is counted; accumulation-phase super is exempt
  const assessableSuper = (superAInPension ? superABalance : 0) + (superBInPension ? superBBalance : 0)
  const assessableAssets =
    assessableSuper +
    sharesValue +
    bondLiquidity +
    otherAssetsValue +
    Math.max(0, cashBuffer) +
    investmentPropertyEquity +
    treasuryBondsValue +
    commoditiesValue

  // ── Financial assets for deeming ──
  // Same as assessable assets minus investment property (property income is actual, not deemed)
  const financialAssets = assessableAssets - investmentPropertyEquity

  // ── Deemed income ──
  const deemedIncome = calcDeemedIncome(financialAssets, !isCoupleForTest)

  // ── Total assessable income for income test ──
  // Deemed income replaces actual returns from financial assets
  // Other income (e.g. rental, employment) is actual
  const assessableIncome = deemedIncome + otherIncome

  // ── Apply both tests ──
  const assetTestPension = calcAssetTestPension(assessableAssets, !isCoupleForTest, isHomeowner)
  const incomeTestPension = calcIncomeTestPension(assessableIncome, !isCoupleForTest)

  // Pension = lesser of the two tests
  const totalPension = Math.min(assetTestPension, incomeTestPension)

  // Split between A and B based on eligibility
  let pensionA = 0
  let pensionB = 0
  if (isSingle) {
    pensionA = aEligible ? totalPension : 0
  } else {
    // For couples, pension is a combined entitlement — split evenly between eligible members
    const eligibleCount = (aEligible ? 1 : 0) + (bEligible ? 1 : 0)
    if (eligibleCount > 0) {
      pensionA = aEligible ? totalPension / eligibleCount : 0
      pensionB = bEligible ? totalPension / eligibleCount : 0
    }
  }

  return {
    pensionA,
    pensionB,
    totalPension,
    assetTestPension,
    incomeTestPension,
    deemedIncome,
    assessableAssets,
  }
}
