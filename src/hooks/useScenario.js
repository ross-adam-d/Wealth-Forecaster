/**
 * useScenario — manages active scenario state with auto-save debounce.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { createDefaultScenario } from '../utils/schema.js'
import { AUTOSAVE_DEBOUNCE_MS } from '../constants/index.js'
import { supabase } from '../utils/supabase.js'

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
          investmentBonds: row.data.investmentBonds ?? defaults.investmentBonds,
          expenses: row.data.expenses ?? defaults.expenses,
          household: row.data.household ?? defaults.household,
          assumptions: row.data.assumptions ?? defaults.assumptions,
        }))
        setScenarios(loaded)
        setActiveId(loaded[0].id)
      }
    })()
  }, [userId])

  // Debounced auto-save
  const triggerAutoSave = useCallback((updatedScenarios) => {
    if (!userId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      for (const scenario of updatedScenarios) {
        await supabase.from('scenarios').upsert({
          id: scenario.id,
          user_id: userId,
          data: scenario,
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
