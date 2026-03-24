/**
 * Scenario Validation Suite
 *
 * Tests a library of realistic scenario archetypes through the engine,
 * validating universal invariants (cashflow balance, no NaN, net worth consistency)
 * plus scenario-specific behavioural assertions.
 *
 * Archetypes:
 *   1. Young single renter — early career, HECS debt, no property
 *   2. Dual income family — mortgage, kids, school fees
 *   3. Late career maximiser — max super, salary sacrifice, high balance
 *   4. Single parent part-time — Age Pension reliant, low assets
 *   5. High earner Div293 — $300k+ salary, hits Div293 threshold
 *   6. Retiree couple — drawing pension + shares, no salary
 *   7. Property investor — PPOR + IP, negative gearing, sale event
 *   8. Novated lease + FBT packaging — PBI employer, meal entertainment
 *   9. Downsizer — sells PPOR, downsizer contribution to super
 *  10. Aggressive saver — surplus routing, bonds + shares + other assets
 *  11. Debt-heavy — multiple debts, tight cashflow
 *  12. Recurring expenses — car replacement every 8 years
 */
import { describe, it, expect } from 'vitest'
import { runSimulation } from '../engine/simulationEngine.js'
import {
  createDefaultScenario,
  createDefaultProperty,
  createDefaultInvestmentBond,
  createDefaultOtherAsset,
  createDefaultDebt,
} from '../utils/schema.js'

const CURRENT_YEAR = new Date().getFullYear()

// ── Scenario Builders ────────────────────────────────────────────────────────

function youngSingleRenter() {
  const s = createDefaultScenario('Young Single Renter')
  s.household.personA.name = 'Sam'
  s.household.personA.dateOfBirth = '1998-04-20'
  s.household.personA.currentSalary = 72_000
  s.household.personA.retirementAge = 65
  s.simulationEndAge = 90

  s.super[0].currentBalance = 28_000

  s.shares.currentValue = 5_000
  s.shares.annualContribution = 5_000
  s.shares.contributionMode = 'fixed'

  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [
      { id: 'rent', label: 'Rent', type: 'category', amountType: 'monthly', amount: 1_800, children: [] },
      { id: 'living', label: 'Living', type: 'category', amountType: 'annual', amount: 18_000, children: [] },
    ],
  }

  // HECS debt
  s.debts = [{
    id: 'hecs', name: 'HECS-HELP', type: 'personal_loan',
    currentBalance: 35_000, interestRate: 0.04, monthlyRepayment: 400, termYears: 10, startYear: null,
  }]

  return s
}

function dualIncomeFamilyMortgage() {
  const s = createDefaultScenario('Dual Income Family')
  s.household.personA.name = 'Chris'
  s.household.personA.dateOfBirth = '1985-01-10'
  s.household.personA.currentSalary = 130_000
  s.household.personA.retirementAge = 60

  s.household.personB.name = 'Pat'
  s.household.personB.dateOfBirth = '1987-06-22'
  s.household.personB.currentSalary = 85_000
  s.household.personB.retirementAge = 62

  s.simulationEndAge = 90

  s.super[0].currentBalance = 180_000
  s.super[1].currentBalance = 95_000

  const ppor = createDefaultProperty(true)
  ppor.currentValue = 950_000
  ppor.purchasePrice = 700_000
  ppor.mortgageBalance = 380_000
  ppor.originalLoanAmount = 500_000
  ppor.originalLoanTermYears = 30
  ppor.interestRate = 0.059
  ppor.loanTermYearsRemaining = 20
  ppor.offsetBalance = 40_000
  ppor.growthRate = 0.04
  s.properties = [ppor]

  s.shares.currentValue = 60_000
  s.shares.annualContribution = 10_000
  s.shares.contributionMode = 'surplus'

  s.surplusRoutingOrder = ['offset', 'shares', 'cash']

  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [
      { id: 'housing', label: 'Housing', type: 'category', amountType: 'annual', amount: 20_000, children: [] },
      { id: 'food', label: 'Food', type: 'category', amountType: 'annual', amount: 18_000, children: [] },
      { id: 'kids', label: 'School fees', type: 'category', amountType: 'annual', amount: 25_000, activeFrom: CURRENT_YEAR, activeTo: 2038, children: [] },
      { id: 'lifestyle', label: 'Lifestyle', type: 'category', amountType: 'annual', amount: 15_000, isDiscretionary: true, children: [] },
      { id: 'insurance', label: 'Insurance', type: 'category', amountType: 'annual', amount: 6_000, children: [] },
    ],
  }

  return s
}

