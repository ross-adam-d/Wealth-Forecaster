/**
 * computeActuals — derives current financial metrics from a scenario's configured values.
 * Pure function — no engine run required.
 */

import { resolveExpenseTree } from '../modules/expenses.js'

function toAnnualSalary(amount, period) {
  if (!amount) return 0
  switch (period) {
    case 'weekly':      return amount * 52
    case 'fortnightly': return amount * 26
    case 'monthly':     return amount * 12
    default:            return amount
  }
}

export function computeActuals(scenario) {
  const currentYear = new Date().getFullYear()
  const h = scenario.household || {}

  // ── Assets ────────────────────────────────────────────────────────────────
  const cashSavings    = scenario.cashSavings || 0

  // For shares/tbonds/commodities: parent currentValue (unallocated bulk) + individual holdings
  // Mirrors the simulation engine's additive model (Session 31 fix)
  const holdingVal = h => h.units > 0 && h.livePrice ? h.units * h.livePrice : (h.currentValue || 0)
  const sharesValue = (scenario.shares?.currentValue || 0) +
    (scenario.shares?.holdings || []).reduce((s, h) => s + holdingVal(h), 0)
  const tbValue     = (scenario.treasuryBonds?.currentValue || 0) +
    (scenario.treasuryBonds?.holdings || []).reduce((s, h) => s + holdingVal(h), 0)
  const commValue   = (scenario.commodities?.currentValue || 0) +
    (scenario.commodities?.holdings || []).reduce((s, h) => s + (h.currentValue || 0), 0)
  const propertyValues = (scenario.properties || []).reduce((s, p) => s + (p.currentValue || 0), 0)
  const superBalances  = (scenario.super || []).reduce((s, sup) => s + (sup.currentBalance || 0), 0)
  const bondBalances   = (scenario.investmentBonds || []).reduce((s, b) => s + (b.currentBalance || 0), 0)
  const otherValues    = (scenario.otherAssets || []).reduce((s, a) => s + (a.currentValue || 0), 0)

  const totalAssets = cashSavings + sharesValue + tbValue + commValue +
                      propertyValues + superBalances + bondBalances + otherValues

  // ── Liabilities ───────────────────────────────────────────────────────────
  const mortgageBalance = (scenario.properties || []).reduce((s, p) => s + (p.mortgageBalance || 0), 0)
  const otherDebt       = (scenario.debts || []).reduce((s, d) => s + (d.currentBalance || 0), 0)
  const hecsBalance     = [h.personA, h.personB].filter(Boolean)
    .reduce((s, p) => s + (p.hecs?.balance || 0), 0)

  const totalLiabilities = mortgageBalance + otherDebt + hecsBalance

  // ── Summary ───────────────────────────────────────────────────────────────
  const netWorth     = totalAssets - totalLiabilities
  const liquidAssets = cashSavings + sharesValue + tbValue + commValue
  const totalDebt    = totalLiabilities

  // ── Income ────────────────────────────────────────────────────────────────
  const salaryA = toAnnualSalary(h.personA?.currentSalary, h.personA?.salaryPeriod)
  const salaryB = toAnnualSalary(h.personB?.currentSalary, h.personB?.salaryPeriod)

  const rentalIncome = (scenario.properties || [])
    .reduce((s, p) => s + (p.annualRentalIncome || 0), 0)

  const activeOtherIncome = (scenario.otherIncome || [])
    .filter(src => {
      const from = src.activeFrom ?? 0
      const to   = src.activeTo ?? 9999
      return currentYear >= from && currentYear <= to
    })
    .reduce((s, src) => {
      const amt = src.amountType === 'monthly' ? (src.amount || 0) * 12 : (src.amount || 0)
      return s + amt
    }, 0)

  const annualIncome = salaryA + salaryB + rentalIncome + activeOtherIncome

  // ── Expenses ──────────────────────────────────────────────────────────────
  const annualExpenses = scenario.expenses
    ? resolveExpenseTree(
        scenario.expenses,
        currentYear,
        currentYear,
        scenario.assumptions?.inflationRate || 0.025,
      ).total
    : 0

  // Approximate annual P&I mortgage repayments
  const annualMortgageRepayments = (scenario.properties || []).reduce((s, p) => {
    if (!p.mortgageBalance || p.mortgageBalance <= 0) return s
    if (p.loanType === 'io') return s
    const r = (p.interestRate || 0) / 12
    const n = (p.loanTermYearsRemaining || 0) * 12
    if (n <= 0 || r <= 0) return s
    const monthly = p.mortgageBalance * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
    return s + monthly * 12
  }, 0)

  // Annual debt repayments
  const annualDebtRepayments = (scenario.debts || [])
    .reduce((s, d) => s + (d.monthlyRepayment || 0) * 12, 0)

  const totalOutflows   = annualExpenses + annualMortgageRepayments + annualDebtRepayments
  const monthlySurplus  = (annualIncome - totalOutflows) / 12

  return {
    // Summary
    netWorth,
    liquidAssets,
    totalDebt,
    annualIncome,
    annualExpenses,
    totalOutflows,
    monthlySurplus,
    // Asset breakdown (for composition bar)
    cashSavings,
    sharesValue,
    tbValue,
    commValue,
    propertyValues,
    superBalances,
    bondBalances,
    otherValues,
    totalAssets,
    // Liability breakdown
    mortgageBalance,
    otherDebt,
    hecsBalance,
    totalLiabilities,
    // Debt repayments (for context)
    annualMortgageRepayments,
    annualDebtRepayments,
  }
}
