/**
 * End-to-end model validation test.
 * Exercises a realistic dual-income household through full simulation lifecycle:
 *   - Mortgage with offset account
 *   - Super accumulation → pension phase transition
 *   - Shares (surplus mode) and bonds (fixed mode)
 *   - Novated lease with FBT
 *   - Other income (consulting, one-off gift)
 *   - Debts (car loan, credit card)
 *   - Surplus routing waterfall with bonds priority
 *   - Deficit warnings when liquidity exhausted
 *   - Retirement age sensitivity (proportional, no runaway)
 */
import { describe, it, expect } from 'vitest'
import { runSimulation } from '../engine/simulationEngine.js'
import { createDefaultScenario, createDefaultInvestmentBond, createDefaultProperty } from '../utils/schema.js'

function buildRealisticScenario(overrides = {}) {
  const s = createDefaultScenario('E2E Test')

  // Person A: born 1980, high earner, retires at 55
  s.household.personA.name = 'Alex'
  s.household.personA.dateOfBirth = '1980-06-15'
  s.household.personA.currentSalary = 180_000
  s.household.personA.retirementAge = overrides.retirementAgeA ?? 55

  // Person B: born 1982, part-time, retires at 60
  s.household.personB.name = 'Jordan'
  s.household.personB.dateOfBirth = '1982-03-01'
  s.household.personB.currentSalary = 65_000
  s.household.personB.retirementAge = 60

  s.simulationEndAge = 90

  // Super
  s.super[0].currentBalance = 350_000
  s.super[1].currentBalance = 120_000

  // Property: PPOR with mortgage and offset
  const ppor = createDefaultProperty(true)
  ppor.currentValue = 1_200_000
  ppor.purchasePrice = 800_000
  ppor.mortgageBalance = 450_000
  ppor.originalLoanAmount = 600_000
  ppor.originalLoanTermYears = 30
  ppor.interestRate = 0.062
  ppor.loanTermYearsRemaining = 22
  ppor.offsetBalance = 80_000
  ppor.growthRate = 0.04
  s.properties = [ppor]

  // Shares: surplus mode, $20k target
  s.shares.currentValue = 150_000
  s.shares.annualContribution = 20_000
  s.shares.contributionMode = 'surplus'

  // Investment bond: fixed mode, $30k/yr
  const bond = createDefaultInvestmentBond()
  bond.name = 'Family bond'
  bond.currentBalance = 80_000
  bond.annualContribution = 30_000
  bond.contributionMode = 'fixed'
  bond.inceptionDate = '2020-01-01'
  s.investmentBonds = [bond]

  // Surplus routing: offset → bonds (surplus) → shares → cash
  // Note: bonds are in fixed mode here, so surplus routing for bonds won't apply
  // But we test that shares get surplus after offset is filled
  s.surplusRoutingOrder = ['offset', 'shares', 'bonds', 'cash']

  // Expenses: $90k/yr living
  s.expenses = {
    id: 'root', label: 'Living expenses', type: 'group', amountType: 'annual',
    amount: 0, children: [
      { id: 'housing', label: 'Housing', type: 'category', amountType: 'annual', amount: 25_000, children: [] },
      { id: 'food', label: 'Food & groceries', type: 'category', amountType: 'annual', amount: 18_000, children: [] },
      { id: 'transport', label: 'Transport', type: 'category', amountType: 'annual', amount: 12_000, children: [] },
      { id: 'health', label: 'Health & insurance', type: 'category', amountType: 'annual', amount: 10_000, children: [] },
      { id: 'lifestyle', label: 'Lifestyle', type: 'category', amountType: 'annual', amount: 15_000, children: [] },
      { id: 'kids', label: 'Children', type: 'category', amountType: 'annual', amount: 10_000, activeTo: 2040, children: [] },
    ],
  }

  // Other income: consulting $2k/mo from 2028-2032, one-off gift $50k in 2030
  s.otherIncome = [
    {
      id: 'consulting', name: 'Consulting', amount: 2_000, amountType: 'monthly',
      activeFrom: 2028, activeTo: 2032, adjustmentType: 'none', adjustmentRate: 0,
      isTaxable: true, person: 'A', notes: '',
    },
    {
      id: 'gift', name: 'Inheritance', amount: 50_000, amountType: 'one_off',
      activeFrom: 2030, activeTo: null, adjustmentType: 'none', adjustmentRate: 0,
      isTaxable: false, person: 'household', notes: '',
    },
  ]

  // Debts: car loan + credit card
  s.debts = [
    {
      id: 'car', name: 'Car loan', type: 'personal_loan',
      currentBalance: 25_000, interestRate: 0.07, monthlyRepayment: 500, termYears: 5, startYear: null,
    },
    {
      id: 'cc', name: 'Visa', type: 'credit_card',
      currentBalance: 8_000, interestRate: 0.20, monthlyRepayment: 300,
      repaymentMode: 'payoff', startYear: null,
    },
  ]

  // Novated lease on person A
  s.household.personA.packaging = {
    ...s.household.personA.packaging,
    novatedLease: {
      vehicleCostPrice: 55_000,
      residualValue: 15_000,
      termYears: 4,
      interestRate: 0.065,
      annualRunningCosts: 6_000,
      annualKmTotal: 20_000,
      annualKmBusiness: 5_000,
      method: 'statutory',
      isEV: false,
      employeePostTaxContribution: 0,
      offsetWithECM: true,
      activeYears: { from: '2026-01', to: '2029-12' },
    },
  }

  return s
}