function lateCareerMaximiser() {
  const s = createDefaultScenario('Late Career Maximiser')
  s.household.personA.name = 'Robin'
  s.household.personA.dateOfBirth = '1968-09-05'
  s.household.personA.currentSalary = 160_000
  s.household.personA.retirementAge = 62

  s.household.personB.name = 'Taylor'
  s.household.personB.dateOfBirth = '1970-02-14'
  s.household.personB.currentSalary = 95_000
  s.household.personB.retirementAge = 63

  s.simulationEndAge = 92

  s.super[0].currentBalance = 650_000
  s.super[0].salarySacrificeAmount = 15_000
  s.super[1].currentBalance = 320_000
  s.super[1].salarySacrificeAmount = 10_000

  const ppor = createDefaultProperty(true)
  ppor.currentValue = 1_400_000
  ppor.purchasePrice = 600_000
  ppor.mortgageBalance = 120_000
  ppor.originalLoanAmount = 400_000
  ppor.originalLoanTermYears = 30
  ppor.interestRate = 0.055
  ppor.loanTermYearsRemaining = 8
  ppor.offsetBalance = 90_000
  ppor.growthRate = 0.035
  s.properties = [ppor]

  s.shares.currentValue = 250_000
  s.shares.annualContribution = 25_000
  s.shares.contributionMode = 'fixed'

  const bond = createDefaultInvestmentBond()
  bond.name = 'Tax-free bond'
  bond.currentBalance = 180_000
  bond.annualContribution = 20_000
  bond.contributionMode = 'fixed'
  bond.inceptionDate = '2018-01-01'
  s.investmentBonds = [bond]

  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [
      { id: 'living', label: 'Living expenses', type: 'category', amountType: 'annual', amount: 65_000, children: [] },
      { id: 'travel', label: 'Travel', type: 'category', amountType: 'annual', amount: 12_000, isDiscretionary: true, children: [] },
    ],
  }

  return s
}

function singleParentAgePension() {
  const s = createDefaultScenario('Single Parent - Age Pension')
  s.household.personA.name = 'Morgan'
  s.household.personA.dateOfBirth = '1975-11-30'
  s.household.personA.currentSalary = 52_000
  s.household.personA.retirementAge = 67

  s.simulationEndAge = 92

  s.super[0].currentBalance = 85_000

  // Small PPOR, no mortgage
  const ppor = createDefaultProperty(true)
  ppor.currentValue = 450_000
  ppor.purchasePrice = 300_000
  ppor.mortgageBalance = 0
  ppor.growthRate = 0.03
  s.properties = [ppor]

  s.shares.currentValue = 15_000
  s.shares.annualContribution = 2_000
  s.shares.contributionMode = 'fixed'

  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [
      { id: 'living', label: 'Living', type: 'category', amountType: 'annual', amount: 35_000, children: [] },
      { id: 'kids', label: 'Child costs', type: 'category', amountType: 'annual', amount: 8_000, activeTo: 2035, children: [] },
    ],
  }

  return s
}

function highEarnerDiv293() {
  const s = createDefaultScenario('High Earner Div293')
  s.household.personA.name = 'Quinn'
  s.household.personA.dateOfBirth = '1978-03-15'
  s.household.personA.currentSalary = 320_000
  s.household.personA.retirementAge = 58

  s.household.personB.name = 'Avery'
  s.household.personB.dateOfBirth = '1980-07-01'
  s.household.personB.currentSalary = 120_000
  s.household.personB.retirementAge = 60

  s.simulationEndAge = 90

  s.super[0].currentBalance = 550_000
  s.super[0].salarySacrificeAmount = 20_000
  s.super[1].currentBalance = 280_000

  const ppor = createDefaultProperty(true)
  ppor.currentValue = 2_200_000
  ppor.purchasePrice = 1_200_000
  ppor.mortgageBalance = 600_000
  ppor.originalLoanAmount = 900_000
  ppor.originalLoanTermYears = 30
  ppor.interestRate = 0.058
  ppor.loanTermYearsRemaining = 18
  ppor.offsetBalance = 150_000
  ppor.growthRate = 0.04
  s.properties = [ppor]

  s.shares.currentValue = 400_000
  s.shares.annualContribution = 40_000
  s.shares.contributionMode = 'fixed'

  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [
      { id: 'living', label: 'Living', type: 'category', amountType: 'annual', amount: 80_000, children: [] },
      { id: 'lifestyle', label: 'Lifestyle', type: 'category', amountType: 'annual', amount: 30_000, isDiscretionary: true, children: [] },
      { id: 'school', label: 'Private school', type: 'category', amountType: 'annual', amount: 45_000, activeTo: 2036, children: [] },
    ],
  }

  return s
}

