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
export const TREASURY_BONDS_RETURN_RATE = 0.04   // 4.0% p.a. capital growth
export const TREASURY_BONDS_COUPON_RATE = 0.03   // 3.0% p.a. coupon (income)
export const COMMODITIES_RETURN_RATE = 0.05      // 5.0% p.a. capital growth, no income

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

// --- Stamp duty by state (2024-25 rates, general residential transfer) ---
// Each state: array of { lower, upper, base, rate } brackets
// Rate is marginal rate on amount above 'lower'
export const STAMP_DUTY = {
  NSW: [
    { lower: 0,        upper: 17_000,   base: 0,      rate: 0.0125 },
    { lower: 17_000,   upper: 36_000,   base: 212,    rate: 0.015 },
    { lower: 36_000,   upper: 97_000,   base: 497,    rate: 0.0175 },
    { lower: 97_000,   upper: 364_000,  base: 1_565,  rate: 0.035 },
    { lower: 364_000,  upper: 1_212_000, base: 10_910, rate: 0.045 },
    { lower: 1_212_000, upper: Infinity, base: 49_070, rate: 0.055 },
  ],
  VIC: [
    { lower: 0,        upper: 25_000,   base: 0,      rate: 0.014 },
    { lower: 25_000,   upper: 130_000,  base: 350,    rate: 0.024 },
    { lower: 130_000,  upper: 960_000,  base: 2_870,  rate: 0.06 },
    { lower: 960_000,  upper: 2_000_000, base: 52_670, rate: 0.055 },  // premium rate
    { lower: 2_000_000, upper: Infinity, base: 110_000, rate: 0.065 },
  ],
  QLD: [
    { lower: 0,        upper: 5_000,    base: 0,      rate: 0 },
    { lower: 5_000,    upper: 75_000,   base: 0,      rate: 0.015 },
    { lower: 75_000,   upper: 540_000,  base: 1_050,  rate: 0.035 },
    { lower: 540_000,  upper: 1_000_000, base: 17_325, rate: 0.045 },
    { lower: 1_000_000, upper: Infinity, base: 38_025, rate: 0.0575 },
  ],
  SA: [
    { lower: 0,        upper: 12_000,   base: 0,      rate: 0.01 },
    { lower: 12_000,   upper: 30_000,   base: 120,    rate: 0.02 },
    { lower: 30_000,   upper: 50_000,   base: 480,    rate: 0.03 },
    { lower: 50_000,   upper: 100_000,  base: 1_080,  rate: 0.035 },
    { lower: 100_000,  upper: 200_000,  base: 2_830,  rate: 0.04 },
    { lower: 200_000,  upper: 250_000,  base: 6_830,  rate: 0.0425 },
    { lower: 250_000,  upper: 300_000,  base: 8_955,  rate: 0.0475 },
    { lower: 300_000,  upper: 500_000,  base: 11_330, rate: 0.05 },
    { lower: 500_000,  upper: Infinity, base: 21_330, rate: 0.055 },
  ],
  WA: [
    { lower: 0,        upper: 120_000,  base: 0,      rate: 0.019 },
    { lower: 120_000,  upper: 150_000,  base: 2_280,  rate: 0.0285 },
    { lower: 150_000,  upper: 360_000,  base: 3_135,  rate: 0.038 },
    { lower: 360_000,  upper: 725_000,  base: 11_115, rate: 0.0475 },
    { lower: 725_000,  upper: Infinity, base: 28_453, rate: 0.0515 },
  ],
  TAS: [
    { lower: 0,        upper: 3_000,    base: 50,     rate: 0 },
    { lower: 3_000,    upper: 25_000,   base: 50,     rate: 0.0175 },
    { lower: 25_000,   upper: 75_000,   base: 435,    rate: 0.025 },
    { lower: 75_000,   upper: 200_000,  base: 1_685,  rate: 0.035 },
    { lower: 200_000,  upper: 375_000,  base: 6_060,  rate: 0.04 },
    { lower: 375_000,  upper: 725_000,  base: 13_060, rate: 0.0425 },
    { lower: 725_000,  upper: Infinity, base: 27_935, rate: 0.045 },
  ],
  NT: [
    // NT uses a formula-based approach; simplified to bracket approximation
    { lower: 0,        upper: 525_000,  base: 0,      rate: 0.0 },  // calculated via formula below threshold
    { lower: 525_000,  upper: Infinity, base: 23_928, rate: 0.0495 },
  ],
  ACT: [
    { lower: 0,        upper: 260_000,  base: 0,      rate: 0.006 },
    { lower: 260_000,  upper: 300_000,  base: 1_560,  rate: 0.0227 },
    { lower: 300_000,  upper: 500_000,  base: 2_468,  rate: 0.0344 },
    { lower: 500_000,  upper: 750_000,  base: 9_348,  rate: 0.0418 },
    { lower: 750_000,  upper: 1_000_000, base: 19_798, rate: 0.0506 },
    { lower: 1_000_000, upper: 1_455_000, base: 32_448, rate: 0.058 },
    { lower: 1_455_000, upper: Infinity, base: 58_838, rate: 0.07 },
  ],
}

