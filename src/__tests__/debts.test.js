import { describe, it, expect } from 'vitest'
import { processDebtYear, processAllDebts, calcLeaseAnnualRepayment } from '../modules/debts.js'

describe('calcLeaseAnnualRepayment', () => {
  it('calculates flat annual repayment with upfront interest', () => {
    // $50k financed at 7% over 5 years
    // Total interest = 50000 * 0.07 * 5 = 17500
    // Total cost = 67500, annual = 13500
    expect(calcLeaseAnnualRepayment(50000, 0.07, 5)).toBe(13500)
  })

  it('returns 0 for zero balance', () => {
    expect(calcLeaseAnnualRepayment(0, 0.07, 5)).toBe(0)
  })
})

describe('processDebtYear — personal loan', () => {
  it('amortises with fixed monthly repayment', () => {
    const loan = {
      type: 'personal_loan',
      currentBalance: 20000,
      interestRate: 0.08,
      monthlyRepayment: 500,
    }
    const r = processDebtYear(loan, 2026)
    expect(r.annualRepayment).toBeLessThanOrEqual(6000)
    expect(r.interestPaid).toBeCloseTo(1600, -1) // 20000 * 0.08
    expect(r.principalPaid).toBeCloseTo(4400, -1)
    expect(r.closingBalance).toBeCloseTo(15600, -1)
    expect(r.isPaidOff).toBe(false)
  })

  it('pays off when balance small', () => {
    const loan = {
      type: 'personal_loan',
      currentBalance: 500,
      interestRate: 0.08,
      monthlyRepayment: 500,
    }
    const r = processDebtYear(loan, 2026)
    expect(r.closingBalance).toBe(0)
    expect(r.isPaidOff).toBe(true)
  })

  it('returns 0 before start year', () => {
    const loan = {
      type: 'personal_loan',
      currentBalance: 10000,
      interestRate: 0.08,
      monthlyRepayment: 300,
      startYear: 2028,
    }
    const r = processDebtYear(loan, 2026)
    expect(r.closingBalance).toBe(0)
    expect(r.annualRepayment).toBe(0)
  })
})

describe('processDebtYear — lease', () => {
  it('processes lease with residual', () => {
    const lease = {
      type: 'lease',
      currentBalance: 50000,
      interestRate: 0.07,
      termYears: 5,
      residualValue: 10000,
      monthlyRepayment: 0, // auto-calc
      startYear: 2026,
    }
    const r = processDebtYear(lease, 2026)
    expect(r.annualRepayment).toBeGreaterThan(0)
    expect(r.closingBalance).toBeLessThan(50000)
    expect(r.closingBalance).toBeGreaterThan(0)
  })

  it('returns paid off after term ends', () => {
    const lease = {
      type: 'lease',
      currentBalance: 0,
      interestRate: 0.07,
      termYears: 3,
      residualValue: 0,
      monthlyRepayment: 1000,
      startYear: 2024,
    }
    const r = processDebtYear(lease, 2028)
    expect(r.isPaidOff).toBe(true)
    expect(r.annualRepayment).toBe(0)
  })
})

describe('processDebtYear — credit card', () => {
  it('pays down in payoff mode', () => {
    const cc = {
      type: 'credit_card',
      currentBalance: 10000,
      interestRate: 0.20,
      monthlyRepayment: 500,
      repaymentMode: 'payoff',
    }
    const r = processDebtYear(cc, 2026)
    expect(r.annualRepayment).toBeLessThanOrEqual(6000)
    expect(r.interestPaid).toBeCloseTo(2000, -1)
    expect(r.closingBalance).toBeLessThan(10000)
    expect(r.closingBalance).toBeGreaterThan(0)
  })

  it('maintains balance in revolving mode', () => {
    const cc = {
      type: 'credit_card',
      currentBalance: 10000,
      interestRate: 0.20,
      repaymentMode: 'revolving',
    }
    const r = processDebtYear(cc, 2026)
    expect(r.closingBalance).toBe(10000) // unchanged
    expect(r.annualRepayment).toBeCloseTo(2000, -1) // interest only
    expect(r.principalPaid).toBe(0)
  })

  it('uses minimum 2% when no repayment set', () => {
    const cc = {
      type: 'credit_card',
      currentBalance: 10000,
      interestRate: 0.20,
      monthlyRepayment: 0,
      repaymentMode: 'payoff',
    }
    const r = processDebtYear(cc, 2026)
    // min 2% of 10000 = 200/mo = 2400/yr
    expect(r.annualRepayment).toBeGreaterThan(0)
    expect(r.closingBalance).toBeLessThan(10000)
  })
})

describe('processAllDebts', () => {
  it('aggregates multiple debts', () => {
    const debts = [
      { type: 'personal_loan', currentBalance: 10000, interestRate: 0.08, monthlyRepayment: 300 },
      { type: 'credit_card', currentBalance: 5000, interestRate: 0.20, monthlyRepayment: 200, repaymentMode: 'payoff' },
    ]
    const r = processAllDebts(debts, 2026)
    expect(r.results).toHaveLength(2)
    expect(r.totalBalance).toBeGreaterThan(0)
    expect(r.totalRepayment).toBeGreaterThan(0)
  })

  it('returns zeros for empty array', () => {
    const r = processAllDebts([], 2026)
    expect(r.totalBalance).toBe(0)
    expect(r.totalRepayment).toBe(0)
    expect(r.results).toEqual([])
  })
})

describe('debts integration with simulation', () => {
  it('debt repayments reduce cashflow and balances decline over time', async () => {
    const { runSimulation } = await import('../engine/simulationEngine.js')
    const { createDefaultScenario } = await import('../utils/schema.js')

    const scenario = createDefaultScenario('Debt test')
    scenario.household.personA.dateOfBirth = '1980-01-01'
    scenario.household.personA.currentSalary = 100000
    scenario.household.personA.retirementAge = 65
    scenario.simulationEndAge = 70

    scenario.debts = [{
      id: 'car-loan',
      name: 'Car loan',
      type: 'personal_loan',
      currentBalance: 30000,
      interestRate: 0.08,
      monthlyRepayment: 600,
      termYears: 5,
      startYear: null,
    }]

    const snaps = runSimulation(scenario)
    const yr0 = snaps[0]

    // Debt should appear in snapshot
    expect(yr0.totalDebtBalance).toBeLessThan(30000)
    expect(yr0.totalDebtRepayments).toBeGreaterThan(0)
    expect(yr0.totalDebtRepayments).toBeLessThanOrEqual(7200) // 600 * 12

    // Debt should reduce over time
    const yr5 = snaps[5]
    expect(yr5.totalDebtBalance).toBeLessThan(yr0.totalDebtBalance)

    // Net worth should be lower than scenario without debt
    const noDebtScenario = { ...scenario, debts: [] }
    const noDebtSnaps = runSimulation(noDebtScenario)
    expect(yr0.totalNetWorth).toBeLessThan(noDebtSnaps[0].totalNetWorth)
  })
})