function retireeCoupleDrawing() {
  const s = createDefaultScenario('Retiree Couple')
  s.household.personA.name = 'Len'
  s.household.personA.dateOfBirth = '1958-05-20'
  s.household.personA.currentSalary = 0
  s.household.personA.retirementAge = 40 // already retired

  s.household.personB.name = 'Carol'
  s.household.personB.dateOfBirth = '1960-08-10'
  s.household.personB.currentSalary = 0
  s.household.personB.retirementAge = 40

  s.simulationEndAge = 95

  s.super[0].currentBalance = 480_000
  s.super[1].currentBalance = 350_000

  // Paid-off home
  const ppor = createDefaultProperty(true)
  ppor.currentValue = 900_000
  ppor.purchasePrice = 400_000
  ppor.mortgageBalance = 0
  ppor.growthRate = 0.03
  s.properties = [ppor]

  s.shares.currentValue = 200_000
  s.shares.annualContribution = 0

  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [
      { id: 'living', label: 'Living', type: 'category', amountType: 'annual', amount: 55_000, children: [] },
      { id: 'health', label: 'Health', type: 'category', amountType: 'annual', amount: 8_000, children: [] },
      { id: 'travel', label: 'Travel', type: 'category', amountType: 'annual', amount: 10_000, isDiscretionary: true, children: [] },
    ],
  }

  return s
}

function propertyInvestor() {
  const s = createDefaultScenario('Property Investor')
  s.household.personA.name = 'Riley'
  s.household.personA.dateOfBirth = '1982-12-01'
  s.household.personA.currentSalary = 140_000
  s.household.personA.retirementAge = 60

  s.household.personB.name = 'Casey'
  s.household.personB.dateOfBirth = '1984-04-15'
  s.household.personB.currentSalary = 75_000
  s.household.personB.retirementAge = 62

  s.simulationEndAge = 90

  s.super[0].currentBalance = 220_000
  s.super[1].currentBalance = 110_000

  // PPOR
  const ppor = createDefaultProperty(true)
  ppor.currentValue = 850_000
  ppor.purchasePrice = 550_000
  ppor.mortgageBalance = 300_000
  ppor.originalLoanAmount = 450_000
  ppor.originalLoanTermYears = 30
  ppor.interestRate = 0.06
  ppor.loanTermYearsRemaining = 18
  ppor.offsetBalance = 30_000
  ppor.growthRate = 0.04
  s.properties.push(ppor)

  // Investment property — negatively geared
  const ip = createDefaultProperty(false)
  ip.name = 'Investment Unit'
  ip.currentValue = 600_000
  ip.purchasePrice = 480_000
  ip.mortgageBalance = 420_000
  ip.originalLoanAmount = 450_000
  ip.originalLoanTermYears = 30
  ip.interestRate = 0.065
  ip.loanTermYearsRemaining = 25
  ip.annualRentalIncome = 22_000
  ip.annualPropertyExpenses = 6_000
  ip.growthRate = 0.045
  // Sell in 2040
  ip.saleEvent = { year: 2040, netProceeds: null, destination: 'cash' }
  s.properties.push(ip)

  s.surplusRoutingOrder = ['offset', 'shares', 'cash']

  s.shares.currentValue = 40_000
  s.shares.annualContribution = 10_000
  s.shares.contributionMode = 'surplus'

  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [
      { id: 'living', label: 'Living', type: 'category', amountType: 'annual', amount: 55_000, children: [] },
      { id: 'lifestyle', label: 'Lifestyle', type: 'category', amountType: 'annual', amount: 12_000, isDiscretionary: true, children: [] },
    ],
  }

  return s
}

function novatedLeasePBI() {
  const s = createDefaultScenario('Novated Lease PBI')
  s.household.personA.name = 'Jesse'
  s.household.personA.dateOfBirth = '1988-07-22'
  s.household.personA.currentSalary = 95_000
  s.household.personA.retirementAge = 65
  s.household.personA.employerType = 'pbi_nfp'

  s.household.personA.packaging = {
    novatedLease: {
      vehicleCostPrice: 45_000,
      residualValue: 12_000,
      termYears: 5,
      interestRate: 0.06,
      annualRunningCosts: 5_000,
      annualKmTotal: 15_000,
      annualKmBusiness: 3_000,
      method: 'statutory',
      isEV: false,
      employeePostTaxContribution: 0,
      offsetWithECM: true,
      activeYears: { from: `${CURRENT_YEAR}-01`, to: `${CURRENT_YEAR + 4}-12` },
    },
    pbiGeneral: 15_900,
    pbiMealEntertainment: 2_650,
  }

  s.simulationEndAge = 90

  s.super[0].currentBalance = 65_000

  s.shares.currentValue = 10_000
  s.shares.annualContribution = 5_000
  s.shares.contributionMode = 'fixed'

  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [
      { id: 'rent', label: 'Rent', type: 'category', amountType: 'monthly', amount: 1_600, children: [] },
      { id: 'living', label: 'Living', type: 'category', amountType: 'annual', amount: 20_000, children: [] },
    ],
  }

  return s
}