// First Home Buyer stamp duty exemption/concession thresholds (purchase price up to which full or partial exemption applies)
export const FIRST_HOME_BUYER_EXEMPTION = {
  NSW: { exemptUpTo: 800_000, concessionUpTo: 1_000_000 },
  VIC: { exemptUpTo: 600_000, concessionUpTo: 750_000 },
  QLD: { exemptUpTo: 700_000, concessionUpTo: 800_000 },
  SA:  { exemptUpTo: 0, concessionUpTo: 0 },  // SA has no stamp duty concession for FHB (has grant instead)
  WA:  { exemptUpTo: 430_000, concessionUpTo: 530_000 },
  TAS: { exemptUpTo: 750_000, concessionUpTo: 0 },
  NT:  { exemptUpTo: 650_000, concessionUpTo: 0 },
  ACT: { exemptUpTo: 0, concessionUpTo: 0 },  // ACT: complex owner-occupier concession, simplified to 0
}

// --- Land tax by state (2024-25 rates, investment properties only, PPOR exempt) ---
// Progressive brackets: [{ lower, upper, base, rate }] — same structure as stamp duty
export const LAND_TAX = {
  NSW: [
    { lower: 0,          upper: 1_075_000, base: 0,      rate: 0 },
    { lower: 1_075_000,  upper: 6_680_000, base: 100,    rate: 0.016 },
    { lower: 6_680_000,  upper: Infinity,  base: 89_780, rate: 0.02 },
  ],
  VIC: [
    { lower: 0,        upper: 50_000,    base: 0,     rate: 0 },
    { lower: 50_000,   upper: 100_000,   base: 0,     rate: 0.0005 },
    { lower: 100_000,  upper: 300_000,   base: 25,    rate: 0.002 },
    { lower: 300_000,  upper: 600_000,   base: 425,   rate: 0.005 },
    { lower: 600_000,  upper: 1_000_000, base: 1_925, rate: 0.008 },
    { lower: 1_000_000, upper: 1_800_000, base: 5_125, rate: 0.01 },
    { lower: 1_800_000, upper: 3_000_000, base: 13_125, rate: 0.0125 },
    { lower: 3_000_000, upper: Infinity,  base: 28_125, rate: 0.0225 },
  ],
  QLD: [
    { lower: 0,          upper: 600_000,   base: 0,      rate: 0 },
    { lower: 600_000,    upper: 1_000_000, base: 500,    rate: 0.01 },
    { lower: 1_000_000,  upper: 3_000_000, base: 4_500,  rate: 0.0175 },
    { lower: 3_000_000,  upper: 5_000_000, base: 39_500, rate: 0.0225 },
    { lower: 5_000_000,  upper: 10_000_000, base: 84_500, rate: 0.0275 },
    { lower: 10_000_000, upper: Infinity,   base: 222_000, rate: 0.035 },
  ],
  SA: [
    { lower: 0,          upper: 450_000,   base: 0,     rate: 0 },
    { lower: 450_000,    upper: 834_000,   base: 0,     rate: 0.005 },
    { lower: 834_000,    upper: 1_167_000, base: 1_920, rate: 0.01 },
    { lower: 1_167_000,  upper: Infinity,  base: 5_250, rate: 0.024 },
  ],
  WA: [
    { lower: 0,        upper: 300_000,  base: 0,   rate: 0 },
    { lower: 300_000,  upper: Infinity, base: 0,   rate: 0.0025 },
  ],
  TAS: [
    { lower: 0,        upper: 87_000,   base: 0,   rate: 0 },
    { lower: 87_000,   upper: 350_000,  base: 0,   rate: 0.005 },
    { lower: 350_000,  upper: Infinity, base: 1_315, rate: 0.01 },
  ],
  NT: [],  // NT has no land tax
  ACT: [
    { lower: 0, upper: Infinity, base: 0, rate: 0.0054 },
  ],
}

// --- Default selling costs ---
export const DEFAULT_SELLING_COSTS_PCT = 0.025  // 2.5% (agent ~2%, conveyancing, marketing)

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
  TREASURY_BONDS: 'treasuryBonds',
  COMMODITIES: 'commodities',
  CASH: 'cash',
  SUPER: 'super',
  BONDS: 'bonds',
  OTHER_ASSETS: 'otherAssets',
}

// Drawdown priority — which assets to sell first when expenses exceed income
export const DRAWDOWN_SOURCES = {
  CASH: 'cash',
  SHARES: 'shares',
  TREASURY_BONDS: 'treasuryBonds',
  COMMODITIES: 'commodities',
  BONDS: 'bonds',
  OTHER_ASSETS: 'otherAssets',
  SUPER: 'super',
}

export const DEFAULT_DRAWDOWN_ORDER = ['cash', 'shares', 'treasuryBonds', 'commodities', 'bonds', 'otherAssets', 'super']
