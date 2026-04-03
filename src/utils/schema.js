/**
 * Default data model for a new scenario.
 * All user data is stored as structured JSON per scenario in Supabase.
 */

import {
  DEFAULT_SIMULATION_END_AGE,
  INFLATION_RATE,
  WAGE_GROWTH_RATE,
  SUPER_ACCUMULATION_RATE,
  SUPER_PENSION_RATE,
  SHARES_RETURN_RATE,
  PROPERTY_GROWTH_RATE,
  DIVIDEND_YIELD,
  DEFAULT_FRANKING_PCT,
  INVESTMENT_BOND_RETURN_RATE,
  TREASURY_BONDS_RETURN_RATE,
  TREASURY_BONDS_COUPON_RATE,
  COMMODITIES_RETURN_RATE,
  BOND_CONTRIBUTION_MODES,
} from '../constants/index.js'

export function createDefaultPerson(label = 'A') {
  return {
    label,
    name: '',
    dateOfBirth: null,        // ISO date string
    currentSalary: 0,
    wageGrowthRate: WAGE_GROWTH_RATE,
    employerType: 'standard', // 'standard' | 'pbi_nfp' | 'qld_health'
    retirementAge: 60,
    packaging: {
      novatedLease: null,     // see createDefaultNovatedLease()
      pbiGeneral: 0,
      pbiMealEntertainment: 0,
      qldHealthGeneral: 0,
      qldHealthMealEntertainment: 0,
    },
  }
}

export function createDefaultNovatedLease() {
  return {
    vehicleCostPrice: 0,
    annualKmTotal: 0,
    annualKmBusiness: 0,
    annualRunningCosts: 0,
    method: 'statutory',      // 'statutory' | 'ecm'
    isEV: false,
    employeePostTaxContribution: 0,
    activeYears: { from: null, to: null },
  }
}

export function createDefaultSuperHolding() {
  return {
    id: crypto.randomUUID(),
    name: '',
    currentValue: 0,
    returnRate: SUPER_ACCUMULATION_RATE,    // accumulation phase rate (default 7%)
    pensionReturnRate: SUPER_PENSION_RATE,  // pension phase rate (default 6%)
  }
}

export function createDefaultSuper(personLabel = 'A') {
  return {
    personLabel,
    currentBalance: 0,
    holdings: [],              // optional individual fund allocations
    employerScheme: 'sg',     // 'sg' | 'match' | 'fixed_pct'
    employerMatchCapPct: null,
    employerFixedPct: null,
    salarySacrificeAmount: 0,
    voluntaryConcessional: 0,
    voluntaryNonConcessional: 0,
    isTTR: false,
    pensionPhaseFromAge: null, // null = converts at retirement age
    ratePeriods: [
      { fromYear: new Date().getFullYear(), toYear: 2090, rate: SUPER_ACCUMULATION_RATE },
    ],
  }
}

export function createDefaultProperty(isPrimary = false) {
  return {
    isPrimaryResidence: isPrimary,
    currentValue: 0,
    purchasePrice: 0,
    purchaseDate: null,
    mortgageBalance: 0,
    originalLoanAmount: 0,
    originalLoanTermYears: 0,
    interestRate: 0.065,
    loanTermYearsRemaining: 0,
    loanType: 'pi',           // 'pi' | 'io'
    ioEndYear: null,
    offsetBalance: 0,
    offsetAnnualTopUp: 0,
    annualRentalIncome: 0,
    annualPropertyExpenses: 0,
    growthRate: PROPERTY_GROWTH_RATE,
    purchasedCash: false,     // true = no mortgage (owned outright)
    state: null,              // 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT' — for stamp duty + land tax
    isFirstHomeBuyer: false,  // stamp duty exemption/concession
    futurePurchaseYear: null, // year property will be purchased (null = already owned)
    saleEvent: null,          // { year, netProceeds, destination, sellingCostsPct }
    payOffWhenAble: false,    // auto-pay mortgage from liquid assets when affordable
    ownershipPctA: 100,       // % of CGT attributed to Person A (0–100)
  }
}