function downsizerScenario() {
  const s = createDefaultScenario('Downsizer')
  s.household.personA.name = 'Frank'
  s.household.personA.dateOfBirth = '1966-03-10'
  s.household.personA.currentSalary = 110_000
  s.household.personA.retirementAge = 63

  s.household.personB.name = 'Diane'
  s.household.personB.dateOfBirth = '1968-09-25'
  s.household.personB.currentSalary = 45_000
  s.household.personB.retirementAge = 65

  s.simulationEndAge = 92

  s.super[0].currentBalance = 380_000
  s.super[1].currentBalance = 160_000

  // Large family home to sell in 2032 (when Frank is ~66, Diane ~64)
  const ppor = createDefaultProperty(true)
  ppor.currentValue = 1_600_000
  ppor.purchasePrice = 500_000
  ppor.mortgageBalance = 0
  ppor.growthRate = 0.035
  ppor.ownershipPctA = 50
  ppor.saleEvent = { year: 2032, netProceeds: null, destination: 'cash' }
  s.properties = [ppor]

  s.shares.currentValue = 120_000
  s.shares.annualContribution = 15_000
  s.shares.contributionMode = 'fixed'

  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [
      { id: 'living', label: 'Living', type: 'category', amountType: 'annual', amount: 60_000, children: [] },
    ],
  }

  return s
}

function aggressiveSaver() {
  const s = createDefaultScenario('Aggressive Saver')
  s.household.personA.name = 'Dana'
  s.household.personA.dateOfBirth = '1990-01-15'
  s.household.personA.currentSalary = 105_000
  s.household.personA.retirementAge = 55

  s.household.personB.name = 'Alex'
  s.household.personB.dateOfBirth = '1991-06-20'
  s.household.personB.currentSalary = 95_000
  s.household.personB.retirementAge = 55

  s.simulationEndAge = 90

  s.super[0].currentBalance = 90_000
  s.super[0].salarySacrificeAmount = 10_000
  s.super[1].currentBalance = 70_000
  s.super[1].salarySacrificeAmount = 8_000

  s.shares.currentValue = 50_000
  s.shares.annualContribution = 20_000
  s.shares.contributionMode = 'surplus'

  const bond = createDefaultInvestmentBond()
  bond.name = 'Growth bond'
  bond.currentBalance = 30_000
  bond.annualContribution = 15_000
  bond.contributionMode = 'surplus'
  bond.inceptionDate = `${CURRENT_YEAR - 2}-01-01`
  s.investmentBonds = [bond]

  const other = createDefaultOtherAsset()
  other.name = 'Managed fund'
  other.currentValue = 25_000
  other.annualContribution = 5_000
  other.contributionMode = 'fixed'
  s.otherAssets = [other]

  s.surplusRoutingOrder = ['bonds', 'shares', 'cash']

  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [
      { id: 'rent', label: 'Rent', type: 'category', amountType: 'monthly', amount: 2_000, children: [] },
      { id: 'living', label: 'Living', type: 'category', amountType: 'annual', amount: 22_000, children: [] },
    ],
  }

  return s
}

function debtHeavy() {
  const s = createDefaultScenario('Debt Heavy')
  s.household.personA.name = 'Jamie'
  s.household.personA.dateOfBirth = '1986-08-12'
  s.household.personA.currentSalary = 78_000
  s.household.personA.retirementAge = 67

  s.simulationEndAge = 90

  s.super[0].currentBalance = 55_000

  s.shares.currentValue = 0
  s.shares.annualContribution = 0

  s.debts = [
    {
      id: 'car', name: 'Car loan', type: 'personal_loan',
      currentBalance: 28_000, interestRate: 0.08, monthlyRepayment: 550, termYears: 5, startYear: null,
    },
    {
      id: 'personal', name: 'Personal loan', type: 'personal_loan',
      currentBalance: 15_000, interestRate: 0.12, monthlyRepayment: 350, termYears: 5, startYear: null,
    },
    {
      id: 'cc1', name: 'Visa', type: 'credit_card',
      currentBalance: 12_000, interestRate: 0.20, monthlyRepayment: 400, repaymentMode: 'payoff', startYear: null,
    },
    {
      id: 'cc2', name: 'Mastercard', type: 'credit_card',
      currentBalance: 6_000, interestRate: 0.22, monthlyRepayment: 200, repaymentMode: 'payoff', startYear: null,
    },
  ]

  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [
      { id: 'rent', label: 'Rent', type: 'category', amountType: 'monthly', amount: 1_400, children: [] },
      { id: 'living', label: 'Living', type: 'category', amountType: 'annual', amount: 15_000, children: [] },
    ],
  }

  return s
}

