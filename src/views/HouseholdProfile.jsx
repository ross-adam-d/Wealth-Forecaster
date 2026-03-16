import { useState } from 'react'

function PersonForm({ person, label, onUpdate }) {
  const p = person || {}

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-300">Person {label}</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Name</label>
          <input className="input w-full" value={p.name || ''} onChange={e => onUpdate({ name: e.target.value })} placeholder="e.g. Alex" />
        </div>
        <div>
          <label className="label">Date of birth</label>
          <input className="input w-full" type="date" value={p.dateOfBirth || ''} onChange={e => onUpdate({ dateOfBirth: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Current salary (gross)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <input className="input w-full pl-7" type="number" value={p.currentSalary || ''} onChange={e => onUpdate({ currentSalary: Number(e.target.value) })} placeholder="0" />
          </div>
        </div>
        <div>
          <label className="label">Target retirement age</label>
          <input className="input w-full" type="number" min={40} max={80} value={p.retirementAge || 60} onChange={e => onUpdate({ retirementAge: Number(e.target.value) })} />
        </div>
      </div>

      <div>
        <label className="label">Employer type</label>
        <select className="input w-full" value={p.employerType || 'standard'} onChange={e => onUpdate({ employerType: e.target.value })}>
          <option value="standard">Standard</option>
          <option value="pbi_nfp">PBI / Not-for-profit</option>
          <option value="qld_health">QLD Health / Hospital and Health Service</option>
        </select>
      </div>

      {p.employerType === 'pbi_nfp' && (
        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <div>
            <label className="label">PBI general packaging (max $15,900)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input className="input w-full pl-7" type="number" max={15900} value={p.packaging?.pbiGeneral || ''} onChange={e => onUpdate({ packaging: { ...p.packaging, pbiGeneral: Number(e.target.value) } })} />
            </div>
          </div>
          <div>
            <label className="label">Meal entertainment (max $2,650)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input className="input w-full pl-7" type="number" max={2650} value={p.packaging?.pbiMealEntertainment || ''} onChange={e => onUpdate({ packaging: { ...p.packaging, pbiMealEntertainment: Number(e.target.value) } })} />
            </div>
          </div>
        </div>
      )}

      {p.employerType === 'qld_health' && (
        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <div>
            <label className="label">QLD Health general cap (max $9,000)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input className="input w-full pl-7" type="number" max={9000} value={p.packaging?.qldHealthGeneral || ''} onChange={e => onUpdate({ packaging: { ...p.packaging, qldHealthGeneral: Number(e.target.value) } })} />
            </div>
          </div>
          <div>
            <label className="label">Meal entertainment (max $2,650)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input className="input w-full pl-7" type="number" max={2650} value={p.packaging?.qldHealthMealEntertainment || ''} onChange={e => onUpdate({ packaging: { ...p.packaging, qldHealthMealEntertainment: Number(e.target.value) } })} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function HouseholdProfile({ scenario, updateScenario }) {
  const { personA, personB } = scenario.household

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-white">Household Profile</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="card">
          <PersonForm
            person={personA}
            label="A"
            onUpdate={updates => updateScenario({ household: { ...scenario.household, personA: { ...personA, ...updates } } })}
          />
        </div>
        <div className="card">
          <PersonForm
            person={personB}
            label="B"
            onUpdate={updates => updateScenario({ household: { ...scenario.household, personB: { ...personB, ...updates } } })}
          />
        </div>
      </div>

      <p className="text-xs text-gray-600">
        Preservation age is auto-set to 60 for anyone born after 1 July 1964. This is not user-editable.
      </p>
    </div>
  )
}