export function createDefaultShareHolding() {
  return {
    id: crypto.randomUUID(),
    name: '',
    currentValue: 0,
    returnRate: SHARES_RETURN_RATE,
    dividendYield: DIVIDEND_YIELD,
    frankingPct: DEFAULT_FRANKING_PCT,
  }
}

export function createDefaultShares() {
  return {
    currentValue: 0,
    holdings: [],              // optional individual share holdings
    annualContribution: 0,
    contributionMode: BOND_CONTRIBUTION_MODES.SURPLUS,  // 'fixed' | 'surplus' — default surplus (legacy compat)
    annualIncreaseRate: 0,           // % annual increase in contribution (e.g. 0.05 = 5%/yr)
    dividendYield: DIVIDEND_YIELD,
    frankingPct: DEFAULT_FRANKING_PCT,
    preserveCapital: false,
    preserveCapitalFromAge: null,
    ratePeriods: [
      { fromYear: new Date().getFullYear(), toYear: 2090, rate: SHARES_RETURN_RATE },
    ],
  }
}

export function createDefaultInvestmentBond() {
  return {
    id: crypto.randomUUID(),
    name: '',
    currentBalance: 0,
    annualContribution: 0,
    contributionMode: BOND_CONTRIBUTION_MODES.FIXED,  // 'fixed' | 'surplus'
    annualIncreaseRate: 0,        // % annual increase (capped at 25% by 125% rule)
    inceptionDate: null,      // ISO date string — for 10-year clock
    ratePeriods: [
      { fromYear: new Date().getFullYear(), toYear: 2090, rate: 0.07 },
    ],
  }
}

export function createDefaultTreasuryBondHolding() {
  return {
    id: crypto.randomUUID(),
    name: '',
    currentValue: 0,
    returnRate: TREASURY_BONDS_RETURN_RATE,
    couponRate: TREASURY_BONDS_COUPON_RATE,
  }
}

export function createDefaultTreasuryBonds() {
  return {
    currentValue: 0,
    holdings: [],              // optional individual bond holdings
    annualContribution: 0,
    contributionMode: BOND_CONTRIBUTION_MODES.FIXED,
    annualIncreaseRate: 0,
    couponRate: TREASURY_BONDS_COUPON_RATE,
    preserveCapital: false,
    preserveCapitalFromAge: null,
    ratePeriods: [
      { fromYear: new Date().getFullYear(), toYear: 2090, rate: TREASURY_BONDS_RETURN_RATE },
    ],
  }
}

export function createDefaultCommodityHolding() {
  return {
    id: crypto.randomUUID(),
    name: '',
    currentValue: 0,
    returnRate: COMMODITIES_RETURN_RATE,
  }
}

export function createDefaultCommodities() {
  return {
    currentValue: 0,
    holdings: [],              // optional individual commodity holdings
    annualContribution: 0,
    contributionMode: BOND_CONTRIBUTION_MODES.FIXED,
    annualIncreaseRate: 0,
    ratePeriods: [
      { fromYear: new Date().getFullYear(), toYear: 2090, rate: COMMODITIES_RETURN_RATE },
    ],
  }
}

export function createDefaultExpenseNode(label = '', type = 'group') {
  return {
    id: crypto.randomUUID(),
    label,
    type,                     // 'group' | 'category' | 'subcategory'
    amountType: 'annual',     // 'annual' | 'monthly' | 'one_off' | 'recurring'
    amount: 0,
    recurringEveryYears: null, // only used when amountType === 'recurring'
    isDiscretionary: false,
    activeFrom: null,         // year or null
    activeTo: null,           // year or null
    inflationRate: null,      // null = inherit global inflation
    notes: '',
    children: [],
  }
}

export function createDefaultExpenseHierarchy() {
  return createDefaultExpenseNode('Expenses', 'group')
}

