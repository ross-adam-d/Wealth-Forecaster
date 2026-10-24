/**
 * Expense Hierarchy Module
 * Three-level tree: Group → Category → Subcategory
 * Supports annual, monthly, one-off, and recurring amounts with optional date ranges.
 * Fixed/discretionary tagging cascades down; children can override.
 *
 * Date fields (activeFrom, activeTo) support both year numbers (2030) and
 * month-precision strings ("2030-09"). When a boundary falls mid-year the
 * amount is pro-rated by the fraction of months active.
 */

import { extractYear, yearFraction } from '../utils/format.js'

/**
 * Resolve a single expense node's amount for a given year.
 *
 * @param {object} node         - expense node from data model
 * @param {number} year         - simulation year
 * @param {number} currentYear  - base year for inflation compounding
 * @param {number} globalInflation
 * @param {object} leverAdjustments - { discretionary: 0.0, fixed: 0.0 } fractional adjustments
 * @returns {number} resolved annual amount
 */
export function resolveNodeAmount(node, year, currentYear, globalInflation, leverAdjustments = {}) {
  // Check active window — supports "YYYY-MM" strings and plain year numbers
  const fromYear = extractYear(node.activeFrom)
  const toYear = extractYear(node.activeTo)
  if (fromYear != null && year < fromYear) return 0
  if (toYear != null && year > toYear) return 0

  // One-off: only applies in its specific year
  if (node.amountType === 'one_off' && year !== fromYear) return 0

  // Recurring: fires every N years from the start year within the active window
  if (node.amountType === 'recurring') {
    const every = node.recurringEveryYears
    if (!every || every < 1 || fromYear == null) return 0
    if ((year - fromYear) % every !== 0) return 0
  }

  if (node.amount == null || node.amount === 0) return 0

  const baseAmount = node.amountType === 'monthly' ? node.amount * 12 : node.amount

  // Inflation compounding
  const inflationRate = node.inflationRate != null ? node.inflationRate : globalInflation
  const yearsElapsed = year - currentYear
  const inflatedAmount = baseAmount * Math.pow(1 + inflationRate, yearsElapsed)

  // Lever adjustments
  const { discretionary = 0, fixed = 0 } = leverAdjustments
  const adjustment = node.isDiscretionary ? discretionary : fixed
  const adjustedAmount = inflatedAmount * (1 + adjustment)

  // Pro-rate for month precision (only for annual/monthly amounts, not one-off or recurring)
  let proRatedAmount = adjustedAmount
  if (node.amountType !== 'one_off' && node.amountType !== 'recurring') {
    const frac = yearFraction(year, node.activeFrom, node.activeTo)
    if (frac < 1) proRatedAmount = adjustedAmount * frac
  }

  return Math.max(0, proRatedAmount)
}

/**
 * Recursively resolve total expenses for a tree node in a given year.
 * The node itself may have an amount AND children (rolls up whatever exists).
 *
 * @param {object} node
 * @param {number} year
 * @param {number} currentYear
 * @param {number} globalInflation
 * @param {object} leverAdjustments
 * @param {boolean} parentIsDiscretionary - cascades from parent unless overridden
 * @returns {{ total: number, breakdown: object }}
 */
export function resolveExpenseTree(
  node,
  year,
  currentYear,
  globalInflation,
  leverAdjustments = {},
  parentIsDiscretionary = false,
) {
  // Child can override parent's discretionary tag
  const isDiscretionary = node.isDiscretionary !== undefined
    ? node.isDiscretionary
    : parentIsDiscretionary

  const nodeWithTag = { ...node, isDiscretionary }
  const ownAmount = resolveNodeAmount(nodeWithTag, year, currentYear, globalInflation, leverAdjustments)

  const childResults = (node.children || []).map(child =>
    resolveExpenseTree(child, year, currentYear, globalInflation, leverAdjustments, isDiscretionary)
  )

  const childTotal = childResults.reduce((sum, r) => sum + r.total, 0)
  const total = ownAmount + childTotal

  return {
    id: node.id,
    label: node.label,
    isDiscretionary,
    ownAmount,
    childTotal,
    total,
    children: childResults,
  }
}

/**
 * Describe a node's own amount relative to `year`, in today's dollars, for display.
 *   annual/monthly → 'active' | 'future' | 'ended' with `annual` (full yearly rate)
 *   one-off/recurring → 'upcoming' (with `nextYear`) | 'past'
 *   no amount → 'none'
 */
export function describeExpenseAmount(node, year) {
  const amount = node.amount || 0
  const from = extractYear(node.activeFrom)
  const to = extractYear(node.activeTo)
  if (!amount) return { status: 'none', amount: 0 }

  if (node.amountType === 'one_off') {
    if (from != null && from < year) return { status: 'past', amount, nextYear: from }
    return { status: 'upcoming', amount, nextYear: from }
  }

  if (node.amountType === 'recurring') {
    const every = node.recurringEveryYears
    if (!every || every < 1 || from == null) return { status: 'none', amount: 0 }
    const nextYear = from >= year ? from : from + Math.ceil((year - from) / every) * every
    if (to != null && nextYear > to) return { status: 'past', amount, everyYears: every }
    return { status: 'upcoming', amount, nextYear, everyYears: every }
  }

  const annual = node.amountType === 'monthly' ? amount * 12 : amount
  if (from != null && from > year) return { status: 'future', annual, from, to }
  if (to != null && to < year) return { status: 'ended', annual, from, to }
  return { status: 'active', annual, from, to }
}

