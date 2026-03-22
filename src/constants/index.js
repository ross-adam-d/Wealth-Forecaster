// ============================================================
// ALL default assumptions live here.
// Update this file when ASIC guidance or legislation changes.
// Never hardcode rates, caps, or thresholds inline.
// ============================================================

// --- Macro assumptions (ASIC-aligned) ---
export const INFLATION_RATE = 0.025         // 2.5% p.a.
export const WAGE_GROWTH_RATE = 0.035       // 3.5% p.a.

// --- Default return rates ---
export const SUPER_ACCUMULATION_RATE = 0.07  // 7.0% p.a.
export const SUPER_PENSION_RATE = 0.06       // 6.0% p.a.
export const SHARES_RETURN_RATE = 0.045      // 4.5% p.a. capital growth (total return ~8% incl. 3.5% dividend yield)
export const PROPERTY_GROWTH_RATE = 0.04    // 4.0% p.a.
export const DIVIDEND_YIELD = 0.035         // 3.5% p.a.
export const DEFAULT_FRANKING_PCT = 0.70    // 70% franked
export const INVESTMENT_BOND_RETURN_RATE = 0.07  // 7.0% gross return (before 30% internal tax)

// --- Superannuation ---
export const PRESERVATION_AGE = 60          // For those born after 1 July 1964 — hardcoded

// SG rate schedule — key off financial year start
export const SG_RATE_SCHEDULE = [
  { fromFY: 2025, rate: 0.115 },            // 11.5% FY2025
  { fromFY: 2026, rate: 0.12 },             // 12.0% from 1 July 2025
]

export const CONCESSIONAL_CAP = 30_000      // FY2025
export const NON_CONCESSIONAL_CAP = 110_000 // FY2025
export const NON_CONCESSIONAL_BRING_FORWARD_CAP = 330_000 // 3-year bring-forward

// Minimum drawdown rates by age bracket (Account-Based Pension)
export const MIN_DRAWDOWN_RATES = [
  { minAge: 0,  maxAge: 64, rate: 0.04 },
  { minAge: 65, maxAge: 74, rate: 0.05 },
  { minAge: 75, maxAge: 79, rate: 0.06 },
  { minAge: 80, maxAge: 84, rate: 0.07 },
  { minAge: 85, maxAge: 89, rate: 0.09 },
  { minAge: 90, maxAge: 999, rate: 0.14 },
]

export const SUPER_CONTRIBUTIONS_TAX_RATE = 0.15  // 15% within fund
export const DOWNSIZER_CONTRIBUTION_CAP = 300_000 // Max downsizer contribution per person
export const DOWNSIZER_MIN_AGE = 55               // Minimum age for downsizer contribution
export const DIV293_THRESHOLD = 250_000           // Division 293 income threshold
export const DIV293_RATE = 0.15                    // Additional 15% on low-tax contributions

// --- Tax rates (FY2025 — individuals) ---
// Brackets: [lower, upper, base, marginalRate]
export const TAX_BRACKETS = [
  { lower: 0,       upper: 18_200,  base: 0,       rate: 0 },
  { lower: 18_201,  upper: 45_000,  base: 0,       rate: 0.19 },
  { lower: 45_001,  upper: 120_000, base: 5_092,   rate: 0.325 },
  { lower: 120_001, upper: 180_000, base: 29_467,  rate: 0.37 },
  { lower: 180_001, upper: Infinity, base: 51_667, rate: 0.45 },
]

export const MEDICARE_LEVY_RATE = 0.02       // 2%
export const MEDICARE_LEVY_LOWER_THRESHOLD = 26_000  // approx FY2025 shade-in threshold

// --- Capital gains ---
export const CGT_DISCOUNT = 0.50             // 50% for assets held > 12 months
export const CORPORATE_TAX_RATE = 0.30      // Used for franking credit gross-up

// --- Investment bonds ---
export const INVESTMENT_BOND_INTERNAL_TAX = 0.30
export const INVESTMENT_BOND_YEARS_FOR_TAX_FREE = 10
export const INVESTMENT_BOND_125_PCT_RULE = 1.25  // Annual contribution cap = 125% of prior year