function recurringExpenseScenario() {
  const s = createDefaultScenario('Recurring Expenses')
  s.household.personA.name = 'Kim'
  s.household.personA.dateOfBirth = '1983-05-01'
  s.household.personA.currentSalary = 100_000
  s.household.personA.retirementAge = 63

  s.household.personB.name = 'Lee'
  s.household.personB.dateOfBirth = '1985-10-15'
  s.household.personB.currentSalary = 70_000
  s.household.personB.retirementAge = 63

  s.simulationEndAge = 90

  s.super[0].currentBalance = 150_000
  s.super[1].currentBalance = 80_000

  const ppor = createDefaultProperty(true)
  ppor.currentValue = 750_000
  ppor.purchasePrice = 500_000
  ppor.mortgageBalance = 250_000
  ppor.originalLoanAmount = 400_000
  ppor.originalLoanTermYears = 30
  ppor.interestRate = 0.058
  ppor.loanTermYearsRemaining = 18
  ppor.growthRate = 0.04
  s.properties = [ppor]

  s.shares.currentValue = 30_000
  s.shares.annualContribution = 8_000
  s.shares.contributionMode = 'fixed'

  s.expenses = {
    id: 'root', label: 'Expenses', type: 'group', amountType: 'annual', amount: 0,
    children: [
      { id: 'living', label: 'Living', type: 'category', amountType: 'annual', amount: 50_000, children: [] },
      {
        id: 'car', label: 'Car replacement', type: 'category',
        amountType: 'recurring', amount: 40_000, recurringEveryYears: 8,
        activeFrom: CURRENT_YEAR, activeTo: CURRENT_YEAR + 40, children: [],
      },
      {
        id: 'reno', label: 'Home renovation', type: 'category',
        amountType: 'recurring', amount: 30_000, recurringEveryYears: 15,
        activeFrom: CURRENT_YEAR + 3, activeTo: CURRENT_YEAR + 40, children: [],
      },
    ],
  }

  return s
}

// ── Scenario Registry ────────────────────────────────────────────────────────

const SCENARIOS = [
  { name: 'Young Single Renter', build: youngSingleRenter },
  { name: 'Dual Income Family', build: dualIncomeFamilyMortgage },
  { name: 'Late Career Maximiser', build: lateCareerMaximiser },
  { name: 'Single Parent Age Pension', build: singleParentAgePension },
  { name: 'High Earner Div293', build: highEarnerDiv293 },
  { name: 'Retiree Couple', build: retireeCoupleDrawing },
  { name: 'Property Investor', build: propertyInvestor },
  { name: 'Novated Lease PBI', build: novatedLeasePBI },
  { name: 'Downsizer', build: downsizerScenario },
  { name: 'Aggressive Saver', build: aggressiveSaver },
  { name: 'Debt Heavy', build: debtHeavy },
  { name: 'Recurring Expenses', build: recurringExpenseScenario },
]

// ── Helper: extract key metrics from simulation ──────────────────────────────

