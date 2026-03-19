import { describe, it, expect } from 'vitest'
import { calcAnnualRepayment, calcAnnualInterest, processPropertyYear } from '../modules/property.js'

// ── calcAnnualRepayment ────────────────────────────────────────────────────

describe('calcAnnualRepayment', () => {
  it('returns 0 for zero principal', () => {
    expect(calcAnnualRepayment(0, 0.065, 25, 'pi')).toBe(0)
  })

  it('returns 0 for zero rate', () => {
    expect(calcAnnualRepayment(400_000, 0, 25, 'pi')).toBe(0)
  })

  it('calculates IO repayment as interest only', () => {
    // $400,000 @ 6.5% IO = 400,000 * 0.065 = 26,000
    expect(calcAnnualRepayment(400_000, 0.065, 25, 'io')).toBeCloseTo(26_000, 0)
  })

  it('calculates P&I repayment correctly ($400k, 6.5%, 25yr)', () => {
    // Monthly: 400,000 * (r*(1+r)^n) / ((1+r)^n - 1) where r=0.065/12, n=300
    // ≈ $2,701/month → $32,409/year
    const annual = calcAnnualRepayment(400_000, 0.065, 25, 'pi')
    expect(annual).toBeCloseTo(32_409, -2) // within $100
  })

  it('P&I repayment is higher than IO for same loan', () => {
    const pi = calcAnnualRepayment(400_000, 0.065, 25, 'pi')
    const io = calcAnnualRepayment(400_000, 0.065, 25, 'io')
    expect(pi).toBeGreaterThan(io)
  })

  it('shorter term means higher repayments', () => {
    const long = calcAnnualRepayment(400_000, 0.065, 30, 'pi')
    const short = calcAnnualRepayment(400_000, 0.065, 15, 'pi')
    expect(short).toBeGreaterThan(long)
  })
})

// ── calcAnnualInterest ────────────────────────────────────────────────────

describe('calcAnnualInterest', () => {
  it('calculates interest on full balance with no offset', () => {
    // 400,000 * 0.065 = 26,000
    expect(calcAnnualInterest(400_000, 0, 0.065)).toBeCloseTo(26_000, 0)
  })

  it('reduces interest by offset balance', () => {
    // (400,000 - 50,000) * 0.065 = 350,000 * 0.065 = 22,750
    expect(calcAnnualInterest(400_000, 50_000, 0.065)).toBeCloseTo(22_750, 0)
  })

  it('returns 0 when offset equals or exceeds loan', () => {
    expect(calcAnnualInterest(400_000, 400_000, 0.065)).toBe(0)
    expect(calcAnnualInterest(400_000, 500_000, 0.065)).toBe(0)
  })
})

// ── processPropertyYear ────────────────────────────────────────────────────

