/**
 * Monte Carlo Engine
 *
 * Runs the deterministic simulation many times, each with a different random
 * sequence of yearly market returns, and summarises the spread of outcomes.
 * The deterministic forecast is unchanged — this only layers variability on top
 * of whatever return each asset would otherwise get (assumptions, rate periods
 * or holdings).
 */

import { runSimulation } from './simulationEngine.js'
import {
  MONTE_CARLO_RUNS,
  MONTE_CARLO_SEED,
  MONTE_CARLO_MIN_SHOCK,
  MONTE_CARLO_ASSET_RISK,
  MONTE_CARLO_PERCENTILES,
} from '../constants/index.js'

/**
 * Seeded PRNG (mulberry32) — same seed, same sequence, so results are repeatable.
 *
 * @param {number} seed
 * @returns {() => number} uniform in [0, 1)
 */
export function createRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Standard normal draw via Box–Muller.
 *
 * @param {() => number} rng
 * @returns {number}
 */
function normal(rng) {
  const u = 1 - rng()  // (0, 1] — avoids log(0)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Generate one run's yearly return shocks for every asset class.
 *
 * @param {number} years
 * @param {() => number} rng
 * @param {object} assetRisk - { [assetClass]: { volatility, marketBeta } }
 * @returns {Array<object>} one { [assetClass]: shock } per year
 */
export function generateReturnShocks(years, rng, assetRisk = MONTE_CARLO_ASSET_RISK) {
  const shocks = []
  for (let y = 0; y < years; y++) {
    const market = normal(rng)
    const yearShock = {}
    for (const [asset, { volatility, marketBeta }] of Object.entries(assetRisk)) {
      const own = normal(rng)
      const draw = marketBeta * market + Math.sqrt(1 - marketBeta * marketBeta) * own
      yearShock[asset] = Math.max(MONTE_CARLO_MIN_SHOCK, volatility * draw)
    }
    shocks.push(yearShock)
  }
  return shocks
}

/**
 * Value at percentile p (0–100) of an ascending-sorted array, linear interpolation.
 *
 * @param {number[]} sorted
 * @param {number} p
 * @returns {number}
 */
export function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/**
 * Run the Monte Carlo simulation for a scenario.
 *
 * A run "succeeds" if liquid assets never fall below zero — the same test the
 * retirement-date solver uses for viability.
 *
 * @param {object} scenario
 * @param {object} opts
 * @param {number} opts.runs
 * @param {number} opts.seed
 * @param {Date}   opts.asOf - passed through to runSimulation
 * @returns {{ runs: number, successRate: number, years: Array<object> }}
 *   years: [{ year, netWorth: { p10, p25, p50, p75, p90 }, liquid: { … } }]
 */
export function runMonteCarlo(scenario, { runs = MONTE_CARLO_RUNS, seed = MONTE_CARLO_SEED, asOf = new Date() } = {}) {
  const baseline = runSimulation(scenario, { asOf })
  const yearCount = baseline.length
  const rng = createRng(seed)

  // Per-year columns of outcomes across runs
  const netWorthByYear = Array.from({ length: yearCount }, () => new Array(runs))
  const liquidByYear = Array.from({ length: yearCount }, () => new Array(runs))
  let successes = 0

  for (let r = 0; r < runs; r++) {
    const snapshots = runSimulation(scenario, { asOf, returnShocks: generateReturnShocks(yearCount, rng) })
    let succeeded = true
    for (let y = 0; y < yearCount; y++) {
      netWorthByYear[y][r] = snapshots[y].totalNetWorth
      liquidByYear[y][r] = snapshots[y].totalLiquidAssets
      if (snapshots[y].totalLiquidAssets < 0) succeeded = false
    }
    if (succeeded) successes++
  }

  const bands = values => {
    const sorted = values.sort((a, b) => a - b)
    return Object.fromEntries(MONTE_CARLO_PERCENTILES.map(p => [`p${p}`, percentile(sorted, p)]))
  }

  return {
    runs,
    successRate: successes / runs,
    years: baseline.map((s, y) => ({
      year: s.year,
      netWorth: bands(netWorthByYear[y]),
      liquid: bands(liquidByYear[y]),
    })),
  }
}