export function createDefaultAssumptions() {
  return {
    inflationRate: INFLATION_RATE,
    wageGrowthRate: WAGE_GROWTH_RATE,
    superAccumulationRate: SUPER_ACCUMULATION_RATE,
    superPensionRate: SUPER_PENSION_RATE,
    sharesReturnRate: SHARES_RETURN_RATE,
    propertyGrowthRate: PROPERTY_GROWTH_RATE,
    dividendYield: DIVIDEND_YIELD,
    frankingPct: DEFAULT_FRANKING_PCT,
    investmentBondRate: INVESTMENT_BOND_RETURN_RATE,
    treasuryBondsReturnRate: TREASURY_BONDS_RETURN_RATE,
    treasuryBondsCouponRate: TREASURY_BONDS_COUPON_RATE,
    commoditiesReturnRate: COMMODITIES_RETURN_RATE,
  }
}

export function createDefaultOtherAsset() {
  return {
    id: crypto.randomUUID(),
    name: '',
    currentValue: 0,
    annualContribution: 0,
    contributionMode: BOND_CONTRIBUTION_MODES.FIXED,  // 'fixed' | 'surplus'
    annualIncreaseRate: 0,     // % annual increase in contribution
    returnRate: 0.07,          // gross annual return
    canDrawdown: true,         // available in deficit waterfall
    drawdownOrder: 5,          // after bonds (lower = drawn earlier)
  }
}

export function createDefaultDebt(type = 'personal_loan') {
  const base = {
    id: crypto.randomUUID(),
    name: '',
    type,                        // 'personal_loan' | 'lease' | 'credit_card'
    currentBalance: 0,
    interestRate: 0.08,          // annual rate
    startYear: null,             // year debt was taken (null = already held)
  }

  if (type === 'personal_loan') {
    return {
      ...base,
      interestRate: 0.08,
      monthlyRepayment: 0,       // fixed monthly P&I repayment
      termYears: 5,              // original loan term
    }
  }

  if (type === 'lease') {
    return {
      ...base,
      interestRate: 0.07,
      termYears: 5,
      residualValue: 0,          // balloon payment at end of lease
      monthlyRepayment: 0,       // auto-calculated from balance, term, residual if 0
    }
  }

  // credit_card
  return {
    ...base,
    interestRate: 0.20,
    monthlyRepayment: 0,         // fixed repayment (0 = minimum 2% of balance)
    repaymentMode: 'payoff',     // 'payoff' | 'revolving'
  }
}

export function createDefaultOtherIncomeSource() {
  return {
    id: crypto.randomUUID(),
    name: '',
    amount: 0,
    amountType: 'annual',         // 'annual' | 'monthly' | 'one_off'
    activeFrom: null,             // year (null = from start)
    activeTo: null,               // year (null = indefinite; same as activeFrom for one_off)
    adjustmentType: 'none',       // 'none' | 'percent' | 'dollar'
    adjustmentRate: 0,            // e.g. 0.03 for +3%/yr, or -2000 for -$2k/yr
    isTaxable: true,              // included in assessable income for tax calc
    person: 'A',                  // 'A' | 'B' | 'household' — determines whose tax return
    notes: '',
    routeTo: 'cashflow',            // 'cashflow' | 'shares' | 'treasuryBonds' | 'commodities' | 'bonds' | 'otherAssets' | 'cash' — where to direct funds post-retirement
  }
}

export function createDefaultScenario(name = 'Base Plan') {
  return {
    id: crypto.randomUUID(),
    name,
    simulationEndAge: DEFAULT_SIMULATION_END_AGE,
    assumptions: createDefaultAssumptions(),
    household: {
      personA: createDefaultPerson('A'),
      personB: createDefaultPerson('B'),
    },
    super: [
      createDefaultSuper('A'),
      createDefaultSuper('B'),
    ],
    properties: [],
    shares: createDefaultShares(),
    treasuryBonds: createDefaultTreasuryBonds(),
    commodities: createDefaultCommodities(),
    investmentBonds: [],
    otherAssets: [],
    expenses: createDefaultExpenseHierarchy(),
    otherIncome: [],
    debts: [],
    events: [],
    surplusRoutingOrder: ['offset', 'shares', 'treasuryBonds', 'commodities', 'cash'],
    drawdownOrder: ['cash', 'shares', 'treasuryBonds', 'commodities', 'bonds', 'otherAssets', 'super'],
  }
}