describe('processPropertyYear', () => {
  const investmentProperty = {
    isPrimaryResidence: false,
    currentValue: 800_000,
    purchasePrice: 500_000,
    purchaseDate: '2018-01-01',
    mortgageBalance: 400_000,
    interestRate: 0.065,
    loanTermYearsRemaining: 25,
    loanType: 'pi',
    ioEndYear: null,
    offsetBalance: 0,
    offsetAnnualTopUp: 0,
    annualRentalIncome: 30_000,
    annualPropertyExpenses: 5_000,
    growthRate: 0.04,
    saleEvent: null,
  }

  it('grows property value at the specified rate', () => {
    const result = processPropertyYear(investmentProperty, 2026)
    expect(result.closingValue).toBeCloseTo(800_000 * 1.04, 0)
  })

  it('reduces mortgage balance by principal repayment', () => {
    const result = processPropertyYear(investmentProperty, 2026)
    expect(result.mortgageBalance).toBeLessThan(400_000)
  })

  it('calculates equity as value minus mortgage', () => {
    const result = processPropertyYear(investmentProperty, 2026)
    expect(result.equity).toBeCloseTo(result.closingValue - result.mortgageBalance, 0)
  })

  it('shows negative rental income for negatively geared property', () => {
    // Rental $30k - expenses $5k - interest $26k = -$1k (negatively geared)
    const result = processPropertyYear(investmentProperty, 2026)
    expect(result.netRentalIncomeLoss).toBeLessThan(0)
  })

  it('shows positive rental income for positively geared property', () => {
    const positiveGearing = {
      ...investmentProperty,
      annualRentalIncome: 60_000, // much higher rent
    }
    const result = processPropertyYear(positiveGearing, 2026)
    expect(result.netRentalIncomeLoss).toBeGreaterThan(0)
  })

  it('primary residence has zero net rental income/loss', () => {
    const primary = { ...investmentProperty, isPrimaryResidence: true }
    const result = processPropertyYear(primary, 2026)
    expect(result.netRentalIncomeLoss).toBe(0)
  })

  it('offset reduces interest charge', () => {
    const withOffset = { ...investmentProperty, offsetBalance: 100_000 }
    const without = investmentProperty
    const offsetResult = processPropertyYear(withOffset, 2026)
    const noOffsetResult = processPropertyYear(without, 2026)
    expect(offsetResult.annualInterest).toBeLessThan(noOffsetResult.annualInterest)
  })

  it('offset balance grows by annual top-up each year', () => {
    const withTopUp = { ...investmentProperty, offsetBalance: 50_000, offsetAnnualTopUp: 10_000 }
    const result = processPropertyYear(withTopUp, 2026)
    expect(result.offsetBalance).toBeCloseTo(60_000, 0)
  })

  it('IO loan has no principal repayment', () => {
    const ioLoan = { ...investmentProperty, loanType: 'io', ioEndYear: 2030 }
    const result = processPropertyYear(ioLoan, 2026)
    // IO repayment = interest only, so principal repayment ≈ 0
    expect(result.principalRepayment).toBeCloseTo(0, 0)
    expect(result.mortgageBalance).toBeCloseTo(400_000, -2) // balance barely changes
  })

  it('switches to P&I after IO end year', () => {
    const ioLoan = { ...investmentProperty, loanType: 'io', ioEndYear: 2025 }
    const result = processPropertyYear(ioLoan, 2026) // year after IO expires
    // P&I repayment should now exceed interest, reducing principal
    expect(result.principalRepayment).toBeGreaterThan(0)
    expect(result.ioStepUpThisYear).toBe(true)
  })

  describe('sale event', () => {
    it('zeroes out property value and mortgage at sale', () => {
      const withSale = {
        ...investmentProperty,
        saleEvent: { year: 2026, destination: 'shares' },
      }
      const result = processPropertyYear(withSale, 2026)
      expect(result.closingValue).toBe(0)
      expect(result.mortgageBalance).toBe(0)
    })

    it('calculates CGT with 50% discount for long-held asset', () => {
      // Bought $500k, grown to ~$832k by 2026. Held since 2018 (>1yr).
      const withSale = {
        ...investmentProperty,
        saleEvent: { year: 2026, destination: 'shares' },
      }
      const result = processPropertyYear(withSale, 2026)
      // Capital gain = sale price - purchase price
      expect(result.capitalGain).toBeGreaterThan(0)
      // 50% discount: cgtAmount should be half of capital gain
      expect(result.cgtAmount).toBeCloseTo(result.capitalGain * 0.50, 0)
    })

    it('no CGT on primary residence sale', () => {
      const primaryWithSale = {
        ...investmentProperty,
        isPrimaryResidence: true,
        saleEvent: { year: 2026, destination: 'shares' },
      }
      const result = processPropertyYear(primaryWithSale, 2026)
      expect(result.cgtAmount).toBeNull()
    })

    it('no CGT on sale at a loss', () => {
      const lossProperty = {
        ...investmentProperty,
        currentValue: 400_000, // worth less than purchase price
        purchasePrice: 500_000,
        saleEvent: { year: 2026, destination: 'shares' },
      }
      const result = processPropertyYear(lossProperty, 2026)
      expect(result.cgtAmount).toBeNull()
    })

    it('returns all zeros in years after the sale year', () => {
      const withSale = {
        ...investmentProperty,
        saleEvent: { year: 2026, destination: 'shares' },
      }
      // Year after sale — property is gone, nothing should flow through
      const result = processPropertyYear(withSale, 2027)
      expect(result.closingValue).toBe(0)
      expect(result.mortgageBalance).toBe(0)
      expect(result.netRentalIncomeLoss).toBe(0)
      expect(result.annualRepayment).toBe(0)
      expect(result.annualInterest).toBe(0)
      expect(result.saleProceeds).toBeNull()
    })
  })
})
