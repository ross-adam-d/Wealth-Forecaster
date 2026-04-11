/**
 * useScenario — manages active scenario state with auto-save debounce.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { createDefaultScenario } from '../utils/schema.js'
import { AUTOSAVE_DEBOUNCE_MS } from '../constants/index.js'
import { supabase } from '../utils/supabase.js'
import { computeActuals } from '../utils/actuals.js'

export function useScenario(userId) {
  const [scenarios, setScenarios] = useState([createDefaultScenario()])
  const [activeId, setActiveId] = useState(scenarios[0].id)
  const saveTimerRef = useRef(null)

  const activeScenario = scenarios.find(s => s.id === activeId) || scenarios[0]

  // Load scenarios from Supabase on mount
  useEffect(() => {
    if (!userId) return
    ;(async () => {
      const { data, error } = await supabase
        .from('scenarios')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (!error && data?.length > 0) {
        const defaults = createDefaultScenario()
        const loaded = data.map(row => ({
          ...defaults,
          ...row.data,
          super: row.data.super ?? defaults.super,
          properties: row.data.properties ?? defaults.properties,
          shares: row.data.shares ?? defaults.shares,
          treasuryBonds: row.data.treasuryBonds ?? defaults.treasuryBonds,
          commodities: row.data.commodities ?? defaults.commodities,
          investmentBonds: row.data.investmentBonds ?? defaults.investmentBonds,
          expenses: row.data.expenses ?? defaults.expenses,
          household: row.data.household ?? defaults.household,
          assumptions: { ...defaults.assumptions, ...(row.data.assumptions ?? {}) },
        }))
        setScenarios(loaded)
        setActiveId(loaded[0].id)
      }
    })()
  }, [userId])

  // Append an actuals snapshot if the scenario has meaningful data and
  // enough time has passed (>7 days) or net worth has shifted by >2%.
  function withActualsSnapshot(scenario) {
    const actuals = computeActuals(scenario)
    if (actuals.totalAssets === 0 && actuals.totalLiabilities === 0) return scenario

    const history = scenario.actualsHistory || []
    const last = history[history.length - 1]
    const today = new Date().toISOString().split('T')[0]

    if (last?.date === today) return scenario // already snapshotted today

    const daysSinceLast = last
      ? Math.floor((Date.now() - new Date(last.date).getTime()) / 86_400_000)
      : Infinity
    const netWorthShift = last
      ? Math.abs((actuals.netWorth - last.netWorth) / (Math.abs(last.netWorth) || 1))
      : 1

    if (daysSinceLast < 7 && netWorthShift < 0.02) return scenario

    const newEntry = {
      date: today,
      netWorth:     Math.round(actuals.netWorth),
      liquidAssets: Math.round(actuals.liquidAssets),
      totalDebt:    Math.round(actuals.totalDebt),
    }
    return { ...scenario, actualsHistory: [...history, newEntry].slice(-100) }
  }

  // Debounced auto-save
  const triggerAutoSave = useCallback((updatedScenarios) => {
    if (!userId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      for (const scenario of updatedScenarios) {
        const toSave = withActualsSnapshot(scenario)
        await supabase.from('scenarios').upsert({
          id: toSave.id,
          user_id: userId,
          data: toSave,
          updated_at: new Date().toISOString(),
        })
      }
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [userId])

  const updateScenario = useCallback((updates) => {
    setScenarios(prev => {
      const updated = prev.map(s =>
        s.id === activeId ? { ...s, ...updates } : s
      )
      triggerAutoSave(updated)
      return updated
    })
  }, [activeId, triggerAutoSave])

  const addScenario = useCallback((name) => {
    const newScenario = createDefaultScenario(name)
    setScenarios(prev => {
      const updated = [...prev, newScenario]
      triggerAutoSave(updated)
      return updated
    })
    setActiveId(newScenario.id)
  }, [triggerAutoSave])

  const duplicateScenario = useCallback((id) => {
    const source = scenarios.find(s => s.id === id)
    if (!source) return
    const duplicate = {
      ...JSON.parse(JSON.stringify(source)),
      id: crypto.randomUUID(),
      name: `${source.name} (copy)`,
    }
    setScenarios(prev => {
      const updated = [...prev, duplicate]
      triggerAutoSave(updated)
      return updated
    })
    setActiveId(duplicate.id)
  }, [scenarios, triggerAutoSave])

  const deleteScenario = useCallback((id) => {
    setScenarios(prev => {
      if (prev.length <= 1) return prev
      const updated = prev.filter(s => s.id !== id)
      // If deleting active, switch to first remaining
      if (id === activeId) setActiveId(updated[0].id)
      // Delete from Supabase
      if (userId) supabase.from('scenarios').delete().eq('id', id).then(() => {})
      return updated
    })
  }, [activeId, userId])

  const renameScenario = useCallback((id, newName) => {
    setScenarios(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, name: newName } : s)
      triggerAutoSave(updated)
      return updated
    })
  }, [triggerAutoSave])

  return {
    scenarios,
    activeScenario,
    activeId,
    setActiveId,
    updateScenario,
    addScenario,
    duplicateScenario,
    deleteScenario,
    renameScenario,
  }
}
