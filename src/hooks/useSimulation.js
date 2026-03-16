/**
 * useSimulation — React hook
 * Runs the simulation engine on a scenario and memoises results.
 * Re-runs whenever the scenario changes (debounced in the scenario context).
 */

import { useMemo } from 'react'
import { runSimulation, solveRetirementDate } from '../engine/simulationEngine.js'

export function useSimulation(scenario, leverAdjustments = {}) {
  const snapshots = useMemo(() => {
    if (!scenario) return []
    try {
      return runSimulation(scenario, { leverAdjustments })
    } catch (e) {
      console.error('Simulation error:', e)
      return []
    }
  }, [scenario, leverAdjustments])

  const retirementDate = useMemo(() => {
    if (!scenario) return null
    try {
      return solveRetirementDate(scenario)
    } catch {
      return null
    }
  }, [scenario])

  return { snapshots, retirementDate }
}
