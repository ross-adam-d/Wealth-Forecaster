/**
 * Time-Varying Rate Period Engine
 *
 * Each investment asset supports multiple contiguous rate periods.
 * Engine resolves the applicable rate per asset per year.
 * Rate changes discretely at period boundary — no interpolation.
 */

/**
 * Resolve the applicable return rate for an asset in a given year.
 *
 * @param {Array<{fromYear: number, toYear: number, rate: number}>} ratePeriods
 * @param {number} year
 * @param {number} fallbackRate - default rate if no period matches
 * @returns {number}
 */
export function resolveRatePeriodRate(ratePeriods, year, fallbackRate = 0) {
  if (!ratePeriods || ratePeriods.length === 0) return fallbackRate

  for (const period of ratePeriods) {
    if (year >= period.fromYear && year <= period.toYear) {
      return period.rate
    }
  }

  // If beyond all defined periods, use the last period's rate
  const sorted = [...ratePeriods].sort((a, b) => b.toYear - a.toYear)
  if (year > sorted[0].toYear) return sorted[0].rate

  return fallbackRate
}

/**
 * Validate that rate periods cover the full simulation range without gaps.
 *
 * @param {Array} ratePeriods
 * @param {number} simStartYear
 * @param {number} simEndYear
 * @returns {{ valid: boolean, gaps: Array }}
 */
export function validateRatePeriods(ratePeriods, simStartYear, simEndYear) {
  if (!ratePeriods || ratePeriods.length === 0) {
    return { valid: false, gaps: [{ from: simStartYear, to: simEndYear }] }
  }

  const sorted = [...ratePeriods].sort((a, b) => a.fromYear - b.fromYear)
  const gaps = []

  // Check coverage from sim start
  if (sorted[0].fromYear > simStartYear) {
    gaps.push({ from: simStartYear, to: sorted[0].fromYear - 1 })
  }

  // Check for gaps between periods
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].toYear + 1 < sorted[i + 1].fromYear) {
      gaps.push({ from: sorted[i].toYear + 1, to: sorted[i + 1].fromYear - 1 })
    }
  }

  return { valid: gaps.length === 0, gaps }
}

/**
 * Create a default single rate period covering the full simulation range.
 *
 * @param {number} rate
 * @param {number} fromYear
 * @param {number} toYear
 * @returns {Array}
 */
export function createSinglePeriod(rate, fromYear, toYear) {
  return [{ fromYear, toYear, rate }]
}
