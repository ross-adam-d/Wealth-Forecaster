import { describe, it, expect } from 'vitest'
import { resolveNodeAmount, resolveExpenseTree } from '../modules/expenses.js'

const CURRENT_YEAR = 2026
const INFLATION = 0.025

// ── resolveNodeAmount ──────────────────────────────────────────────────────

describe('resolveNodeAmount', () => {
  const annualNode = {
    amountType: 'annual',
    amount: 5_000,
    isDiscretionary: false,
    activeFrom: null,
    activeTo: null,
    inflationRate: null,
  }

  it('returns base amount in current year (year 0 — no inflation)', () => {
    expect(resolveNodeAmount(annualNode, CURRENT_YEAR, CURRENT_YEAR, INFLATION)).toBeCloseTo(5_000, 0)
  })

  it('inflates annual amount over time at 2.5%', () => {
    // Year 2, inflation: 5,000 * 1.025^2 = 5,000 * 1.050625 = 5,253.13
    expect(resolveNodeAmount(annualNode, CURRENT_YEAR + 2, CURRENT_YEAR, INFLATION)).toBeCloseTo(5_253.13, 0)
  })

  it('converts monthly amount to annual before inflation', () => {
    const monthly = { ...annualNode, amountType: 'monthly', amount: 1_000 }
    // base = 1,000 * 12 = 12,000
    expect(resolveNodeAmount(monthly, CURRENT_YEAR, CURRENT_YEAR, INFLATION)).toBeCloseTo(12_000, 0)
  })

  it('uses node-specific inflation rate when provided', () => {
    const nodeRate = 0.05 // higher inflation rate
    const customInflation = { ...annualNode, inflationRate: nodeRate }
    // 5,000 * 1.05^2 = 5,512.5
    expect(resolveNodeAmount(customInflation, CURRENT_YEAR + 2, CURRENT_YEAR, INFLATION))
      .toBeCloseTo(5_000 * Math.pow(1.05, 2), 0)
  })

  describe('one-off expenses', () => {
    const oneOff = { ...annualNode, amountType: 'one_off', activeFrom: CURRENT_YEAR + 2 }

    it('returns amount only in the exact activeFrom year', () => {
      expect(resolveNodeAmount(oneOff, CURRENT_YEAR + 2, CURRENT_YEAR, INFLATION)).toBeGreaterThan(0)
    })

    it('returns 0 in years before activeFrom', () => {
      expect(resolveNodeAmount(oneOff, CURRENT_YEAR + 1, CURRENT_YEAR, INFLATION)).toBe(0)
    })

    it('returns 0 in years after activeFrom', () => {
      expect(resolveNodeAmount(oneOff, CURRENT_YEAR + 3, CURRENT_YEAR, INFLATION)).toBe(0)
    })
  })

  describe('recurring expenses', () => {
    const recurring = {
      amountType: 'recurring',
      amount: 40_000,
      recurringEveryYears: 10,
      isDiscretionary: false,
      activeFrom: CURRENT_YEAR,
      activeTo: CURRENT_YEAR + 40,
      inflationRate: null,
    }

    it('fires in the activeFrom year', () => {
      expect(resolveNodeAmount(recurring, CURRENT_YEAR, CURRENT_YEAR, INFLATION)).toBeCloseTo(40_000, 0)
    })

    it('fires every N years from activeFrom', () => {
      expect(resolveNodeAmount(recurring, CURRENT_YEAR + 10, CURRENT_YEAR, INFLATION)).toBeGreaterThan(0)
      expect(resolveNodeAmount(recurring, CURRENT_YEAR + 20, CURRENT_YEAR, INFLATION)).toBeGreaterThan(0)
      expect(resolveNodeAmount(recurring, CURRENT_YEAR + 30, CURRENT_YEAR, INFLATION)).toBeGreaterThan(0)
      expect(resolveNodeAmount(recurring, CURRENT_YEAR + 40, CURRENT_YEAR, INFLATION)).toBeGreaterThan(0)
    })

    it('returns 0 in non-firing years', () => {
      expect(resolveNodeAmount(recurring, CURRENT_YEAR + 1, CURRENT_YEAR, INFLATION)).toBe(0)
      expect(resolveNodeAmount(recurring, CURRENT_YEAR + 5, CURRENT_YEAR, INFLATION)).toBe(0)
      expect(resolveNodeAmount(recurring, CURRENT_YEAR + 9, CURRENT_YEAR, INFLATION)).toBe(0)
    })

    it('returns 0 outside active window', () => {
      expect(resolveNodeAmount(recurring, CURRENT_YEAR - 1, CURRENT_YEAR, INFLATION)).toBe(0)
      expect(resolveNodeAmount(recurring, CURRENT_YEAR + 41, CURRENT_YEAR, INFLATION)).toBe(0)
    })

    it('applies inflation to firing year', () => {
      // Year +10: 40,000 * 1.025^10
      const expected = 40_000 * Math.pow(1.025, 10)
      expect(resolveNodeAmount(recurring, CURRENT_YEAR + 10, CURRENT_YEAR, INFLATION)).toBeCloseTo(expected, 0)
    })

    it('returns 0 when recurringEveryYears is missing', () => {
      const noFreq = { ...recurring, recurringEveryYears: null }
      expect(resolveNodeAmount(noFreq, CURRENT_YEAR, CURRENT_YEAR, INFLATION)).toBe(0)
    })

    it('returns 0 when activeFrom is missing', () => {
      const noStart = { ...recurring, activeFrom: null }
      expect(resolveNodeAmount(noStart, CURRENT_YEAR, CURRENT_YEAR, INFLATION)).toBe(0)
    })
  })

  describe('date-bounded expenses', () => {
    const timeBounded = {
      ...annualNode,
      amountType: 'annual',
      activeFrom: CURRENT_YEAR + 1,
      activeTo: CURRENT_YEAR + 5,
    }

    it('returns 0 before activeFrom year', () => {
      expect(resolveNodeAmount(timeBounded, CURRENT_YEAR, CURRENT_YEAR, INFLATION)).toBe(0)
    })

    it('returns amount within active window', () => {
      expect(resolveNodeAmount(timeBounded, CURRENT_YEAR + 1, CURRENT_YEAR, INFLATION)).toBeGreaterThan(0)
      expect(resolveNodeAmount(timeBounded, CURRENT_YEAR + 3, CURRENT_YEAR, INFLATION)).toBeGreaterThan(0)
      expect(resolveNodeAmount(timeBounded, CURRENT_YEAR + 5, CURRENT_YEAR, INFLATION)).toBeGreaterThan(0)
    })

    it('returns 0 after activeTo year', () => {
      expect(resolveNodeAmount(timeBounded, CURRENT_YEAR + 6, CURRENT_YEAR, INFLATION)).toBe(0)
    })
  })

  describe('lever adjustments', () => {
    it('applies discretionary lever to discretionary expenses', () => {
      const discrete = { ...annualNode, isDiscretionary: true }
      const result = resolveNodeAmount(discrete, CURRENT_YEAR, CURRENT_YEAR, INFLATION, { discretionary: 0.20 })
      // 5,000 * 1.20 = 6,000
      expect(result).toBeCloseTo(6_000, 0)
    })

    it('discretionary lever does not affect fixed expenses', () => {
      const fixed = { ...annualNode, isDiscretionary: false }
      const result = resolveNodeAmount(fixed, CURRENT_YEAR, CURRENT_YEAR, INFLATION, { discretionary: 0.50 })
      expect(result).toBeCloseTo(5_000, 0)
    })

    it('applies fixed lever to non-discretionary expenses', () => {
      const fixed = { ...annualNode, isDiscretionary: false }
      const result = resolveNodeAmount(fixed, CURRENT_YEAR, CURRENT_YEAR, INFLATION, { fixed: -0.10 })
      // 5,000 * 0.90 = 4,500
      expect(result).toBeCloseTo(4_500, 0)
    })

    it('lever cannot push amount below zero', () => {
      const discrete = { ...annualNode, isDiscretionary: true }
      const result = resolveNodeAmount(discrete, CURRENT_YEAR, CURRENT_YEAR, INFLATION, { discretionary: -1.0 })
      expect(result).toBe(0)
    })
  })

  it('returns 0 for zero amount', () => {
    const empty = { ...annualNode, amount: 0 }
    expect(resolveNodeAmount(empty, CURRENT_YEAR, CURRENT_YEAR, INFLATION)).toBe(0)
  })
})

