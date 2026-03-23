import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './utils/supabase.js'
import { useScenario } from './hooks/useScenario.js'
import { useSimulation } from './hooks/useSimulation.js'
import Layout from './components/Layout.jsx'
import GapDashboard from './views/GapDashboard.jsx'
import Projection from './views/Projection.jsx'
import ImpactAnalyser from './views/ImpactAnalyser.jsx'
import HouseholdProfile from './views/HouseholdProfile.jsx'
import Assumptions from './views/Assumptions.jsx'
import Compare from './views/Compare.jsx'
import Login from './views/Login.jsx'

export default function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const {
    scenarios,
    activeScenario,
    activeId,
    setActiveId,
    updateScenario,
    addScenario,
    duplicateScenario,
    deleteScenario,
    renameScenario,
  } = useScenario(user?.id)

  const { snapshots, retirementDate } = useSimulation(activeScenario)
  const [displayReal, setDisplayReal] = useState(true)

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-400">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  const sharedProps = {
    scenario: activeScenario,
    updateScenario,
    snapshots,
    retirementDate,
    scenarios,
    activeId,
    setActiveId,
    addScenario,
    duplicateScenario,
    deleteScenario,
    renameScenario,
    displayReal,
    setDisplayReal,
  }

  return (
    <Layout {...sharedProps} snapshots={snapshots}>
      <Routes>
        <Route path="/" element={<Navigate to="/gap" replace />} />
        <Route path="/gap" element={<GapDashboard {...sharedProps} />} />
        <Route path="/projection" element={<Projection {...sharedProps} />} />
        <Route path="/impact" element={<ImpactAnalyser {...sharedProps} />} />
        <Route path="/compare" element={<Compare {...sharedProps} />} />
        <Route path="/household" element={<HouseholdProfile {...sharedProps} />} />
        <Route path="/assumptions" element={<Assumptions {...sharedProps} />} />
      </Routes>
    </Layout>
  )
}
