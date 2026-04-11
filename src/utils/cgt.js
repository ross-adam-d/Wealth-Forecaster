/**
 * CGT Utility
 *
 * computeCGTSummary — returns all CGT disposals in the current Australian FY
 * (1 Jul – 30 Jun) across shares, bond ETFs, and property.
 *
 * Rules applied:
 *  - 50% CGT discount for assets held > 12 months (individuals)
 *  - PPOR exemption: shown for transparency but excluded from net gain calculation
 *  - Carried-forward losses offset gains before tax estimate
 *  - Property: uses saleEvent.actualSalePrice if set; falls back to engine snapshot
 */

import { CGT_DISCOUNT, DEFAULT_SELLING_COSTS_PCT } from '../constants/index.js'
import { extractYear, parseYearMonth } from './format.js'

/**
 * Determine the current Australian financial year (1 Jul – 30 Jun).
 * @returns {{ fyStart: Date, fyEnd: Date, fyLabel: string, fyStartYear: number, fyEndYear: number }}
 */
export function currentAustralianFY() {
  const now = new Date()
  const month = now.getMonth() + 1 // 1-indexed
  const year = now.getFullYear()
  const fyStartYear = month >= 7 ? year : year - 1
  const fyEndYear = fyStartYear + 1
  return {
    fyStart: new Date(fyStartYear, 6, 1),   // 1 Jul
    fyEnd:   new Date(fyEndYear, 5, 30),    // 30 Jun
    fyLabel: `FY${fyStartYear}–${String(fyEndYear).slice(2)}`,
    fyStartYear,
    fyEndYear,
  }
}

/**
 * Return true if a date string/object falls within [fyStart, fyEnd] inclusive.
 */
function isInFY(date, fyStart, fyEnd) {
  if (!date) return false
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return false
  return d >= fyStart && d <= fyEnd
}

/**
 * Days between two dates (positive if endDate > startDate).
 */
function daysBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const s = typeof startDate === 'string' ? new Date(startDate) : startDate
  const e = typeof endDate === 'string' ? new Date(endDate) : endDate
  return (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)
}

/**
 * Compute CGT disposals and summary for the current Australian FY.
 *
 * @param {object} scenario   - active scenario object
 * @param {Array}  snapshots  - engine snapshots (from useSimulation)
 * @returns {object} CGT summary
 */
