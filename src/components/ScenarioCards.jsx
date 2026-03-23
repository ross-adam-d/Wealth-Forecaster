import { useState, useMemo, useRef, useEffect } from 'react'
import { runSimulation, solveRetirementDate } from '../engine/simulationEngine.js'

function fmt$(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

/** Compute summary stats for a scenario (cheap — one simulation run). */
function useScenarioSummary(scenario) {
  return useMemo(() => {
    if (!scenario) return null
    try {
      const snaps = runSimulation(scenario)
      const rd = solveRetirementDate(scenario)
      const last = snaps[snaps.length - 1]
      const deficitYears = snaps.deficitYears || []
      const firstDeficitYear = snaps.firstDeficitYear || null

      // Find retirement snapshot for liquid assets at retirement
      const retireSnap = rd?.retirementYear
        ? snaps.find(s => s.year === rd.retirementYear)
        : null

      return {
        netWorthAtEnd: last?.totalNetWorth ?? 0,
        liquidAtRetirement: retireSnap?.totalLiquidAssets ?? null,
        retirementYear: rd?.retirementYear ?? null,
        retirementAge: rd?.retirementAge ?? null,
        deficitCount: deficitYears.length,
        firstDeficitYear,
        // viable = no deficits, at-risk = <5 deficit years, critical = 5+
        viability: deficitYears.length === 0 ? 'viable' : deficitYears.length < 5 ? 'at-risk' : 'critical',
      }
    } catch {
      return { netWorthAtEnd: 0, retirementYear: null, deficitCount: 0, viability: 'critical' }
    }
  }, [scenario])
}

function ScenarioCard({ scenario, isActive, onSelect, onDuplicate, onDelete, onRename, canDelete }) {
  const summary = useScenarioSummary(scenario)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(scenario.name)
  const inputRef = useRef(null)

  useEffect(() => { setName(scenario.name) }, [scenario.name])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const badgeCls = {
    viable: 'badge-viable',
    'at-risk': 'badge-at-risk',
    critical: 'badge-critical',
  }[summary?.viability || 'critical']

  const badgeLabel = {
    viable: 'Viable',
    'at-risk': 'At Risk',
    critical: 'Not Viable',
  }[summary?.viability || 'critical']

  const commitRename = () => {
    setEditing(false)
    const trimmed = name.trim()
    if (trimmed && trimmed !== scenario.name) {
      onRename(scenario.id, trimmed)
    } else {
      setName(scenario.name)
    }
  }

  return (
    <button
      onClick={() => onSelect(scenario.id)}
      className={`flex-shrink-0 w-52 text-left rounded-xl p-4 border transition-all ${
        isActive
          ? 'bg-gray-800 border-brand-500 ring-1 ring-brand-500/30'
          : 'bg-gray-900 border-gray-800 hover:border-gray-700 hover:bg-gray-800/50'
      }`}
    >
      {/* Name + badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setName(scenario.name); setEditing(false) } }}
              onClick={e => e.stopPropagation()}
              className="input text-sm py-0.5 px-1.5 w-full"
            />
          ) : (
            <span
              className="text-sm font-semibold text-white truncate block cursor-text"
              onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
              title="Double-click to rename"
            >
              {scenario.name}
            </span>
          )}
        </div>
        <span className={`${badgeCls} text-[10px] px-2 py-0.5 whitespace-nowrap`}>{badgeLabel}</span>
      </div>

      {/* Stats */}
      <div className="space-y-1.5">
        {summary?.retirementYear && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Retire</span>
            <span className="text-xs font-medium text-gray-300">
              {summary.retirementYear}
              {summary.retirementAge && <span className="text-gray-500 ml-1">(age {summary.retirementAge})</span>}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">End net worth</span>
          <span className={`text-xs font-medium ${summary?.netWorthAtEnd < 0 ? 'text-red-400' : 'text-gray-300'}`}>
            {fmt$(summary?.netWorthAtEnd)}
          </span>
        </div>
        {summary?.deficitCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Deficit years</span>
            <span className="text-xs font-medium text-red-400">{summary.deficitCount}</span>
          </div>
        )}
      </div>

      {/* Actions — only show on active card */}
      {isActive && (
        <div className="flex items-center gap-1 mt-3 pt-2 border-t border-gray-700">
          <span
            onClick={e => { e.stopPropagation(); onDuplicate(scenario.id) }}
            className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer px-1.5 py-0.5 rounded hover:bg-gray-700 transition-colors"
          >
            Duplicate
          </span>
          {canDelete && (
            <span
              onClick={e => {
                e.stopPropagation()
                if (window.confirm(`Delete "${scenario.name}"?`)) onDelete(scenario.id)
              }}
              className="text-[10px] text-gray-500 hover:text-red-400 cursor-pointer px-1.5 py-0.5 rounded hover:bg-gray-700 transition-colors"
            >
              Delete
            </span>
          )}
        </div>
      )}
    </button>
  )
}

export default function ScenarioCards({ scenarios, activeId, setActiveId, addScenario, duplicateScenario, deleteScenario, renameScenario }) {
  return (
    <div className="flex items-stretch gap-3 overflow-x-auto pb-2 scrollbar-thin">
      {scenarios.map(s => (
        <ScenarioCard
          key={s.id}
          scenario={s}
          isActive={s.id === activeId}
          onSelect={setActiveId}
          onDuplicate={duplicateScenario}
          onDelete={deleteScenario}
          onRename={renameScenario}
          canDelete={scenarios.length > 1}
        />
      ))}

      {/* Add new scenario */}
      <button
        onClick={() => addScenario(`Scenario ${scenarios.length + 1}`)}
        className="flex-shrink-0 w-36 rounded-xl border-2 border-dashed border-gray-700 hover:border-gray-600 flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-gray-300 transition-colors"
      >
        <span className="text-2xl leading-none">+</span>
        <span className="text-xs font-medium">New Scenario</span>
      </button>
    </div>
  )
}
