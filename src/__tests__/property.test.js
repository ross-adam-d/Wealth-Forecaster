import { describe, it, expect } from 'vitest'
import { calcAnnualRepayment, calcAnnualInterest, processPropertyYear, calcStampDuty, calcLandTax } from '../modules/property.js'

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

  describe('fixed repayment with offset (early payoff)', () => {
    const propertyWithOriginals = {
      ...investmentProperty,
      originalLoanAmount: 400_000,
      originalLoanTermYears: 25,
      offsetBalance: 300_000,
    }

    it('uses fixed repayment from original loan terms', () => {
      const result = processPropertyYear(propertyWithOriginals, 2026)
      // Fixed repayment should match original $400k/25yr annuity, not recalculated from current balance
      const expectedRepayment = calcAnnualRepayment(400_000, 0.065, 25, 'pi')
      expect(result.annualRepayment).toBeCloseTo(expectedRepayment, 0)
    })

    it('offset reduces interest so more goes to principal', () => {
      const withOffset = processPropertyYear(propertyWithOriginals, 2026)
      const withoutOffset = processPropertyYear({ ...propertyWithOriginals, offsetBalance: 0 }, 2026)
      // Same repayment amount but more principal paid when offset is large
      expect(withOffset.principalRepayment).toBeGreaterThan(withoutOffset.principalRepayment)
    })

    it('falls back to current balance when no originals stored', () => {
      // Legacy property without originalLoanAmount — should recalculate from current balance
      const legacy = { ...investmentProperty, offsetBalance: 300_000 }
      const result = processPropertyYear(legacy, 2026)
      const fallbackRepayment = calcAnnualRepayment(400_000, 0.065, 25, 'pi')
      expect(result.annualRepayment).toBeCloseTo(fallbackRepayment, 0)
    })

    it('caps repayment when mortgage is nearly paid off', () => {
      const nearlyPaid = {
        ...propertyWithOriginals,
        mortgageBalance: 5_000,
        offsetBalance: 0,
      }
      const result = processPropertyYear(nearlyPaid, 2026)
      // Repayment should not exceed remaining balance + interest
      expect(result.annualRepayment).toBeLessThanOrEqual(5_000 + (5_000 * 0.065) + 1)
    })

    it('zero repayment when mortgage is fully paid', () => {
      const paidOff = {
        ...propertyWithOriginals,
        mortgageBalance: 0,
      }
      const result = processPropertyYear(paidOff, 2026)
      expect(result.annualRepayment).toBe(0)
      expect(result.principalRepayment).toBe(0)
    })
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

    it('deducts selling costs from proceeds', () => {
      const withSale = {
        ...investmentProperty,
        saleEvent: { year: 2026, destination: 'cash', sellingCostsPct: 0.03 },
      }
      const result = processPropertyYear(withSale, 2026)
      expect(result.sellingCosts).toBeGreaterThan(0)
      // Net sale proceeds should be less than property value minus mortgage
      const grossValue = investmentProperty.currentValue * (1 + investmentProperty.growthRate)
      const grossProceeds = grossValue - investmentProperty.mortgageBalance + (grossValue - investmentProperty.mortgageBalance) * 0 // approximation
      expect(result.saleProceeds).toBeLessThan(grossValue - investmentProperty.mortgageBalance)
    })

    it('uses default selling costs when not specified', () => {
      const withSale = {
        ...investmentProperty,
        saleEvent: { year: 2026, destination: 'cash' },
      }
      const result = processPropertyYear(withSale, 2026)
      expect(result.sellingCosts).toBeGreaterThan(0) // default 2.5%
    })
  })

  describe('land tax', () => {
    it('calculates land tax for investment property with state', () => {
      const ip = { ...investmentProperty, state: 'NSW' }
      const result = processPropertyYear(ip, 2026)
      // NSW threshold is $1,075,000 — $600k property should be below threshold
      expect(result.landTax).toBe(0)
    })

    it('applies land tax above state threshold', () => {
      const ip = { ...investmentProperty, currentValue: 1_500_000, state: 'NSW' }
      const result = processPropertyYear(ip, 2026)
      expect(result.landTax).toBeGreaterThan(0)
    })

    it('no land tax for primary residence', () => {
      const ppor = { ...investmentProperty, isPrimaryResidence: true, state: 'VIC' }
      const result = processPropertyYear(ppor, 2026)
      expect(result.landTax).toBe(0)
    })

    it('no land tax without state set', () => {
      const ip = { ...investmentProperty, state: null }
      const result = processPropertyYear(ip, 2026)
      expect(result.landTax).toBe(0)
    })

    it('land tax reduces net rental income', () => {
      const ip = { ...investmentProperty, currentValue: 1_500_000, state: 'NSW' }
      const withoutState = { ...investmentProperty, currentValue: 1_500_000, state: null }
      const resultWithTax = processPropertyYear(ip, 2026)
      const resultWithout = processPropertyYear(withoutState, 2026)
      expect(resultWithTax.netRentalIncomeLoss).toBeLessThan(resultWithout.netRentalIncomeLoss)
    })
  })
})

// ── Stamp duty ────────────────────────────────────────────────────────────