/**
 * Roll up a node and its children for display, in today's dollars:
 *   ongoing         — yearly cost of annual/monthly items active in `year`
 *   occasional      — upcoming one-off/recurring costs (amount per occurrence)
 *   occasionalCount — number of those items
 *   nextStart       — earliest start year of annual/monthly items not yet active
 */
export function summariseExpenseNode(node, year) {
  const own = describeExpenseAmount(node, year)
  const summary = {
    ongoing: own.status === 'active' ? own.annual : 0,
    occasional: own.status === 'upcoming' ? own.amount : 0,
    occasionalCount: own.status === 'upcoming' ? 1 : 0,
    nextStart: own.status === 'future' ? own.from : null,
  }
  for (const child of node.children || []) {
    const c = summariseExpenseNode(child, year)
    summary.ongoing += c.ongoing
    summary.occasional += c.occasional
    summary.occasionalCount += c.occasionalCount
    if (c.nextStart != null && (summary.nextStart == null || c.nextStart < summary.nextStart)) {
      summary.nextStart = c.nextStart
    }
  }
  return summary
}

/**
 * Flatten the expense breakdown into a list of groups with totals.
 * Useful for attribution in the Impact Analyser.
 *
 * @param {object} breakdown - result from resolveExpenseTree
 * @returns {Array<{ label, total, isDiscretionary }>}
 */
export function flattenExpenseGroups(breakdown) {
  const groups = []
  for (const group of breakdown.children || []) {
    groups.push({
      label: group.label,
      total: group.total,
      isDiscretionary: group.isDiscretionary,
    })
  }
  return groups
}

/**
 * Default starter expense structure as per the spec.
 * Fully editable — this is just the starting point.
 */
export function createStarterExpenses() {
  return {
    id: 'root',
    label: 'Expenses',
    type: 'group',
    amountType: 'annual',
    amount: 0,
    isDiscretionary: false,
    children: [
      {
        id: 'living',
        label: 'Living',
        type: 'group',
        amount: 0,
        isDiscretionary: false,
        children: [
          { id: 'housing', label: 'Housing', type: 'category', amount: 0, isDiscretionary: false,
            children: [
              { id: 'utilities', label: 'Utilities', type: 'subcategory', amount: 2400, amountType: 'annual', isDiscretionary: false, children: [] },
              { id: 'maintenance', label: 'Maintenance & repairs', type: 'subcategory', amount: 2000, amountType: 'annual', isDiscretionary: false, children: [] },
            ],
          },
          { id: 'food', label: 'Food', type: 'category', amount: 0, isDiscretionary: false,
            children: [
              { id: 'groceries', label: 'Groceries', type: 'subcategory', amount: 12000, amountType: 'annual', isDiscretionary: false, children: [] },
              { id: 'eating_out', label: 'Eating out', type: 'subcategory', amount: 6000, amountType: 'annual', isDiscretionary: true, children: [] },
            ],
          },
          { id: 'transport', label: 'Transport', type: 'category', amount: 0, isDiscretionary: false,
            children: [
              { id: 'fuel_rego', label: 'Fuel & rego', type: 'subcategory', amount: 3000, amountType: 'annual', isDiscretionary: false, children: [] },
              { id: 'public_transport', label: 'Public transport', type: 'subcategory', amount: 1200, amountType: 'annual', isDiscretionary: false, children: [] },
            ],
          },
        ],
      },
      {
        id: 'lifestyle',
        label: 'Lifestyle',
        type: 'group',
        amount: 0,
        isDiscretionary: true,
        children: [
          { id: 'travel', label: 'Travel', type: 'category', amount: 8000, amountType: 'annual', isDiscretionary: true, children: [] },
          { id: 'entertainment', label: 'Entertainment', type: 'category', amount: 3000, amountType: 'annual', isDiscretionary: true, children: [] },
          { id: 'health_fitness', label: 'Health & fitness', type: 'category', amount: 2000, amountType: 'annual', isDiscretionary: true, children: [] },
          { id: 'subscriptions', label: 'Subscriptions', type: 'category', amount: 1200, amountType: 'annual', isDiscretionary: true, children: [] },
        ],
      },
      {
        id: 'commitments',
        label: 'Savings & commitments',
        type: 'group',
        amount: 0,
        isDiscretionary: false,
        children: [
          { id: 'school_fees', label: 'School fees', type: 'category', amount: 0, amountType: 'annual', isDiscretionary: false, children: [] },
          { id: 'insurance', label: 'Insurance', type: 'category', amount: 4000, amountType: 'annual', isDiscretionary: false, children: [] },
          { id: 'donations', label: 'Donations', type: 'category', amount: 0, amountType: 'annual', isDiscretionary: true, children: [] },
        ],
      },
    ],
  }
}
