/**
 * Web Worker — runs the Monte Carlo simulation off the main thread so the UI
 * stays responsive while 500 simulations run.
 */

import { runMonteCarlo } from './monteCarlo.js'

self.onmessage = ({ data: { id, scenario } }) => {
  try {
    self.postMessage({ id, result: runMonteCarlo(scenario) })
  } catch (e) {
    self.postMessage({ id, error: e.message || String(e) })
  }
}