// ── resolveExpenseTree ────────────────────────────────────────────────────

describe('resolveExpenseTree', () => {
  it('totals children in a simple flat tree', () => {
    const tree = {
      id: 'root', label: 'Expenses', amount: 0, isDiscretionary: false,
      children: [
        { id: 'a', label: 'Rent', amount: 24_000, amountType: 'annual', isDiscretionary: false, children: [] },
        { id: 'b', label: 'Food', amount: 12_000, amountType: 'annual', isDiscretionary: false, children: [] },
      ],
    }
    const result = resolveExpenseTree(tree, CURRENT_YEAR, CURRENT_YEAR, INFLATION)
    expect(result.total).toBeCloseTo(36_000, 0)
    expect(result.children).toHaveLength(2)
  })

  it('rolls up nested children correctly', () => {
    const tree = {
      id: 'root', label: 'Root', amount: 0, isDiscretionary: false,
      children: [{
        id: 'group', label: 'Living', amount: 0, isDiscretionary: false,
        children: [
          { id: 'rent', label: 'Rent', amount: 24_000, amountType: 'annual', isDiscretionary: false, children: [] },
          { id: 'food', label: 'Food', amount: 12_000, amountType: 'annual', isDiscretionary: false, children: [] },
        ],
      }],
    }
    const result = resolveExpenseTree(tree, CURRENT_YEAR, CURRENT_YEAR, INFLATION)
    expect(result.total).toBeCloseTo(36_000, 0)
    expect(result.children[0].total).toBeCloseTo(36_000, 0)
  })

  it('parent discretionary tag cascades to children without override', () => {
    const tree = {
      id: 'root', label: 'Lifestyle', amount: 0, isDiscretionary: true,
      children: [
        // no isDiscretionary set — should inherit parent's true
        { id: 'travel', label: 'Travel', amount: 8_000, amountType: 'annual', children: [] },
      ],
    }
    const result = resolveExpenseTree(tree, CURRENT_YEAR, CURRENT_YEAR, INFLATION, { discretionary: 0.20 })
    // Travel inherits discretionary:true, lever applied: 8,000 * 1.20 = 9,600
    expect(result.total).toBeCloseTo(9_600, 0)
  })

  it('child can override parent discretionary tag', () => {
    const tree = {
      id: 'root', label: 'Group', amount: 0, isDiscretionary: true,
      children: [
        {
          id: 'insurance', label: 'Insurance', amount: 4_000, amountType: 'annual',
          isDiscretionary: false, // override — this is fixed
          children: [],
        },
      ],
    }
    const result = resolveExpenseTree(tree, CURRENT_YEAR, CURRENT_YEAR, INFLATION, { discretionary: 0.50 })
    // Insurance is fixed, discretionary lever shouldn't apply
    expect(result.total).toBeCloseTo(4_000, 0)
  })

  it('returns correct structure with id and label', () => {
    const tree = {
      id: 'root', label: 'My Expenses', amount: 1_000, amountType: 'annual',
      isDiscretionary: false, children: [],
    }
    const result = resolveExpenseTree(tree, CURRENT_YEAR, CURRENT_YEAR, INFLATION)
    expect(result.id).toBe('root')
    expect(result.label).toBe('My Expenses')
    expect(result.ownAmount).toBeCloseTo(1_000, 0)
    expect(result.childTotal).toBe(0)
  })

  it('handles empty expense tree gracefully', () => {
    const empty = { id: 'root', label: 'Empty', amount: 0, isDiscretionary: false, children: [] }
    const result = resolveExpenseTree(empty, CURRENT_YEAR, CURRENT_YEAR, INFLATION)
    expect(result.total).toBe(0)
  })
})