describe('calcStampDuty', () => {
  it('calculates NSW stamp duty for $800k property', () => {
    const duty = calcStampDuty(800_000, 'NSW')
    expect(duty).toBeGreaterThan(20_000)
    expect(duty).toBeLessThan(40_000)
  })

  it('returns 0 with no state', () => {
    expect(calcStampDuty(800_000, null)).toBe(0)
  })

  it('returns 0 for zero purchase price', () => {
    expect(calcStampDuty(0, 'NSW')).toBe(0)
  })

  it('FHB exemption in NSW under $800k', () => {
    const fullDuty = calcStampDuty(700_000, 'NSW')
    const fhbDuty = calcStampDuty(700_000, 'NSW', true, true)
    expect(fhbDuty).toBe(0)
    expect(fullDuty).toBeGreaterThan(0)
  })

  it('FHB partial concession between exempt and concession thresholds', () => {
    // NSW: exempt up to $800k, concession up to $1M
    const duty = calcStampDuty(900_000, 'NSW', true, true)
    const fullDuty = calcStampDuty(900_000, 'NSW')
    expect(duty).toBeGreaterThan(0)
    expect(duty).toBeLessThan(fullDuty)
  })

  it('no FHB concession for investment property', () => {
    const investorDuty = calcStampDuty(700_000, 'NSW', true, false)
    const normalDuty = calcStampDuty(700_000, 'NSW')
    expect(investorDuty).toBe(normalDuty)
  })

  it('VIC stamp duty for $600k property', () => {
    const duty = calcStampDuty(600_000, 'VIC')
    expect(duty).toBeGreaterThan(15_000)
    expect(duty).toBeLessThan(40_000)
  })

  it('QLD stamp duty for $500k property', () => {
    const duty = calcStampDuty(500_000, 'QLD')
    expect(duty).toBeGreaterThan(5_000)
    expect(duty).toBeLessThan(20_000)
  })
})

// ── Land tax ──────────────────────────────────────────────────────────────

describe('calcLandTax', () => {
  it('NSW: no tax below threshold', () => {
    expect(calcLandTax(800_000, 'NSW')).toBe(0)
  })

  it('NSW: tax above threshold', () => {
    const tax = calcLandTax(1_500_000, 'NSW')
    expect(tax).toBeGreaterThan(0)
  })

  it('VIC: tax from $50k threshold', () => {
    expect(calcLandTax(30_000, 'VIC')).toBe(0)
    expect(calcLandTax(200_000, 'VIC')).toBeGreaterThan(0)
  })

  it('NT: no land tax', () => {
    expect(calcLandTax(5_000_000, 'NT')).toBe(0)
  })

  it('returns 0 for invalid input', () => {
    expect(calcLandTax(0, 'NSW')).toBe(0)
    expect(calcLandTax(500_000, null)).toBe(0)
  })
})

// ── Future property purchase ────────────────────────────────────────────────

describe('processPropertyYear — future purchase', () => {
  const baseProperty = {
    isPrimaryResidence: false,
    currentValue: 800_000,
    purchasePrice: 800_000,
    purchaseDate: null,
    mortgageBalance: 640_000,
    originalLoanAmount: 640_000,
    originalLoanTermYears: 30,
    interestRate: 0.065,
    loanTermYearsRemaining: 30,
    loanType: 'pi',
    ioEndYear: null,
    offsetBalance: 0,
    offsetAnnualTopUp: 0,
    annualRentalIncome: 40_000,
    annualPropertyExpenses: 5_000,
    growthRate: 0.04,
    state: 'NSW',
    isFirstHomeBuyer: false,
    purchasedCash: false,
    futurePurchaseYear: 2030,
    saleEvent: null,
  }

  it('returns all zeros before purchase year', () => {
    const result = processPropertyYear(baseProperty, 2028)
    expect(result.openingValue).toBe(0)
    expect(result.closingValue).toBe(0)
    expect(result.mortgageBalance).toBe(0)
    expect(result.annualRepayment).toBe(0)
    expect(result.isPurchaseYear).toBe(false)
    expect(result.stampDuty).toBe(0)
    expect(result.purchaseCashOutflow).toBe(0)
  })

  it('computes stamp duty and deposit in purchase year', () => {
    const result = processPropertyYear(baseProperty, 2030)
    expect(result.isPurchaseYear).toBe(true)
    expect(result.stampDuty).toBeGreaterThan(0)
    expect(result.purchaseCashOutflow).toBeGreaterThan(0)
    // Deposit = purchasePrice - mortgageBalance = 160k, plus stamp duty
    expect(result.purchaseCashOutflow).toBeGreaterThan(160_000)
  })

  it('operates normally after purchase year', () => {
    const result = processPropertyYear(baseProperty, 2031)
    expect(result.openingValue).toBe(800_000)
    expect(result.closingValue).toBeGreaterThan(0)
    expect(result.annualRepayment).toBeGreaterThan(0)
    expect(result.isPurchaseYear).toBe(false)
    expect(result.stampDuty).toBe(0)
    expect(result.purchaseCashOutflow).toBe(0)
  })

  it('cash purchase: full price + stamp duty as outflow', () => {
    const cashProp = { ...baseProperty, purchasedCash: true, mortgageBalance: 0 }
    const result = processPropertyYear(cashProp, 2030)
    expect(result.isPurchaseYear).toBe(true)
    // Outflow = full purchase price + stamp duty
    expect(result.purchaseCashOutflow).toBeGreaterThan(800_000)
  })

  it('FHB exemption reduces stamp duty for PPOR', () => {
    const fhbProp = {
      ...baseProperty,
      isPrimaryResidence: true,
      isFirstHomeBuyer: true,
      purchasePrice: 600_000, // under NSW FHB exemption threshold
      currentValue: 600_000,
    }
    const result = processPropertyYear(fhbProp, 2030)
    expect(result.stampDuty).toBe(0) // fully exempt under $800k NSW
  })
})
