/**
 * useMonteCarlo — React hook
 * Runs the Monte Carlo simulation on demand in a Web Worker.
 * The result is kept for as long as the scenario is unchanged (including across
 * page navigation); any scenario edit discards it.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// Survives the Projection view unmounting; keyed by scenario object identity
let cached = { scenario: null, result: null }

export function useMonteCarlo(scenario) {
  const [result, setResult] = useState(() => (cached.scenario === scenario ? cached.result : null))
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const workerRef = useRef(null)
  const requestId = useRef(0)

  // Scenario changed → results no longer describe it
  useEffect(() => {
    if (cached.scenario !== scenario) {
      setResult(null)
      setError(null)
      setRunning(false)
      requestId.current++
    }
  }, [scenario])

  useEffect(() => () => workerRef.current?.terminate(), [])

  const run = useCallback(() => {
    if (!scenario) return
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../engine/monteCarlo.worker.js', import.meta.url), { type: 'module' })
    }
    const id = ++requestId.current
    setRunning(true)
    setError(null)
    workerRef.current.onmessage = ({ data }) => {
      if (data.id !== requestId.current) return
      setRunning(false)
      if (data.error) {
        setError(data.error)
        return
      }
      cached = { scenario, result: data.result }
      setResult(data.result)
    }
    workerRef.current.postMessage({ id, scenario })
  }, [scenario])

  return { result, running, error, run }
}