export function computeCGTSummary(scenario, snapshots) {
  const { fyStart, fyEnd, fyLabel, fyEndYear } = currentAustralianFY()
  const disposals = []

  // ── Shares ──────────────────────────────────────────────────────────────────
  for (const h of (scenario.shares?.holdings || [])) {
    if (!h.saleDate) continue
    const saleDate = new Date(h.saleDate)
    if (!isInFY(saleDate, fyStart, fyEnd)) continue

    const units = h.units || 0
    const costBase = units * (h.purchasePrice || 0)
    const proceeds = units * (h.salePrice || 0)
    const grossGain = proceeds - costBase
    const held = daysBetween(h.purchaseDate, h.saleDate)
    const discount = grossGain > 0 && held > 365

    disposals.push({
      id: h.id || `sh-${h.ticker}`,
      type: 'shares',
      name: h.ticker || h.name || 'Shares',
      purchaseDate: h.purchaseDate || null,
      saleDate: h.saleDate,
      costBase,
      proceeds,
      grossGain,
      discountApplied: discount,
      netGain: discount ? grossGain * CGT_DISCOUNT : grossGain,
      isEstimate: false,
      isPPOR: false,
    })
  }

  // ── Bond ETFs ────────────────────────────────────────────────────────────────
  for (const h of (scenario.treasuryBonds?.holdings || [])) {
    if (!h.saleDate) continue
    const saleDate = new Date(h.saleDate)
    if (!isInFY(saleDate, fyStart, fyEnd)) continue

    const units = h.units || 0
    const costBase = units * (h.purchasePrice || 0)
    const proceeds = units * (h.salePrice || 0)
    const grossGain = proceeds - costBase
    const held = daysBetween(h.purchaseDate, h.saleDate)
    const discount = grossGain > 0 && held > 365

    disposals.push({
      id: h.id || `tb-${h.ticker}`,
      type: 'bonds',
      name: h.ticker || 'Bond ETF',
      purchaseDate: h.purchaseDate || null,
      saleDate: h.saleDate,
      costBase,
      proceeds,
      grossGain,
      discountApplied: discount,
      netGain: discount ? grossGain * CGT_DISCOUNT : grossGain,
      isEstimate: false,
      isPPOR: false,
    })
  }

  // ── Property ─────────────────────────────────────────────────────────────────
  for (let i = 0; i < (scenario.properties || []).length; i++) {
    const prop = scenario.properties[i]
    const { saleEvent, isPrimaryResidence, purchasePrice = 0, purchaseDate, name } = prop
    if (!saleEvent?.year) continue

    // Determine sale date from saleEvent.year (supports "YYYY" or "YYYY-MM")
    const parsed = parseYearMonth(saleEvent.year)
    if (!parsed) continue
    const saleYear = parsed.year
    const saleMonth = parsed.month || 6  // default June if month not specified
    const saleDate = new Date(saleYear, saleMonth - 1, 1)

    if (!isInFY(saleDate, fyStart, fyEnd)) continue

    // Resolve gross sale price
    let grossSalePrice
    let isEstimate = false

    if (saleEvent.actualSalePrice) {
      grossSalePrice = saleEvent.actualSalePrice
    } else {
      // Fall back to snapshot value for the sale year
      const snap = snapshots?.find(s => s.year === saleYear)
      const propResult = snap?.propertyResults?.[i]
      // openingValue is the property value at the start of the sale year
      grossSalePrice = propResult?.openingValue || prop.currentValue || 0
      isEstimate = true
    }

    const costsPct = saleEvent.sellingCostsPct ?? DEFAULT_SELLING_COSTS_PCT
    const sellingCosts = Math.round(grossSalePrice * costsPct)
    const netProceeds = grossSalePrice - sellingCosts
    // Capital gain = net proceeds after selling costs minus cost base
    const grossGain = netProceeds - purchasePrice
    const held = daysBetween(purchaseDate, saleDate)

    if (isPrimaryResidence) {
      // PPOR — exempt from CGT, shown for transparency only
      disposals.push({
        id: prop.id || `prop-${i}`,
        type: 'property',
        name: name || 'Property (PPOR)',
        purchaseDate: purchaseDate || null,
        saleDate: saleDate.toISOString().split('T')[0],
        costBase: purchasePrice,
        proceeds: netProceeds,
        grossGain,
        discountApplied: false,
        netGain: 0,
        isEstimate,
        isPPOR: true,
      })
      continue
    }

    const discount = grossGain > 0 && held > 365

    disposals.push({
      id: prop.id || `prop-${i}`,
      type: 'property',
      name: name || 'Property',
      purchaseDate: purchaseDate || null,
      saleDate: saleDate.toISOString().split('T')[0],
      costBase: purchasePrice,
      proceeds: netProceeds,
      grossGain,
      discountApplied: discount,
      netGain: discount ? grossGain * CGT_DISCOUNT : grossGain,
      isEstimate,
      isPPOR: false,
    })
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const taxableDisposals = disposals.filter(d => !d.isPPOR)
  const totalGains = taxableDisposals
    .filter(d => d.netGain > 0)
    .reduce((s, d) => s + d.netGain, 0)
  const totalLosses = taxableDisposals
    .filter(d => d.netGain < 0)
    .reduce((s, d) => s + d.netGain, 0)
  const carriedForward = scenario.capitalLossesCarriedForward || 0
  const netCapitalGain = Math.max(0, totalGains + totalLosses - carriedForward)
  const newLossesCarriedForward = totalGains + totalLosses < 0
    ? Math.abs(totalGains + totalLosses)
    : 0

  return {
    fyLabel,
    fyEndYear,
    disposals,
    totalGains,
    totalLosses,
    carriedForward,
    netCapitalGain,
    newLossesCarriedForward,
    hasAny: disposals.length > 0,
  }
}
