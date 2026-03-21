/**
 * Debts Module
 *
 * Handles non-mortgage liabilities: personal loans, leases, credit cards.
 *
 * Loan types:
 *  - Personal loan: standard P&I amortisation with fixed monthly repayment
 *  - Lease: interest calculated upfront, fixed repayments, residual at end
 *  - Credit card: fixed repayment (payoff mode) or interest-only (revolving)
 */

/**
 * Calculate annual lease repayment from total financed amount and term.
 * Lease interest is calculated upfront and baked into the repayment schedule.
 * Total cost = financed amount + total interest. Repayments are flat.
 * Residual/balloon is paid in the final year.
 *
 * @param {number} financedAmount - amount financed (excl. residual)
 * @param {number} interestRate   - annual rate (e.g. 0.07)
 * @param {number} termYears      - lease term in years
 * @returns {number} annual repayment (excl. residual)
 */
export function calcLeaseAnnualRepayment(financedAmount, interestRate, termYears) {
  if (financedAmount <= 0 || termYears <= 0) return 0
  const totalInterest = financedAmount * interestRate * termYears
  const totalCost = financedAmount + totalInterest
  return totalCost / termYears
}

/**
 * Process a single debt for one simulation year.
 *
 * @param {object} debt - debt from scenario
 * @param {number} year - simulation year
 * @returns {{ closingBalance, annualRepayment, interestPaid, principalPaid, isPaidOff, residualPayment }}
 */
export function processDebtYear(debt, year) {
  const { type, currentBalance, interestRate, startYear } = debt

  // Not yet started
  if (startYear != null && year < startYear) {
    return { closingBalance: 0, annualRepayment: 0, interestPaid: 0, principalPaid: 0, isPaidOff: false, residualPayment: 0 }
  }

  if (currentBalance <= 0) {
    return { closingBalance: 0, annualRepayment: 0, interestPaid: 0, principalPaid: 0, isPaidOff: true, residualPayment: 0 }
  }

  if (type === 'lease') {
    return processLeaseYear(debt, year)
  }

  if (type === 'credit_card') {
    return processCreditCardYear(debt)
  }

  // Default: personal_loan (standard P&I)
  return processLoanYear(debt)
}

function processLoanYear(debt) {
  const { currentBalance, interestRate, monthlyRepayment } = debt
  const annualRepayment = (monthlyRepayment || 0) * 12

  if (annualRepayment <= 0) {
    // No repayment set — interest accrues
    const interest = currentBalance * interestRate
    return {
      closingBalance: currentBalance + interest,
      annualRepayment: 0,
      interestPaid: 0,
      principalPaid: 0,
      isPaidOff: false,
      residualPayment: 0,
    }
  }

  const interest = currentBalance * interestRate
  const principal = Math.min(currentBalance, Math.max(0, annualRepayment - interest))
  const actualRepayment = Math.min(annualRepayment, currentBalance + interest)
  const closingBalance = Math.max(0, currentBalance - principal)

  return {
    closingBalance,
    annualRepayment: actualRepayment,
    interestPaid: Math.min(interest, actualRepayment),
    principalPaid: principal,
    isPaidOff: closingBalance <= 0,
    residualPayment: 0,
  }
}

function processLeaseYear(debt, year) {
  const { currentBalance, interestRate, termYears, residualValue = 0, monthlyRepayment, startYear } = debt

  // Calculate years into lease
  const leaseStart = startYear || (year)  // assume started this year if not set
  const yearsInto = year - leaseStart
  const termEnd = leaseStart + (termYears || 1)

  // Lease is fully paid
  if (yearsInto >= (termYears || 1) || currentBalance <= 0) {
    return { closingBalance: 0, annualRepayment: 0, interestPaid: 0, principalPaid: 0, isPaidOff: true, residualPayment: 0 }
  }

  // Financed amount = original balance - residual (residual paid at end)
  // If monthlyRepayment provided, use it; otherwise calculate
  const financedAmount = currentBalance + (residualValue || 0) * (yearsInto === 0 ? 1 : 0)
  // For ongoing years, just use the repayment schedule
  let annualRepayment
  if (monthlyRepayment > 0) {
    annualRepayment = monthlyRepayment * 12
  } else {
    // Auto-calc: total interest upfront, flat repayments
    const remainingYears = Math.max(1, (termYears || 1) - yearsInto)
    annualRepayment = calcLeaseAnnualRepayment(currentBalance, interestRate, remainingYears)
  }

  // Lease repayment is flat — principal portion is the repayment minus imputed interest
  const imputedInterest = currentBalance * interestRate
  const principal = Math.min(currentBalance - (residualValue || 0), Math.max(0, annualRepayment - imputedInterest))
  const closingBalance = Math.max(0, currentBalance - principal)

  // Final year: residual payment
  let residualPayment = 0
  if (year === termEnd - 1 || closingBalance <= (residualValue || 0) + 1) {
    residualPayment = Math.min(closingBalance, residualValue || 0)
  }

  return {
    closingBalance: Math.max(0, closingBalance - residualPayment),
    annualRepayment: annualRepayment + residualPayment,
    interestPaid: imputedInterest,
    principalPaid: principal + residualPayment,
    isPaidOff: closingBalance - residualPayment <= 0,
    residualPayment,
  }
}

function processCreditCardYear(debt) {
  const { currentBalance, interestRate, monthlyRepayment, repaymentMode } = debt

  if (currentBalance <= 0) {
    return { closingBalance: 0, annualRepayment: 0, interestPaid: 0, principalPaid: 0, isPaidOff: true, residualPayment: 0 }
  }

  const interest = currentBalance * interestRate

  if (repaymentMode === 'revolving') {
    // Interest-only: balance stays, interest paid each year
    return {
      closingBalance: currentBalance,
      annualRepayment: interest,
      interestPaid: interest,
      principalPaid: 0,
      isPaidOff: false,
      residualPayment: 0,
    }
  }

  // Payoff mode: fixed repayment or minimum 2% of balance per month
  const minMonthly = currentBalance * 0.02
  const monthly = monthlyRepayment > 0 ? monthlyRepayment : Math.max(minMonthly, 25)
  const annualRepayment = monthly * 12

  const principal = Math.min(currentBalance, Math.max(0, annualRepayment - interest))
  const actualRepayment = Math.min(annualRepayment, currentBalance + interest)
  const closingBalance = Math.max(0, currentBalance - principal)

  return {
    closingBalance,
    annualRepayment: actualRepayment,
    interestPaid: Math.min(interest, actualRepayment),
    principalPaid: principal,
    isPaidOff: closingBalance <= 0,
    residualPayment: 0,
  }
}

/**
 * Process all debts for a year.
 *
 * @param {Array} debts - scenario.debts
 * @param {number} year
 * @returns {{ results, totalBalance, totalRepayment }}
 */
export function processAllDebts(debts, year) {
  const results = debts.map(debt => processDebtYear(debt, year))
  const totalBalance = results.reduce((sum, r) => sum + r.closingBalance, 0)
  const totalRepayment = results.reduce((sum, r) => sum + r.annualRepayment, 0)
  return { results, totalBalance, totalRepayment }
}
