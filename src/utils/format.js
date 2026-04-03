/**
 * Shared display utilities used across views.
 */

export function fmt$(n) {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

/**
 * Convert a nominal value to real (today's dollars).
 * When isReal is false, returns the value unchanged.
 */
export function applyRealNominal(value, year, currentYear, inflationRate, isReal) {
  if (!isReal || value == null) return value
  const years = year - currentYear
  return value / Math.pow(1 + inflationRate, years)
}

/**
 * Parse a date value that may be a year number, "YYYY", or "YYYY-MM" string.
 * Returns { year, month } where month is 1-12 (null if year-only).
 */
export function parseYearMonth(value) {
  if (value == null) return null
  if (typeof value === 'number') return { year: value, month: null }
  if (typeof value === 'string') {
    const parts = value.split('-')
    const year = parseInt(parts[0], 10)
    if (isNaN(year)) return null
    if (parts.length >= 2) {
      const month = parseInt(parts[1], 10)
      return { year, month: (month >= 1 && month <= 12) ? month : null }
    }
    return { year, month: null }
  }
  return null
}

/**
 * Calculate the fraction of a year that falls within a date range.
 * Handles year numbers and "YYYY-MM" strings for start/end.
 * Returns a fraction between 0 and 1 (e.g. Sep-Dec of a year = 4/12).
 */
export function yearFraction(year, from, to) {
  const parsedFrom = parseYearMonth(from)
  const parsedTo = parseYearMonth(to)

  // Start month within this year (1 = Jan, default to 1)
  let startMonth = 1
  if (parsedFrom && parsedFrom.year === year && parsedFrom.month) {
    startMonth = parsedFrom.month
  } else if (parsedFrom && parsedFrom.year > year) {
    return 0  // hasn't started yet
  }

  // End month within this year (12 = Dec, default to 12)
  let endMonth = 12
  if (parsedTo && parsedTo.year === year && parsedTo.month) {
    endMonth = parsedTo.month
  } else if (parsedTo && parsedTo.year < year) {
    return 0  // already ended
  }

  if (startMonth > endMonth) return 0
  return (endMonth - startMonth + 1) / 12
}

/**
 * Extract just the year from a date value (number, "YYYY", or "YYYY-MM").
 */
export function extractYear(value) {
  const parsed = parseYearMonth(value)
  return parsed ? parsed.year : null
}