// --- FBT ---
export const FBT_RATE = 0.47
export const FBT_GROSS_UP_TYPE1 = 2.0802    // Type 1: GST-claimable benefits
export const FBT_GROSS_UP_TYPE2 = 1.8868    // Type 2: non-GST benefits
export const NOVATED_LEASE_STATUTORY_RATE = 0.20  // Flat 20% post-2011

// Salary packaging caps
export const PBI_GENERAL_CAP = 15_900       // PBI / NFP
export const PBI_MEAL_ENTERTAINMENT_CAP = 2_650
export const QLD_HEALTH_GENERAL_CAP = 9_000 // QLD Health / HHS
export const QLD_HEALTH_MEAL_ENTERTAINMENT_CAP = 2_650

// --- Age Pension (2024-25 rates, indexed March/September) ---
export const AGE_PENSION_AGE = 67                  // Eligibility age
export const AGE_PENSION_MAX_SINGLE = 28_514       // Max annual rate (incl. supplements) — single
export const AGE_PENSION_MAX_COUPLE = 43_006       // Max annual rate (incl. supplements) — couple combined

// Asset test thresholds (homeowner)
export const ASSET_TEST_LOWER_SINGLE_HOMEOWNER = 301_750
export const ASSET_TEST_LOWER_COUPLE_HOMEOWNER = 451_500
export const ASSET_TEST_LOWER_SINGLE_NON_HOMEOWNER = 543_750
export const ASSET_TEST_LOWER_COUPLE_NON_HOMEOWNER = 693_500
// Taper: pension reduces by $3 per fortnight ($78/year) per $1,000 above lower threshold
export const ASSET_TEST_TAPER_RATE = 0.078         // $78 per $1,000 above threshold = 7.8% per $1,000

// Income test thresholds
export const INCOME_TEST_FREE_SINGLE = 5_304       // Annual income-free area — single ($204/fn × 26)
export const INCOME_TEST_FREE_COUPLE = 9_360       // Annual income-free area — couple combined ($360/fn × 26)
// Taper: pension reduces by 50c per $1 above threshold (single), 25c each for couples
export const INCOME_TEST_TAPER_SINGLE = 0.50
export const INCOME_TEST_TAPER_COUPLE = 0.50       // Combined couple taper rate on combined income

// Deeming rates (deemed income from financial assets)
export const DEEMING_LOWER_RATE = 0.0025           // 0.25% on assets up to threshold
export const DEEMING_UPPER_RATE = 0.0225           // 2.25% on assets above threshold
export const DEEMING_THRESHOLD_SINGLE = 60_400     // Single deeming threshold
export const DEEMING_THRESHOLD_COUPLE = 100_200    // Couple combined deeming threshold

// --- Simulation defaults ---
export const DEFAULT_SIMULATION_END_AGE = 90
export const MAX_SIMULATION_END_AGE = 110
export const ILLUSTRATIVE_AGE_THRESHOLD = 100  // Projections labelled illustrative beyond this

// --- Auto-save ---
export const AUTOSAVE_DEBOUNCE_MS = 2000

// --- Investment bond contribution modes ---
export const BOND_CONTRIBUTION_MODES = {
  FIXED: 'fixed',     // Deducted as expense — guaranteed each year
  SURPLUS: 'surplus',  // Funded from surplus waterfall — only when surplus exists
}

// --- Surplus routing destination types ---
export const SURPLUS_DESTINATIONS = {
  OFFSET: 'offset',
  SHARES: 'shares',
  CASH: 'cash',
  SUPER: 'super',
  BONDS: 'bonds',
  OTHER_ASSETS: 'otherAssets',
}

// Drawdown priority — which assets to sell first when expenses exceed income
export const DRAWDOWN_SOURCES = {
  CASH: 'cash',
  SHARES: 'shares',
  BONDS: 'bonds',
  OTHER_ASSETS: 'otherAssets',
  SUPER: 'super',
}

export const DEFAULT_DRAWDOWN_ORDER = ['cash', 'shares', 'bonds', 'otherAssets', 'super']
