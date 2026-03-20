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