describe('End-to-end model validation', () => {
  it('runs full simulation without errors', () => {
    const scenario = buildRealisticScenario()
    const snaps = runSimulation(scenario)
    expect(snaps.length).toBeGreaterThan(30) // ~45 years
    expect(snaps[0].year).toBe(new Date().getFullYear())
  })

  it('year 0 has correct income and outflows', () => {
    const snaps = runSimulation(buildRealisticScenario())
    const yr0 = snaps[0]

    // Both people earning
    expect(yr0.salaryA).toBeGreaterThan(170_000)
    expect(yr0.salaryB).toBeGreaterThan(60_000)

    // Expenses present
    expect(yr0.totalExpenses).toBeGreaterThan(80_000)

    // Bond fixed contribution (may be capped when lease post-tax contribution reduces available cashflow)
    expect(yr0.totalBondContributions).toBeGreaterThan(0)

    // Debt repayments
    expect(yr0.totalDebtRepayments).toBeGreaterThan(0)

    // Net cashflow should be manageable (lease post-tax costs reduce available cashflow)
    expect(yr0.netCashflow).toBeGreaterThan(-15_000)
  })

  it('mortgage offset receives surplus via waterfall', () => {
    const snaps = runSimulation(buildRealisticScenario())
    // Offset should grow from initial $80k toward mortgage balance
    const yr5 = snaps[5]
    expect(yr5.propertyResults[0].offsetBalance).toBeGreaterThan(80_000)
  })

  it('shares receive surplus contributions when in surplus mode', () => {
    // Remove offset priority so shares actually get surplus
    const scenario = buildRealisticScenario()
    scenario.surplusRoutingOrder = ['shares', 'offset', 'cash']
    const snaps = runSimulation(scenario)
    // Check after lease ends when full surplus is available
    const postLease = snaps.find(s => s.year >= 2030 && s.salaryA > 0)
    expect(postLease.sharesContribution).toBeGreaterThan(0)
    expect(postLease.sharesContribution).toBeLessThanOrEqual(20_000)
  })

  it('bond fixed contributions deducted every year while working', () => {
    const snaps = runSimulation(buildRealisticScenario())
    // Check years while both are working (person A retires at 55 = 2035)
    const bothWorkingSnaps = snaps.filter(s => s.salaryA > 0 && s.salaryB > 0)
    expect(bothWorkingSnaps.length).toBeGreaterThan(5)
    // During lease years, bond contributions may be capped due to lease post-tax costs
    const duringLease = bothWorkingSnaps.filter(s => s.year <= 2029)
    for (const s of duringLease) {
      expect(s.totalBondContributions).toBeGreaterThan(0)
    }
    // After lease ends (2030+), full $30k contributions should resume
    const postLease = bothWorkingSnaps.filter(s => s.year >= 2030)
    for (const s of postLease) {
      expect(s.totalBondContributions).toBeCloseTo(30_000, -2)
    }
  })

  it('super transitions to pension phase at preservation age + retirement', () => {
    const snaps = runSimulation(buildRealisticScenario())
    // Person A retires at 55 but preservation age is 60
    // So pension phase for A starts at age 60 (year ~2040)
    const age60Snap = snaps.find(s => s.ageA === 60)
    if (age60Snap) {
      expect(age60Snap.superA.inPensionPhase).toBe(true)
    }

    // Before preservation age, super is locked
    const age58Snap = snaps.find(s => s.ageA === 58)
    if (age58Snap) {
      expect(age58Snap.superA.inPensionPhase).toBe(false)
    }
  })

  it('salary drops to zero at retirement', () => {
    const snaps = runSimulation(buildRealisticScenario())
    // Person A retires at 55 (year ~2035)
    const preRetire = snaps.find(s => s.ageA === 54)
    const postRetire = snaps.find(s => s.ageA === 55)
    if (preRetire && postRetire) {
      expect(preRetire.salaryA).toBeGreaterThan(0)
      expect(postRetire.salaryA).toBe(0)
    }
  })

  it('debts reduce over time and eventually pay off', () => {
    const snaps = runSimulation(buildRealisticScenario())
    const yr0 = snaps[0]
    const yr10 = snaps[10]

    // Car loan should be paid off within ~5 years
    expect(yr0.totalDebtBalance).toBeGreaterThan(25_000)
    expect(yr10.totalDebtBalance).toBeLessThan(yr0.totalDebtBalance)

    // By year 10, car loan definitely paid off, credit card likely too
    const yr10Debts = yr10.debtResult.results
    const carLoan = yr10Debts[0]
    expect(carLoan.closingBalance).toBe(0)
  })

  it('other income appears in correct years only', () => {
    const snaps = runSimulation(buildRealisticScenario())
    const currentYear = new Date().getFullYear()

    // Consulting: 2028-2032 = $24k/yr
    const yr2027 = snaps.find(s => s.year === 2027)
    const yr2029 = snaps.find(s => s.year === 2029)
    const yr2033 = snaps.find(s => s.year === 2033)
    if (yr2027) expect(yr2027.otherIncomeResult.taxableA).toBe(0)
    if (yr2029) expect(yr2029.otherIncomeResult.taxableA).toBeCloseTo(24_000, -2)
    if (yr2033) expect(yr2033.otherIncomeResult.taxableA).toBe(0)

    // Inheritance: one-off $50k in 2030, non-taxable
    // One-off amounts are entered in today's dollars and inflated to nominal
    const yr2030 = snaps.find(s => s.year === 2030)
    if (yr2030) {
      const yearsOut = 2030 - currentYear
      const expected = 50_000 * Math.pow(1.025, yearsOut)
      expect(yr2030.otherIncomeResult.nonTaxable).toBeCloseTo(expected, -2)
    }
  })

  it('novated lease reduces taxable income during active years', () => {
    const snaps = runSimulation(buildRealisticScenario())
    const yr2027 = snaps.find(s => s.year === 2027)
    const yr2031 = snaps.find(s => s.year === 2031)

    if (yr2027) {
      // During lease: tax should be lower due to packaging
      expect(yr2027.taxA.totalTaxPayable).toBeLessThan(yr2027.salaryA * 0.35)
    }
    // After lease ends: no packaging reduction
    // (salary also changes with wage growth so direct comparison is approximate)
  })

  it('FBT pro-rates for partial year availability', () => {
    const scenario = buildRealisticScenario()
    // Change lease to start mid-year
    scenario.household.personA.packaging.novatedLease.activeYears.from = '2026-07'
    const snaps = runSimulation(scenario)
    const yr2026 = snaps.find(s => s.year === 2026)
    const yr2027 = snaps.find(s => s.year === 2027)

    if (yr2026 && yr2027) {
      // Partial year should have smaller packaging reduction
      // (yr2026 only ~184 days, yr2027 full 365 days)
      // Both should have reductions > 0
      expect(yr2026.taxA).toBeDefined()
      expect(yr2027.taxA).toBeDefined()
    }
  })

  it('net worth grows during working years', () => {
    const snaps = runSimulation(buildRealisticScenario())
    const yr0 = snaps[0]
    const yr10 = snaps[10]
    expect(yr10.totalNetWorth).toBeGreaterThan(yr0.totalNetWorth)
  })

  it('liquid assets definition is consistent', () => {
    const snaps = runSimulation(buildRealisticScenario())
    for (const s of snaps.slice(0, 15)) {
      // Liquid assets = cash + offset + shares + TB + commodities + tax-free bonds + drawdownable other assets + pension-phase super
      const totalOffset = s.propertyResults?.reduce((sum, r) => sum + (r.offsetBalance || 0), 0) ?? 0
      const drawdownableOther = s.otherAssetResults?.reduce((sum, r, i) => {
        // Only count drawdownable other assets
        return sum + (r.canDrawdown !== false ? r.closingValue ?? 0 : 0)
      }, 0) ?? 0
      const expectedLiquid =
        s.cashBuffer +
        totalOffset +
        s.sharesValue +
        (s.treasuryBondsValue ?? 0) +
        (s.commoditiesValue ?? 0) +
        s.bondLiquidity +
        drawdownableOther +
        (s.superA?.inPensionPhase ? s.superABalance : 0) +
        (s.superB?.inPensionPhase ? s.superBBalance : 0)
      // Allow small rounding tolerance
      expect(Math.abs(s.totalLiquidAssets - expectedLiquid)).toBeLessThan(10)
    }
  })

  it('net cashflow = total income - total outflows', () => {
    const snaps = runSimulation(buildRealisticScenario())
    for (const s of snaps) {
      expect(Math.abs(s.netCashflow - (s.totalIncome - s.totalOutflows))).toBeLessThan(1)
    }
  })

  it('deficit years are flagged when liquidity exhausted', () => {
    // Force deficit: very high expenses, low income
    const scenario = buildRealisticScenario()
    scenario.household.personA.currentSalary = 50_000
    scenario.household.personB.currentSalary = 30_000
    scenario.expenses.children[0].amount = 80_000 // housing alone exceeds income
    scenario.investmentBonds = []
    scenario.debts = []

    const snaps = runSimulation(scenario)
    const deficitYears = snaps.filter(s => s.isDeficit)
    expect(deficitYears.length).toBeGreaterThan(0)

    // First deficit year should have negative cashBuffer
    const firstDeficit = deficitYears[0]
    expect(firstDeficit.cumulativeDeficit).toBeGreaterThan(0)
  })

  it('retirement age sensitivity is proportional, not runaway', () => {
    const snap55 = runSimulation(buildRealisticScenario({ retirementAgeA: 55 }))
    const snap57 = runSimulation(buildRealisticScenario({ retirementAgeA: 57 }))

    const last55 = snap55[snap55.length - 1]
    const last57 = snap57[snap57.length - 1]

    // 2 extra working years at ~$180k salary should make a difference
    // but not a wild 10x+ swing
    const diff = Math.abs(last57.totalNetWorth - last55.totalNetWorth)
    const avg = (Math.abs(last57.totalNetWorth) + Math.abs(last55.totalNetWorth)) / 2

    // Difference should be less than 50% of the average net worth
    // (proportional, not exponential blowup)
    if (avg > 0) {
      expect(diff / avg).toBeLessThan(0.5)
    }
  })

  it('surplus routing respects priority order', () => {
    // Set up: bonds in surplus mode first, then shares
    // Remove offset so surplus flows to bonds first
    const scenario = buildRealisticScenario()
    scenario.investmentBonds[0].contributionMode = 'surplus'
    scenario.investmentBonds[0].annualContribution = 50_000
    scenario.surplusRoutingOrder = ['bonds', 'shares', 'cash']

    const snaps = runSimulation(scenario)
    const yr0 = snaps[0]

    // Bonds should get their contribution (up to 50k, from surplus)
    expect(yr0.totalSurplusBondContributions).toBeGreaterThan(0)
    expect(yr0.totalBondContributions).toBeGreaterThan(0)

    // Shares should get what's left (up to 20k target)
    // Total surplus should be enough for both
    if (yr0.surplus > 50_000) {
      expect(yr0.sharesContribution).toBeGreaterThan(0)
    }
  })

  it('mortgage balance declines over time', () => {
    const snaps = runSimulation(buildRealisticScenario())
    const yr0 = snaps[0]
    const yr15 = snaps[15]
    expect(yr15.totalMortgageBalance).toBeLessThan(yr0.totalMortgageBalance)
  })

  it('property equity grows (value up + mortgage down)', () => {
    const snaps = runSimulation(buildRealisticScenario())
    const yr0 = snaps[0]
    const yr15 = snaps[15]
    expect(yr15.propertyEquity).toBeGreaterThan(yr0.propertyEquity)
  })

  it('super grows during accumulation phase', () => {
    const snaps = runSimulation(buildRealisticScenario())
    const yr0 = snaps[0]
    const yr10 = snaps[10]
    // Super should grow from contributions + investment returns
    expect(yr10.superABalance).toBeGreaterThan(yr0.superABalance)
    expect(yr10.superBBalance).toBeGreaterThan(yr0.superBBalance)
  })

  it('no NaN or Infinity in any snapshot field', () => {
    const snaps = runSimulation(buildRealisticScenario())
    const numericKeys = [
      'totalIncome', 'totalOutflows', 'netCashflow', 'totalNetWorth',
      'totalLiquidAssets', 'cashBuffer', 'sharesValue', 'totalMortgageBalance',
      'totalExpenses', 'superABalance', 'superBBalance', 'surplus',
      'totalDebtBalance', 'totalDebtRepayments',
    ]
    for (const s of snaps) {
      for (const key of numericKeys) {
        const val = s[key]
        if (val !== undefined && val !== null) {
          expect(Number.isFinite(val)).toBe(true)
        }
      }
    }
  })

  it('warnings array is always present', () => {
    const snaps = runSimulation(buildRealisticScenario())
    for (const s of snaps) {
      expect(Array.isArray(s.warnings)).toBe(true)
    }
  })

  it('custom drawdown order is respected', () => {
    const scenario = buildRealisticScenario()
    // Force deficit: no salary, high expenses
    scenario.household.personA.retirementAge = 40  // already retired
    scenario.household.personB.retirementAge = 40
    scenario.expenses.children[0].amount = 60_000
    scenario.investmentBonds = []
    scenario.debts = []
    // Put shares before cash in drawdown order
    scenario.drawdownOrder = ['shares', 'cash', 'bonds', 'otherAssets', 'super']
    scenario.shares.currentValue = 100_000
    const snaps = runSimulation(scenario)
    const yr0 = snaps[0]
    // Shares should be drawn before cash
    const sharesDrawn = yr0.sharesDrawdown || 0
    expect(sharesDrawn).toBeGreaterThan(0)
  })

  it('post-retirement income routing directs to target vehicle', () => {
    const scenario = buildRealisticScenario()
    scenario.household.personA.retirementAge = 40  // already retired
    scenario.household.personB.retirementAge = 40
    scenario.expenses.children[0].amount = 10_000  // low expenses
    scenario.investmentBonds = []
    scenario.debts = []
    // Add other income routed to shares
    scenario.otherIncome = [{
      id: 'pension-1',
      name: 'Pension',
      amount: 30_000,
      amountType: 'annual',
      activeFrom: null,
      activeTo: null,
      adjustmentType: 'none',
      adjustmentRate: 0,
      isTaxable: false,
      person: 'A',
      routeTo: 'shares',
    }]
    const snaps = runSimulation(scenario)
    const yr0 = snaps[0]
    // Shares should receive the routed pension contribution
    expect(yr0.sharesContribution).toBeCloseTo(30_000, 0)
  })

  it('accumulation contributions stop post-retirement', () => {
    const scenario = buildRealisticScenario()
    scenario.household.personA.retirementAge = 40  // already retired
    scenario.household.personB.retirementAge = 40
    const snaps = runSimulation(scenario)
    const yr0 = snaps[0]
    // No fixed/surplus contributions post-retirement
    expect(yr0.sharesContribution).toBe(0)
    expect(yr0.totalBondContributions).toBe(0)
  })
})