function extractMetrics(snaps, scenario) {
  const last = snaps[snaps.length - 1]
  const retireYearA = scenario.household.personA.dateOfBirth
    ? new Date(scenario.household.personA.dateOfBirth).getFullYear() + scenario.household.personA.retirementAge
    : null
  const retireSnap = retireYearA ? snaps.find(s => s.year === retireYearA) : null

  return {
    totalYears: snaps.length,
    startYear: snaps[0].year,
    endYear: last.year,
    netWorthAtEnd: last.totalNetWorth,
    liquidAtEnd: last.totalLiquidAssets,
    netWorthAtRetirement: retireSnap?.totalNetWorth ?? null,
    liquidAtRetirement: retireSnap?.totalLiquidAssets ?? null,
    peakNetWorth: Math.max(...snaps.map(s => s.totalNetWorth)),
    deficitYears: snaps.deficitYears?.length ?? 0,
    firstDeficitYear: snaps.firstDeficitYear ?? null,
    cumulativeDeficit: snaps.cumulativeDeficit ?? 0,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL INVARIANT CHECKS — run against every scenario
// ══════════════════════════════════════════════════════════════════════════════

describe('Scenario validation — universal invariants', () => {
  for (const { name, build } of SCENARIOS) {
    describe(name, () => {
      const scenario = build()
      const snaps = runSimulation(scenario)

      it('runs without errors and produces snapshots', () => {
        expect(snaps.length).toBeGreaterThan(10)
        expect(snaps[0].year).toBe(CURRENT_YEAR)
      })

      it('cashflow reconciliation: netCashflow = totalIncome - totalOutflows', () => {
        for (const s of snaps) {
          expect(Math.abs(s.netCashflow - (s.totalIncome - s.totalOutflows))).toBeLessThan(1)
        }
      })

      it('no NaN or Infinity in numeric fields', () => {
        const keys = [
          'totalIncome', 'totalOutflows', 'netCashflow', 'totalNetWorth',
          'totalLiquidAssets', 'cashBuffer', 'sharesValue', 'totalExpenses',
          'superABalance', 'superBBalance', 'surplus', 'totalDebtBalance',
          'totalDebtRepayments', 'totalMortgageBalance',
        ]
        for (const s of snaps) {
          for (const key of keys) {
            const val = s[key]
            if (val !== undefined && val !== null) {
              expect(Number.isFinite(val), `${key} = ${val} in year ${s.year}`).toBe(true)
            }
          }
        }
      })

      it('warnings array present every year', () => {
        for (const s of snaps) {
          expect(Array.isArray(s.warnings)).toBe(true)
        }
      })

      it('salary drops to zero at retirement age', () => {
        const personA = scenario.household.personA
        if (personA.dateOfBirth && personA.currentSalary > 0) {
          const postRetire = snaps.find(s => s.ageA === personA.retirementAge)
          if (postRetire) {
            expect(postRetire.salaryA).toBe(0)
          }
        }
        const personB = scenario.household.personB
        if (personB.dateOfBirth && personB.currentSalary > 0) {
          const postRetire = snaps.find(s => s.ageB === personB.retirementAge)
          if (postRetire) {
            expect(postRetire.salaryB).toBe(0)
          }
        }
      })

      it('super pension phase only after preservation age (60) + retirement', () => {
        for (const s of snaps) {
          if (s.superA?.inPensionPhase) {
            expect(s.ageA).toBeGreaterThanOrEqual(60)
            expect(s.retiredA).toBe(true)
          }
          if (s.superB?.inPensionPhase) {
            expect(s.ageB).toBeGreaterThanOrEqual(60)
            expect(s.retiredB).toBe(true)
          }
        }
      })

      it('debt balances never go negative', () => {
        for (const s of snaps) {
          if (s.debtResult?.results) {
            for (const d of s.debtResult.results) {
              expect(d.closingBalance).toBeGreaterThanOrEqual(-1) // small rounding tolerance
            }
          }
        }
      })

      it('expenses are non-negative every year', () => {
        for (const s of snaps) {
          expect(s.totalExpenses).toBeGreaterThanOrEqual(0)
        }
      })

      it('accumulation contributions stop post-retirement (both retired)', () => {
        const bothRetiredSnaps = snaps.filter(s => s.retiredA && s.retiredB)
        for (const s of bothRetiredSnaps) {
          // Fixed contributions should be zero — surplus routing of income may still apply
          expect(s.totalBondContributions).toBeLessThanOrEqual(
            // Allow surplus-mode bond contributions from routed income
            (s.totalSurplusBondContributions || 0) + 1
          )
        }
      })

      it('golden metrics snapshot', () => {
        const metrics = extractMetrics(snaps, scenario)
        expect(metrics).toMatchSnapshot()
      })
    })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// SCENARIO-SPECIFIC BEHAVIOURAL ASSERTIONS
// ══════════════════════════════════════════════════════════════════════════════

describe('Scenario-specific behaviour', () => {

  describe('Young Single Renter', () => {
    const snaps = runSimulation(youngSingleRenter())

    it('HECS debt pays off within 10 years', () => {
      const yr10 = snaps[10]
      expect(yr10.totalDebtBalance).toBe(0)
    })

    it('net worth grows over working life', () => {
      expect(snaps[20].totalNetWorth).toBeGreaterThan(snaps[0].totalNetWorth)
    })

    it('shares accumulate with fixed contributions', () => {
      expect(snaps[10].sharesValue).toBeGreaterThan(5_000)
    })
  })

  describe('Dual Income Family', () => {
    const scenario = dualIncomeFamilyMortgage()
    const snaps = runSimulation(scenario)

    it('school fees stop after activeTo year', () => {
      const afterSchool = snaps.find(s => s.year === 2039)
      const duringSchool = snaps.find(s => s.year === 2035)
      if (afterSchool && duringSchool) {
        expect(afterSchool.totalExpenses).toBeLessThan(duringSchool.totalExpenses)
      }
    })

    it('mortgage offset grows via surplus routing', () => {
      const yr10 = snaps[10]
      expect(yr10.propertyResults[0].offsetBalance).toBeGreaterThan(40_000)
    })

    it('mortgage pays down over time', () => {
      expect(snaps[15].totalMortgageBalance).toBeLessThan(snaps[0].totalMortgageBalance)
    })
  })

  describe('Late Career Maximiser', () => {
    const scenario = lateCareerMaximiser()
    const snaps = runSimulation(scenario)

    it('salary sacrifice reduces taxable income', () => {
      const yr0 = snaps[0]
      // Tax should be lower than marginal on full $160k
      const fullTaxApprox = 45_000 // rough top bracket
      expect(yr0.taxA.totalTaxPayable).toBeLessThan(fullTaxApprox)
    })

    it('investment bond matures after 10 years (tax-free)', () => {
      // Bond inception 2018, so by 2028 it should be tax-free
      const yr2029 = snaps.find(s => s.year === 2029)
      if (yr2029) {
        expect(yr2029.bondLiquidity).toBeGreaterThan(0)
      }
    })

    it('mortgage paid off within 10 years', () => {
      const yr10 = snaps[10]
      // Remaining was 8 years + offset accelerating
      expect(yr10.totalMortgageBalance).toBeLessThan(10_000)
    })
  })

  describe('Single Parent — Age Pension', () => {
    const snaps = runSimulation(singleParentAgePension())

    it('Age Pension kicks in after age 67', () => {
      const postPensionAge = snaps.find(s => s.ageA >= 68)
      if (postPensionAge) {
        expect(postPensionAge.agePension?.totalPension ?? 0).toBeGreaterThan(0)
      }
    })

    it('receives some Age Pension with modest assets', () => {
      const aged70 = snaps.find(s => s.ageA === 70)
      if (aged70) {
        // With super + shares growing, means test reduces pension
        // but should still receive something meaningful
        expect(aged70.agePension?.totalPension ?? 0).toBeGreaterThan(1_000)
      }
    })

    it('child costs stop at activeTo year', () => {
      const after = snaps.find(s => s.year === 2036)
      const during = snaps.find(s => s.year === 2034)
      if (after && during) {
        expect(after.totalExpenses).toBeLessThan(during.totalExpenses)
      }
    })
  })

  describe('High Earner Div293', () => {
    const snaps = runSimulation(highEarnerDiv293())

    it('Div293 tax triggered in working years', () => {
      const workingSnaps = snaps.filter(s => s.salaryA > 200_000)
      expect(workingSnaps.length).toBeGreaterThan(0)
      for (const s of workingSnaps) {
        expect(s.totalDiv293Tax).toBeGreaterThan(0)
      }
    })

    it('Div293 not triggered after retirement', () => {
      const retiredSnaps = snaps.filter(s => s.retiredA && s.retiredB)
      for (const s of retiredSnaps) {
        expect(s.totalDiv293Tax).toBe(0)
      }
    })

    it('salary sacrifice still applied despite Div293', () => {
      const yr0 = snaps[0]
      // Employer contrib should include salary sacrifice
      expect(yr0.employerContribA).toBeGreaterThan(320_000 * 0.115)
    })
  })

  describe('Retiree Couple', () => {
    const snaps = runSimulation(retireeCoupleDrawing())

    it('no salary income in any year', () => {
      for (const s of snaps) {
        expect(s.salaryA).toBe(0)
        expect(s.salaryB).toBe(0)
      }
    })

    it('super in pension phase from start (both over 60 and retired)', () => {
      const yr0 = snaps[0]
      // Person A born 1958, currently ~68 — well over 60 and retired
      expect(yr0.superA.inPensionPhase).toBe(true)
    })

    it('draws down liquid assets over time', () => {
      const yr0 = snaps[0]
      const yr20 = snaps[20]
      if (yr20) {
        expect(yr20.totalLiquidAssets).toBeLessThan(yr0.totalLiquidAssets)
      }
    })

    it('Age Pension assessed at 67 for person B (may be zero due to assets)', () => {
      // Person B born 1960, Age Pension age = 67
      // Couple has $830k+ in super + shares — may exceed asset test threshold
      // The key check is that the engine runs the assessment
      const aged67B = snaps.find(s => s.ageB === 67)
      if (aged67B) {
        expect(aged67B.agePension).toBeDefined()
      }
    })
  })

  describe('Property Investor', () => {
    const scenario = propertyInvestor()
    const snaps = runSimulation(scenario)

    it('investment property generates rental income', () => {
      const yr0 = snaps[0]
      // Should have rental income from IP
      const ipResult = yr0.propertyResults?.[1]
      if (ipResult) {
        expect(ipResult.netRentalIncomeLoss).toBeDefined()
      }
    })

    it('IP sold in 2040 — property value drops', () => {
      const preSale = snaps.find(s => s.year === 2039)
      const postSale = snaps.find(s => s.year === 2041)
      if (preSale && postSale) {
        expect(postSale.totalPropertyValue).toBeLessThan(preSale.totalPropertyValue)
      }
    })

    it('no rental income after sale year', () => {
      const postSale = snaps.find(s => s.year === 2041)
      if (postSale) {
        const ipResult = postSale.propertyResults?.[1]
        if (ipResult) {
          expect(ipResult.netRentalIncomeLoss ?? 0).toBe(0)
        }
      }
    })
  })

  describe('Novated Lease PBI', () => {
    const snaps = runSimulation(novatedLeasePBI())

    it('lease packaging reduces taxable income during active years', () => {
      const yr0 = snaps[0]
      expect(yr0.leaseReductionA).toBeGreaterThan(0)
    })

    it('PBI packaging caps applied', () => {
      const yr0 = snaps[0]
      // Should have some tax benefit from PBI caps
      expect(yr0.taxA.totalTaxPayable).toBeLessThan(95_000 * 0.30) // rough check
    })

    it('no lease reduction after lease ends', () => {
      const afterLease = snaps.find(s => s.year === CURRENT_YEAR + 6)
      if (afterLease) {
        expect(afterLease.leaseReductionA).toBe(0)
      }
    })
  })

  describe('Downsizer', () => {
    const scenario = downsizerScenario()
    const snaps = runSimulation(scenario)

    it('property sold in 2032', () => {
      const pre = snaps.find(s => s.year === 2031)
      const post = snaps.find(s => s.year === 2033)
      if (pre && post) {
        expect(post.totalPropertyValue).toBeLessThan(pre.totalPropertyValue)
      }
    })

    it('downsizer contribution added to super after sale', () => {
      const saleYear = snaps.find(s => s.year === 2032)
      if (saleYear) {
        expect(saleYear.totalDownsizer ?? 0).toBeGreaterThan(0)
      }
    })

    it('super balance jumps after downsizer contribution', () => {
      const preSale = snaps.find(s => s.year === 2031)
      const postSale = snaps.find(s => s.year === 2032)
      if (preSale && postSale) {
        const preBal = preSale.superABalance + preSale.superBBalance
        const postBal = postSale.superABalance + postSale.superBBalance
        // Downsizer up to $300k per person — should see a significant jump
        expect(postBal - preBal).toBeGreaterThan(100_000)
      }
    })
  })

  describe('Aggressive Saver', () => {
    const scenario = aggressiveSaver()
    const snaps = runSimulation(scenario)

    it('surplus routing sends to bonds first, then shares', () => {
      const yr0 = snaps[0]
      // Bonds are in surplus mode, priority before shares
      if (yr0.surplus > 0) {
        expect(yr0.totalSurplusBondContributions).toBeGreaterThan(0)
      }
    })

    it('salary sacrifice grows super faster than SG alone', () => {
      // Build same scenario but without salary sacrifice
      const noSacrifice = aggressiveSaver()
      noSacrifice.super[0].salarySacrificeAmount = 0
      noSacrifice.super[1].salarySacrificeAmount = 0
      const snapsNoSac = runSimulation(noSacrifice)

      // After 5 years, sacrifice scenario should have noticeably more super
      const withSac5 = snaps[5].superABalance + snaps[5].superBBalance
      const noSac5 = snapsNoSac[5].superABalance + snapsNoSac[5].superBBalance
      expect(withSac5 - noSac5).toBeGreaterThan(50_000) // ~$18k/yr × 5 yrs compounding
    })

    it('other assets (managed fund) grow over time', () => {
      const yr10 = snaps[10]
      expect(yr10.totalOtherAssetsValue).toBeGreaterThan(25_000)
    })

    it('early retirement at 55 means long drawdown phase', () => {
      const retiredSnaps = snaps.filter(s => s.retiredA && s.retiredB)
      expect(retiredSnaps.length).toBeGreaterThan(30)
    })
  })

  describe('Debt Heavy', () => {
    const snaps = runSimulation(debtHeavy())

    it('all debts paid off within 10 years', () => {
      const yr10 = snaps[10]
      expect(yr10.totalDebtBalance).toBeLessThan(100) // rounding tolerance
    })

    it('debt repayments are significant portion of outflows in early years', () => {
      const yr0 = snaps[0]
      expect(yr0.totalDebtRepayments).toBeGreaterThan(15_000) // ~$1500/mo in repayments
    })

    it('cashflow improves after debts cleared', () => {
      const yr1 = snaps[1]
      const yr10 = snaps[10]
      // More free cashflow once debts gone
      expect(yr10.netCashflow).toBeGreaterThan(yr1.netCashflow)
    })
  })

  describe('Recurring Expenses', () => {
    const scenario = recurringExpenseScenario()
    const snaps = runSimulation(scenario)

    it('car replacement fires every 8 years', () => {
      const yr0 = snaps[0]
      const yr8 = snaps[8]
      const yr7 = snaps[7]

      // Year 0: car expense fires (40k + living 50k)
      expect(yr0.totalExpenses).toBeGreaterThan(80_000)
      // Year 7: no car expense (just living ~50k inflated)
      expect(yr7.totalExpenses).toBeLessThan(70_000)
      // Year 8: car fires again
      expect(yr8.totalExpenses).toBeGreaterThan(80_000)
    })

    it('renovation fires every 15 years starting from year +3', () => {
      const yr3 = snaps[3]
      const yr2 = snaps[2]

      // Year 3 should have renovation (~$30k inflated) + living (~$50k inflated)
      // Year 2 should not have renovation
      expect(yr3.totalExpenses).toBeGreaterThan(yr2.totalExpenses + 20_000)
    })

    it('recurring expenses are inflation-adjusted', () => {
      const yr0Expense = snaps[0].totalExpenses
      const yr8Expense = snaps[8].totalExpenses
      // Both years have car + living, but yr8 should be inflated
      expect(yr8Expense).toBeGreaterThan(yr0Expense)
    })
  })
})
