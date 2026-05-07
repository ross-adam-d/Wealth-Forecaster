import { useState, useMemo } from 'react'
import { Tutorial, useTutorial, TutorialButton } from '../components/Tutorial.jsx'
import {
  CONCESSIONAL_CAP,
  NON_CONCESSIONAL_CAP,
  PBI_GENERAL_CAP,
  PBI_MEAL_ENTERTAINMENT_CAP,
  QLD_HEALTH_GENERAL_CAP,
  QLD_HEALTH_MEAL_ENTERTAINMENT_CAP,
} from '../constants/index.js'
import { calcStatutory, calcECM } from '../modules/fbt.js'
import { calcStampDuty, calcLandTax } from '../modules/property.js'
import { DEFAULT_SELLING_COSTS_PCT } from '../constants/index.js'
import MonthYearInput from '../components/MonthYearInput.jsx'
import { extractYear } from '../utils/format.js'
import { currentAustralianFY } from '../utils/cgt.js'
import {
  createDefaultShareHolding,
  createDefaultSuperHolding,
  createDefaultTreasuryBondHolding,
  createDefaultCommodityHolding,
} from '../utils/schema.js'

// ── Shared primitives ─────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        className="w-full flex items-center justify-between py-3 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
        <span className="text-gray-600 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="pb-5">{children}</div>}
    </div>
  )
}

/** Parse a numeric input value — returns '' when field is empty (allows clearing) */
function numVal(raw) {
  if (raw === '' || raw == null) return ''
  const n = Number(raw)
  return isNaN(n) ? '' : n
}

function CurrencyInput({ label, value, onChange, hint, max, className = '' }) {
  const over = max != null && Number(value) > max
  return (
    <div className={className ? `w-full ${className}` : 'w-full max-w-56'}>
      <label className="compact-label">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
        <input
          className="compact-input w-full pl-6"
          type="number"
          step="1"
          value={value ?? ''}
          onChange={e => onChange(numVal(e.target.value))}
          onWheel={e => e.target.blur()}
          placeholder="0"
        />
      </div>
      {hint && !over && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      {over && <p className="text-xs text-amber-400 mt-0.5">Exceeds cap of ${max.toLocaleString()}</p>}
    </div>
  )
}

function PctInput({ label, value, onChange, min = 0, max = 100, step = 0.1, hint, className = '' }) {
  const displayVal = value != null && value !== '' ? (value * 100).toFixed(step < 1 ? 1 : 0) : ''
  const outOfRange = displayVal !== '' && (Number(displayVal) < min || Number(displayVal) > max)
  return (
    <div className={className ? `w-full ${className}` : 'w-full max-w-36'}>
      <label className="compact-label">{label}</label>
      <div className="relative">
        <input
          className="compact-input w-full pr-7"
          type="number"
          step={step}
          value={displayVal}
          onChange={e => {
            const v = numVal(e.target.value)
            onChange(v === '' ? '' : v / 100)
          }}
          onWheel={e => e.target.blur()}
          placeholder="0"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
      </div>
      {outOfRange && <p className="text-xs text-amber-400 mt-0.5">Must be between {min}% and {max}%</p>}
      {hint && !outOfRange && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
    </div>
  )
}

// ── Person form ───────────────────────────────────────────────────────────

function PersonForm({
  person,
  label,
  onUpdate,
  alignHecsSlot = false,
  alignSalaryChangesCount = 0,
}) {
  const p = person || {}
  const [leaseOpen, setLeaseOpen] = useState(false)
  const hasLease = !!p.packaging?.novatedLease
  const hasSalaryPeriodHint = !!(p.salaryPeriod && p.salaryPeriod !== 'annual' && p.currentSalary > 0)
  const employerType = p.employerType || 'standard'
  const hasEmployerPackagingFields = employerType === 'pbi_nfp' || employerType === 'qld_health'
  const showHecsSlot = alignHecsSlot || !!p.hecs

  const updateLease = patch =>
    onUpdate({ packaging: { ...p.packaging, novatedLease: { ...p.packaging.novatedLease, ...patch } } })

  const addLease = () => {
    onUpdate({
      packaging: {
        ...p.packaging,
        novatedLease: {
          vehicleCostPrice: 0,
          residualValue: 0,
          termYears: 5,
          interestRate: 0.07,
          annualKmTotal: 0,
          annualKmBusiness: 0,
          annualRunningCosts: 0,
          method: 'statutory',
          isEV: false,
          employeePostTaxContribution: 0,
          offsetWithECM: false,
          activeYears: { from: null, to: null },
        },
      },
    })
    setLeaseOpen(true) // auto-expand
  }

  const removeLease = () =>
    onUpdate({ packaging: { ...p.packaging, novatedLease: null } })

  // Calculate annual lease payment for display and FBT
  const leasePaymentCalc = useMemo(() => {
    if (!hasLease) return null
    const lease = p.packaging.novatedLease
    const cost = lease.vehicleCostPrice || 0
    const residual = lease.residualValue || 0
    const term = lease.termYears || 5
    const rate = lease.interestRate || 0
    const financed = Math.max(0, cost - residual)
    const totalInterest = financed * rate * term
    const totalCost = financed + totalInterest
    const annualPayment = term > 0 ? totalCost / term : 0
    return { financed, totalInterest, totalCost, annualPayment, residual, term }
  }, [hasLease, p.packaging?.novatedLease])

  // Compute FBT breakdown for display
  const fbtBreakdown = useMemo(() => {
    if (!hasLease || !leasePaymentCalc) return null
    const lease = p.packaging.novatedLease
    if (!lease.vehicleCostPrice) return null

    const params = {
      vehicleCostPrice: lease.vehicleCostPrice,
      annualRunningCosts: lease.annualRunningCosts || 0,
      annualLeasePayment: leasePaymentCalc.annualPayment,
      annualKmTotal: lease.annualKmTotal || 0,
      annualKmBusiness: lease.annualKmBusiness || 0,
      employeePostTaxContrib: lease.employeePostTaxContribution || 0,
      isEV: lease.isEV,
    }

    const result = lease.method === 'ecm' ? calcECM(params) : calcStatutory(params)

    // Calculate the post-tax contribution needed to eliminate FBT entirely
    const offsetContribution = lease.isEV ? 0 : (result.rawTaxableValue || 0)

    // If auto-offset is on, recalculate with the contribution applied
    if (lease.offsetWithECM && offsetContribution > 0) {
      const adjustedParams = { ...params, employeePostTaxContrib: offsetContribution }
      const adjusted = lease.method === 'ecm' ? calcECM(adjustedParams) : calcStatutory(adjustedParams)
      return { ...adjusted, offsetContribution }
    }

    return { ...result, offsetContribution }
  }, [hasLease, leasePaymentCalc, p.packaging?.novatedLease])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden person-card">
      <div className="px-4 py-3 border-b border-gray-800 person-card-header">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Person {label}</h3>
      </div>

      <div className="divide-y divide-gray-800/60 bg-gray-800/10">
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Name</span>
          <input
            className="compact-input w-full text-right"
            value={p.name || ''}
            onChange={e => onUpdate({ name: e.target.value })}
            placeholder="e.g. Alex"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Date of birth</span>
          <input
            className="compact-input w-full"
            type="date"
            value={p.dateOfBirth || ''}
            onChange={e => onUpdate({ dateOfBirth: e.target.value })}
          />
        </div>
        <div className="px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3">
            <span className="text-sm text-gray-400">Retire age</span>
            <input
              className="compact-input w-full text-right"
              type="number"
              step="1"
              value={p.retirementAge ?? ''}
              onChange={e => onUpdate({ retirementAge: numVal(e.target.value) })}
              onWheel={e => e.target.blur()}
              placeholder="60"
            />
          </div>
          {!p.retirementAge && <p className="text-xs text-amber-400 text-right mt-0.5">Required</p>}
        </div>
        <div className="px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3">
            <span className="text-sm text-gray-400">Gross salary</span>
            <div className="flex gap-1">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  className="compact-input w-full pl-7 text-right"
                  type="number"
                  step="1"
                  value={p.currentSalary ?? ''}
                  onChange={e => onUpdate({ currentSalary: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()}
                  placeholder="0"
                />
              </div>
              <select
                className="compact-input w-20 flex-shrink-0"
                value={p.salaryPeriod || 'annual'}
                onChange={e => onUpdate({ salaryPeriod: e.target.value })}
              >
                <option value="annual">Annual</option>
                <option value="monthly">Monthly</option>
                <option value="fortnightly">F/nightly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>
          {hasSalaryPeriodHint && (
            <p className="text-xs text-gray-500 text-right mt-0.5">
              = ${(p.salaryPeriod === 'weekly' ? p.currentSalary * 52
                : p.salaryPeriod === 'fortnightly' ? p.currentSalary * 26
                : p.currentSalary * 12).toLocaleString()}/yr
            </p>
          )}
        </div>
      </div>

      {/* Salary changes — part-time, career breaks, promotions */}
      <div className="border-t border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">Salary changes (part-time, career break, promotion)</span>
          <button
            className="btn-ghost text-xs py-1"
            onClick={() => {
              const changes = [...(p.salaryChanges || [])]
              changes.push({
                id: crypto.randomUUID(),
                fromYear: new Date().getFullYear() + 1,
                toYear: null,
                salary: 0,
                salaryPeriod: 'annual',
                note: '',
              })
              onUpdate({ salaryChanges: changes })
            }}
          >
            + Add change
          </button>
        </div>
        {(p.salaryChanges || []).map((change, ci) => (
          <div key={change.id || ci} className="border border-gray-700 rounded-lg overflow-hidden mb-2 bg-gray-800/10">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/60">
              <input
                className="compact-input flex-1 text-xs"
                value={change.note || ''}
                onChange={e => {
                  const changes = [...(p.salaryChanges || [])]
                  changes[ci] = { ...changes[ci], note: e.target.value }
                  onUpdate({ salaryChanges: changes })
                }}
                placeholder="Note (e.g. Part-time 3 days, Career break)"
              />
              <button
                className="text-red-400 hover:text-red-300 text-xs flex-shrink-0"
                onClick={() => {
                  const changes = (p.salaryChanges || []).filter((_, i) => i !== ci)
                  onUpdate({ salaryChanges: changes })
                }}
              >Remove</button>
            </div>
            <div className="divide-y divide-gray-700/40">
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">From year</span>
                <input
                  className="compact-input w-full text-right text-sm"
                  type="number" step="1"
                  value={change.fromYear ?? ''}
                  onChange={e => {
                    const changes = [...(p.salaryChanges || [])]
                    changes[ci] = { ...changes[ci], fromYear: numVal(e.target.value) }
                    onUpdate({ salaryChanges: changes })
                  }}
                  onWheel={e => e.target.blur()}
                  placeholder="Year"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">To year</span>
                <input
                  className="compact-input w-full text-right text-sm"
                  type="number" step="1"
                  value={change.toYear ?? ''}
                  onChange={e => {
                    const changes = [...(p.salaryChanges || [])]
                    changes[ci] = { ...changes[ci], toYear: numVal(e.target.value) || null }
                    onUpdate({ salaryChanges: changes })
                  }}
                  onWheel={e => e.target.blur()}
                  placeholder="Ongoing"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">Salary</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500 shrink-0">$</span>
                  <input
                    className="compact-input flex-1 text-right text-sm"
                    type="number" step="1"
                    value={change.salary ?? ''}
                    onChange={e => {
                      const changes = [...(p.salaryChanges || [])]
                      changes[ci] = { ...changes[ci], salary: numVal(e.target.value) }
                      onUpdate({ salaryChanges: changes })
                    }}
                    onWheel={e => e.target.blur()}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">Period</span>
                <select
                  className="compact-input w-full text-sm"
                  value={change.salaryPeriod || 'annual'}
                  onChange={e => {
                    const changes = [...(p.salaryChanges || [])]
                    changes[ci] = { ...changes[ci], salaryPeriod: e.target.value }
                    onUpdate({ salaryChanges: changes })
                  }}
                >
                  <option value="annual">Annual</option>
                  <option value="monthly">Monthly</option>
                  <option value="fortnightly">F/nightly</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500 px-3 py-2 border-t border-gray-700/40">Today's dollars — grows with wages</p>
          </div>
        ))}
        {Array.from({ length: Math.max(0, alignSalaryChangesCount - (p.salaryChanges || []).length) }).map((_, i) => (
          <div key={`sc-ph-${i}`} className="border border-gray-700 rounded-lg overflow-hidden mb-2 bg-gray-800/10 opacity-0 pointer-events-none" aria-hidden="true">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/60">
              <input type="text" readOnly tabIndex={-1} className="compact-input flex-1 text-xs" />
            </div>
            <div className="divide-y divide-gray-700/40">
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs">&nbsp;</span>
                <input type="text" readOnly tabIndex={-1} className="compact-input w-full text-right text-sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs">&nbsp;</span>
                <input type="text" readOnly tabIndex={-1} className="compact-input w-full text-right text-sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs">&nbsp;</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500 shrink-0">$</span>
                  <input type="text" readOnly tabIndex={-1} className="compact-input flex-1 text-right text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs">&nbsp;</span>
                <input type="text" readOnly tabIndex={-1} className="compact-input w-full text-sm" />
              </div>
            </div>
            <p className="text-xs px-3 py-2 border-t border-gray-700/40">&nbsp;</p>
          </div>
        ))}
      </div>

      {/* HECS/HELP debt */}
      <div className="border-t border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-400">HECS / HELP debt</span>
          {!p.hecs ? (
            <button
              className="btn-ghost text-xs py-1"
              onClick={() => onUpdate({ hecs: { balance: 0, extraAnnual: 0 } })}
            >+ Add HECS debt</button>
          ) : (
            <button
              className="btn-ghost text-xs py-1 text-red-400 hover:text-red-300"
              onClick={() => onUpdate({ hecs: null })}
            >Remove</button>
          )}
        </div>
        {p.hecs && (
          <div className="divide-y divide-gray-700/40 border border-gray-700 rounded-lg overflow-hidden bg-gray-800/10">
            <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-3 py-2">
              <span className="text-xs text-gray-400">Current HECS balance</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 shrink-0">$</span>
                <input
                  className="compact-input flex-1 text-right text-sm"
                  type="number" step="1"
                  value={p.hecs.balance ?? ''}
                  onChange={e => onUpdate({ hecs: { ...p.hecs, balance: numVal(e.target.value) || 0 } })}
                  onWheel={e => e.target.blur()}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-3 py-2">
              <span className="text-xs text-gray-400">Extra annual repayment</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 shrink-0">$</span>
                <input
                  className="compact-input flex-1 text-right text-sm"
                  type="number" step="1"
                  value={p.hecs.extraAnnual ?? ''}
                  onChange={e => onUpdate({ hecs: { ...p.hecs, extraAnnual: numVal(e.target.value) || 0 } })}
                  onWheel={e => e.target.blur()}
                  placeholder="0"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 px-3 py-2">$0 extra = compulsory minimum only</p>
          </div>
        )}
        {showHecsSlot && !p.hecs && (
          <div className="divide-y divide-gray-700/40 border border-gray-700 rounded-lg overflow-hidden bg-gray-800/10 opacity-0 pointer-events-none" aria-hidden="true">
            <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-3 py-2">
              <span className="text-xs">&nbsp;</span>
              <input type="text" readOnly tabIndex={-1} className="compact-input w-full text-sm" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-3 py-2">
              <span className="text-xs">&nbsp;</span>
              <input type="text" readOnly tabIndex={-1} className="compact-input w-full text-sm" />
            </div>
            <p className="text-xs px-3 py-2">&nbsp;</p>
          </div>
        )}
      </div>

      <div className="border-t border-gray-800 divide-y divide-gray-800/60 bg-gray-800/10">
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Employer type</span>
          <select
            className="compact-input w-full"
            value={employerType}
            onChange={e => onUpdate({ employerType: e.target.value })}
          >
            <option value="standard">Standard</option>
            <option value="pbi_nfp">PBI / Not-for-profit</option>
            <option value="qld_health">QLD Health / Hospital and Health Service</option>
          </select>
        </div>

      {hasEmployerPackagingFields && (
        <>
          {employerType === 'pbi_nfp' ? (
              <>
                <div className="px-4 py-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3">
                    <span className="text-sm text-gray-400">PBI general packaging <span className="text-xs text-gray-600 ml-1">max ${PBI_GENERAL_CAP.toLocaleString()}</span></span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 shrink-0">$</span>
                      <input
                        className="compact-input flex-1 text-right text-sm"
                        type="number" step="1"
                        value={p.packaging?.pbiGeneral ?? ''}
                        onChange={e => onUpdate({ packaging: { ...p.packaging, pbiGeneral: numVal(e.target.value) } })}
                        onWheel={e => e.target.blur()}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {(p.packaging?.pbiGeneral || 0) > PBI_GENERAL_CAP && <p className="text-xs text-amber-400 text-right mt-0.5">Exceeds cap of ${PBI_GENERAL_CAP.toLocaleString()}</p>}
                </div>
                <div className="px-4 py-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3">
                    <span className="text-sm text-gray-400">Meal entertainment <span className="text-xs text-gray-600 ml-1">max ${PBI_MEAL_ENTERTAINMENT_CAP.toLocaleString()}</span></span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 shrink-0">$</span>
                      <input
                        className="compact-input flex-1 text-right text-sm"
                        type="number" step="1"
                        value={p.packaging?.pbiMealEntertainment ?? ''}
                        onChange={e => onUpdate({ packaging: { ...p.packaging, pbiMealEntertainment: numVal(e.target.value) } })}
                        onWheel={e => e.target.blur()}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {(p.packaging?.pbiMealEntertainment || 0) > PBI_MEAL_ENTERTAINMENT_CAP && <p className="text-xs text-amber-400 text-right mt-0.5">Exceeds cap of ${PBI_MEAL_ENTERTAINMENT_CAP.toLocaleString()}</p>}
                </div>
              </>
            ) : (
              <>
                <div className="px-4 py-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3">
                    <span className="text-sm text-gray-400">QLD Health general cap <span className="text-xs text-gray-600 ml-1">max ${QLD_HEALTH_GENERAL_CAP.toLocaleString()}</span></span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 shrink-0">$</span>
                      <input
                        className="compact-input flex-1 text-right text-sm"
                        type="number" step="1"
                        value={p.packaging?.qldHealthGeneral ?? ''}
                        onChange={e => onUpdate({ packaging: { ...p.packaging, qldHealthGeneral: numVal(e.target.value) } })}
                        onWheel={e => e.target.blur()}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {(p.packaging?.qldHealthGeneral || 0) > QLD_HEALTH_GENERAL_CAP && <p className="text-xs text-amber-400 text-right mt-0.5">Exceeds cap of ${QLD_HEALTH_GENERAL_CAP.toLocaleString()}</p>}
                </div>
                <div className="px-4 py-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3">
                    <span className="text-sm text-gray-400">Meal entertainment <span className="text-xs text-gray-600 ml-1">max ${QLD_HEALTH_MEAL_ENTERTAINMENT_CAP.toLocaleString()}</span></span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 shrink-0">$</span>
                      <input
                        className="compact-input flex-1 text-right text-sm"
                        type="number" step="1"
                        value={p.packaging?.qldHealthMealEntertainment ?? ''}
                        onChange={e => onUpdate({ packaging: { ...p.packaging, qldHealthMealEntertainment: numVal(e.target.value) } })}
                        onWheel={e => e.target.blur()}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {(p.packaging?.qldHealthMealEntertainment || 0) > QLD_HEALTH_MEAL_ENTERTAINMENT_CAP && <p className="text-xs text-amber-400 text-right mt-0.5">Exceeds cap of ${QLD_HEALTH_MEAL_ENTERTAINMENT_CAP.toLocaleString()}</p>}
                </div>
              </>
            )}
          </>
        )}

      {/* Novated lease */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex-1 text-sm text-gray-400">Novated lease</span>
          {hasLease ? (
            <div className="flex gap-2 shrink-0">
              <button className="btn-ghost text-xs py-1" onClick={() => setLeaseOpen(o => !o)}>
                {leaseOpen ? '▾ Hide' : '▸ Edit'}
              </button>
              <button
                className="btn-ghost text-xs py-1 text-red-400 hover:text-red-300"
                onClick={removeLease}
              >
                Remove
              </button>
            </div>
          ) : (
            <button className="btn-ghost text-xs py-1 shrink-0" onClick={addLease}>
              + Add lease
            </button>
          )}
        </div>

        {hasLease && leaseOpen && (
          <div className="mt-3 border border-gray-700 rounded-lg overflow-hidden bg-gray-800/10">
            <div className="divide-y divide-gray-700/40">
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">Vehicle cost price</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500 shrink-0">$</span>
                  <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                    value={p.packaging.novatedLease.vehicleCostPrice ?? ''}
                    onChange={e => updateLease({ vehicleCostPrice: numVal(e.target.value) })}
                    onWheel={e => e.target.blur()} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">Residual / balloon</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500 shrink-0">$</span>
                  <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                    value={p.packaging.novatedLease.residualValue ?? ''}
                    onChange={e => updateLease({ residualValue: numVal(e.target.value) })}
                    onWheel={e => e.target.blur()} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">Annual running costs</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500 shrink-0">$</span>
                  <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                    value={p.packaging.novatedLease.annualRunningCosts ?? ''}
                    onChange={e => updateLease({ annualRunningCosts: numVal(e.target.value) })}
                    onWheel={e => e.target.blur()} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">Interest rate</span>
                <div className="flex items-center gap-1">
                  <input className="compact-input flex-1 text-right text-sm" type="number" step="0.1"
                    value={p.packaging.novatedLease.interestRate != null ? (p.packaging.novatedLease.interestRate * 100).toFixed(1) : ''}
                    onChange={e => { const v = numVal(e.target.value); updateLease({ interestRate: v === '' ? '' : v / 100 }) }}
                    onWheel={e => e.target.blur()} placeholder="0" />
                  <span className="text-xs text-gray-500 shrink-0">%</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">Term (years)</span>
                <input className="compact-input w-full text-right text-sm" type="number" step="1"
                  value={p.packaging.novatedLease.termYears || ''}
                  onChange={e => updateLease({ termYears: numVal(e.target.value) || null })}
                  onWheel={e => e.target.blur()} placeholder="5" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">Total km / year</span>
                <input className="compact-input w-full text-right text-sm" type="number" step="1"
                  value={p.packaging.novatedLease.annualKmTotal || ''}
                  onChange={e => updateLease({ annualKmTotal: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()} placeholder="0" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">Business km / year</span>
                <input className="compact-input w-full text-right text-sm" type="number" step="1"
                  value={p.packaging.novatedLease.annualKmBusiness || ''}
                  onChange={e => updateLease({ annualKmBusiness: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()} placeholder="0" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">Lease start</span>
                <input className="compact-input w-full" type="month"
                  value={p.packaging.novatedLease.activeYears?.from || ''}
                  onChange={e => updateLease({ activeYears: { ...p.packaging.novatedLease.activeYears, from: e.target.value || null } })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                <span className="text-xs text-gray-400">Lease end</span>
                <input className="compact-input w-full" type="month"
                  value={p.packaging.novatedLease.activeYears?.to || ''}
                  onChange={e => updateLease({ activeYears: { ...p.packaging.novatedLease.activeYears, to: e.target.value || null } })} />
              </div>
            </div>

            {leasePaymentCalc && leasePaymentCalc.annualPayment > 0 && (
              <div className="border-t border-gray-700/60 px-3 py-2 bg-gray-800/30 text-xs text-gray-400 space-y-0.5">
                <div className="text-gray-300 font-medium">Lease payment: ${Math.round(leasePaymentCalc.annualPayment).toLocaleString()}/yr</div>
                <div>Financed: ${Math.round(leasePaymentCalc.financed).toLocaleString()} · Interest: ${Math.round(leasePaymentCalc.totalInterest).toLocaleString()}</div>
                {(p.packaging.novatedLease.residualValue || 0) > 0 && (
                  <div className="text-amber-400">Balloon of ${Math.round(p.packaging.novatedLease.residualValue).toLocaleString()} due at end of term</div>
                )}
              </div>
            )}

            <div className="border-t border-gray-700/60 px-3 py-2 space-y-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" id={`ev-${label}`}
                  checked={!!p.packaging.novatedLease.isEV}
                  onChange={e => updateLease({ isEV: e.target.checked })} />
                <label htmlFor={`ev-${label}`} className="text-xs text-gray-400">Electric / zero-emission vehicle (FBT exempt)</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id={`ecm-offset-${label}`}
                  checked={!!p.packaging.novatedLease.offsetWithECM}
                  onChange={e => {
                    const offset = e.target.checked
                    const contrib = offset && fbtBreakdown ? fbtBreakdown.offsetContribution : 0
                    updateLease({ offsetWithECM: offset, employeePostTaxContribution: contrib })
                  }} />
                <label htmlFor={`ecm-offset-${label}`} className="text-xs text-gray-400">Offset FBT with employee post-tax contribution (auto-calculated)</label>
              </div>
            </div>

            {!p.packaging.novatedLease.offsetWithECM && (
              <div className="border-t border-gray-700/60 divide-y divide-gray-700/40">
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                  <span className="text-xs text-gray-400">FBT method</span>
                  <select className="compact-input w-full text-sm"
                    value={p.packaging.novatedLease.method}
                    onChange={e => updateLease({ method: e.target.value })}>
                    <option value="statutory">Statutory (20% flat)</option>
                    <option value="ecm">Operating cost / ECM</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-2 px-3 py-2">
                  <span className="text-xs text-gray-400">Employee post-tax contribution</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 shrink-0">$</span>
                    <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                      value={p.packaging.novatedLease.employeePostTaxContribution ?? ''}
                      onChange={e => updateLease({ employeePostTaxContribution: numVal(e.target.value) })}
                      onWheel={e => e.target.blur()} placeholder="0" />
                  </div>
                </div>
              </div>
            )}

            {fbtBreakdown && (
              <div className="border-t border-gray-700/60 px-3 py-2 bg-gray-800/30 text-xs text-gray-400 space-y-0.5">
                <div className="text-gray-300 font-medium mb-0.5">FBT ({fbtBreakdown.method === 'ev_exempt' ? 'EV exempt' : fbtBreakdown.method === 'ecm' ? 'ECM' : 'Statutory'})</div>
                <div>Taxable value: ${Math.round(fbtBreakdown.taxableValue).toLocaleString()} · FBT liability: ${Math.round(fbtBreakdown.fbtLiability).toLocaleString()}</div>
                <div className="text-gray-300">Pre-tax reduction: ${Math.round(fbtBreakdown.pretaxPackageReduction).toLocaleString()}/yr · Tax saving: ${Math.round(fbtBreakdown.incomeTaxSaving).toLocaleString()}</div>
                {p.packaging.novatedLease.offsetWithECM && (
                  <div className="text-sky-400">FBT offset: contributing ${Math.round(fbtBreakdown.offsetContribution || 0).toLocaleString()}/yr post-tax</div>
                )}
                <div className="text-green-400 font-medium">Net annual benefit: ${Math.round(fbtBreakdown.netAnnualBenefit).toLocaleString()}/yr</div>
                {fbtBreakdown.warnings?.map((w, i) => (
                  <div key={i} className="text-amber-400">{w}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

// ── Super form ────────────────────────────────────────────────────────────

function SuperForm({ superProfile, personLabel, grossSalary, onUpdate, alignEmployerPctSlot = false }) {
  const s = superProfile || {}
  // Use FY2026 SG rate (12%) for the estimate shown to user
  const sgEstimate = (grossSalary || 0) * 0.12
  const totalConcessional =
    sgEstimate + (s.salarySacrificeAmount || 0) + (s.voluntaryConcessional || 0)
  const concessionalBreached = totalConcessional > CONCESSIONAL_CAP
  const nccBreached = (s.voluntaryNonConcessional || 0) > NON_CONCESSIONAL_CAP
  const employerScheme = s.employerScheme || 'sg'
  const hasEmployerPctInput = employerScheme === 'match' || employerScheme === 'fixed_pct'
  const showEmployerPctSlot = alignEmployerPctSlot || hasEmployerPctInput

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Person {personLabel}</h3>

      <div className="border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-700/30 bg-gray-800/10">
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Current balance</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 shrink-0">$</span>
            <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
              value={s.currentBalance ?? ''} onChange={e => onUpdate({ currentBalance: numVal(e.target.value) })}
              onWheel={e => e.target.blur()} placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Employer scheme</span>
          <div className="flex items-center gap-2">
            <select className="compact-input flex-1" value={employerScheme}
              onChange={e => onUpdate({ employerScheme: e.target.value })}>
              <option value="sg">Standard SG</option>
              <option value="match">Employer match</option>
              <option value="fixed_pct">Fixed employer %</option>
            </select>
            {showEmployerPctSlot && (
              hasEmployerPctInput ? (
                <div className="flex items-center gap-1 shrink-0">
                  <input className="compact-input w-14 text-right text-sm" type="number" step="0.1"
                    value={(() => {
                      const v = employerScheme === 'match' ? s.employerMatchCapPct : s.employerFixedPct
                      return v != null && v !== '' ? (v * 100).toFixed(1) : ''
                    })()}
                    onChange={e => {
                      const v = numVal(e.target.value)
                      onUpdate(employerScheme === 'match' ? { employerMatchCapPct: v === '' ? '' : v / 100 } : { employerFixedPct: v === '' ? '' : v / 100 })
                    }}
                    onWheel={e => e.target.blur()} placeholder="0" />
                  <span className="text-xs text-gray-500 shrink-0">%</span>
                </div>
              ) : (
                <input type="text" readOnly tabIndex={-1} className="compact-input w-20 opacity-0 pointer-events-none" />
              )
            )}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="compact-label">Salary sacrifice</label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-gray-500 shrink-0">$</span>
                <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                  value={s.salarySacrificeAmount ?? ''} onChange={e => onUpdate({ salarySacrificeAmount: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()} placeholder="0" />
              </div>
              <p className="text-xs text-gray-500 mt-0.5 text-right">SG est. ${Math.round(sgEstimate).toLocaleString()} · Cap ${CONCESSIONAL_CAP.toLocaleString()}</p>
              {concessionalBreached && (
                <p className="text-xs text-amber-400 mt-0.5 text-right">Cap exceeded — ${Math.round(totalConcessional).toLocaleString()} vs ${CONCESSIONAL_CAP.toLocaleString()}</p>
              )}
            </div>
            <div>
              <label className="compact-label">Extra concessional</label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-gray-500 shrink-0">$</span>
                <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                  value={s.voluntaryConcessional ?? ''} onChange={e => onUpdate({ voluntaryConcessional: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()} placeholder="0" />
              </div>
            </div>
            <div>
              <label className="compact-label">Non-concessional</label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-gray-500 shrink-0">$</span>
                <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                  value={s.voluntaryNonConcessional ?? ''} onChange={e => onUpdate({ voluntaryNonConcessional: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()} placeholder="0" />
              </div>
              <p className="text-xs text-gray-500 mt-0.5 text-right">Cap ${NON_CONCESSIONAL_CAP.toLocaleString()}</p>
              {nccBreached && <p className="text-xs text-amber-400 mt-0.5 text-right">Exceeds annual cap</p>}
            </div>
          </div>
        </div>
        <div className="flex items-center h-10 gap-2 px-4">
          <input type="checkbox" id={`ttr-${personLabel}`} className="shrink-0"
            checked={!!s.isTTR} onChange={e => onUpdate({ isTTR: e.target.checked })} />
          <label htmlFor={`ttr-${personLabel}`} className="text-sm leading-5 text-gray-400">
            Transition to Retirement (TTR) income stream active
          </label>
        </div>
      </div>

      <div className="border-t border-gray-800 pt-3">
        <HoldingsSubForm
          holdings={s.holdings}
          fields={['pensionReturnRate']}
          createDefault={createDefaultSuperHolding}
          label="fund allocation"
          onUpdate={holdings => onUpdate({ holdings })}
        />
      </div>
    </div>
  )
}

// ── Property form ─────────────────────────────────────────────────────────

function PropertyForm({ property, index, allProperties, onUpdate, onRemove }) {
  const p = property || {}
  const [open, setOpen] = useState(false)
  const title = p.isPrimaryResidence ? 'Primary Residence' : `Investment Property ${index}`

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/40 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-sm font-medium text-gray-300">{title}</span>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs">{open ? '▾' : '▸'}</span>
          <button
            className="text-xs text-red-400 hover:text-red-300"
            onClick={e => { e.stopPropagation(); onRemove() }}
          >
            Remove
          </button>
        </div>
      </button>

      {open && (
        <div className="divide-y divide-gray-700/30 bg-gray-800/10">
          <div className="flex items-center h-10 gap-2 px-4">
            <input type="checkbox" id={`primary-${index}`} className="shrink-0"
              checked={!!p.isPrimaryResidence} onChange={e => onUpdate({ isPrimaryResidence: e.target.checked })} />
            <label htmlFor={`primary-${index}`} className="text-sm leading-5 text-gray-400">
              Primary residence (CGT-exempt, excluded from assets test)
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
            <span className="text-sm text-gray-400">State</span>
            <select className="compact-input w-full" value={p.state || ''}
              onChange={e => onUpdate({ state: e.target.value || null })}>
              <option value="">—</option>
              <option value="NSW">NSW</option>
              <option value="VIC">VIC</option>
              <option value="QLD">QLD</option>
              <option value="SA">SA</option>
              <option value="WA">WA</option>
              <option value="TAS">TAS</option>
              <option value="NT">NT</option>
              <option value="ACT">ACT</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
            <span className="text-sm text-gray-400">Current value</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 shrink-0">$</span>
              <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                value={p.currentValue ?? ''} onChange={e => onUpdate({ currentValue: numVal(e.target.value) })}
                onWheel={e => e.target.blur()} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
            <span className="text-sm text-gray-400">Purchase price</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 shrink-0">$</span>
              <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                value={p.purchasePrice ?? ''} onChange={e => onUpdate({ purchasePrice: numVal(e.target.value) })}
                onWheel={e => e.target.blur()} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
            <span className="text-sm text-gray-400">Annual growth rate</span>
            <div className="flex items-center gap-1">
              <input className="compact-input flex-1 text-right text-sm" type="number" step="0.1"
                value={p.growthRate != null && p.growthRate !== '' ? (p.growthRate * 100).toFixed(1) : '4.0'}
                onChange={e => { const v = numVal(e.target.value); onUpdate({ growthRate: v === '' ? '' : v / 100 }) }}
                onWheel={e => e.target.blur()} placeholder="4.0" />
              <span className="text-xs text-gray-500 shrink-0">%</span>
            </div>
          </div>
          {p.isPrimaryResidence && (
            <div className="flex items-center h-10 gap-2 px-4">
              <input type="checkbox" className="accent-brand-500 shrink-0" checked={!!p.isFirstHomeBuyer}
                onChange={e => onUpdate({ isFirstHomeBuyer: e.target.checked })} />
              <label className="text-sm leading-5 text-gray-400">First home buyer</label>
            </div>
          )}
          {p.state && p.purchasePrice > 0 && (() => {
            const duty = calcStampDuty(p.purchasePrice, p.state, !!p.isFirstHomeBuyer, !!p.isPrimaryResidence)
            const landTaxAmt = !p.isPrimaryResidence ? calcLandTax(p.currentValue || p.purchasePrice, p.state) : 0
            return (
              <div className="px-4 py-2 flex flex-wrap gap-4 text-xs">
                <span className="text-gray-400">
                  Stamp duty: <span className="text-white font-medium">${duty.toLocaleString()}</span>
                  {p.isFirstHomeBuyer && p.isPrimaryResidence && duty === 0 && <span className="text-green-400 ml-1">(FHB exempt)</span>}
                </span>
                {landTaxAmt > 0 && (
                  <span className="text-gray-400">
                    Land tax: <span className="text-white font-medium">${landTaxAmt.toLocaleString()}/yr</span>
                  </span>
                )}
              </div>
            )
          })()}
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
            <span className="text-sm text-gray-400">Purchase date</span>
            <input className="compact-input w-full" type="date" value={p.purchaseDate || ''}
              onChange={e => onUpdate({ purchaseDate: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
            <span className="text-sm text-gray-400">Purchase method</span>
            <select className="compact-input w-full" value={p.purchasedCash ? 'cash' : 'mortgage'}
              onChange={e => {
                const isCash = e.target.value === 'cash'
                onUpdate({
                  purchasedCash: isCash,
                  ...(isCash ? { mortgageBalance: 0, loanTermYearsRemaining: 0, interestRate: 0, offsetBalance: 0 } : {}),
                })
              }}>
              <option value="mortgage">Mortgage</option>
              <option value="cash">Purchased with cash</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
            <span className="text-sm text-gray-400">Future purchase date</span>
            <div className="flex justify-end">
              <MonthYearInput value={p.futurePurchaseYear} onChange={v => onUpdate({ futurePurchaseYear: v })} placeholder="Year" yearClassName="text-right" />
            </div>
          </div>

          {!p.purchasedCash && (
            <div className="px-4 py-3 space-y-3">
              <div className="border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-700/30 bg-gray-800/10">
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                  <span className="text-sm text-gray-400">Outstanding mortgage</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 shrink-0">$</span>
                    <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                      value={p.mortgageBalance ?? ''}
                      onChange={e => {
                        const v = numVal(e.target.value)
                        const patch = { mortgageBalance: v }
                        if (!p.originalLoanAmount && v > 0) patch.originalLoanAmount = v
                        onUpdate(patch)
                      }}
                      onWheel={e => e.target.blur()} placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                  <span className="text-sm text-gray-400">Interest rate</span>
                  <div className="flex items-center gap-1">
                    <input className="compact-input flex-1 text-right text-sm" type="number" step="0.05"
                      value={p.interestRate != null && p.interestRate !== '' ? (p.interestRate * 100).toFixed(2) : ''}
                      onChange={e => { const v = numVal(e.target.value); onUpdate({ interestRate: v === '' ? '' : v / 100 }) }}
                      onWheel={e => e.target.blur()} placeholder="0" />
                    <span className="text-xs text-gray-500 shrink-0">%</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                  <span className="text-sm text-gray-400">Years remaining</span>
                  <input className="compact-input w-full text-right" type="number" step="1"
                    value={p.loanTermYearsRemaining || ''}
                    onChange={e => {
                      const yrs = numVal(e.target.value)
                      const patch = { loanTermYearsRemaining: yrs }
                      if (!p.originalLoanTermYears && yrs > 0) patch.originalLoanTermYears = yrs
                      onUpdate(patch)
                    }}
                    onWheel={e => e.target.blur()} placeholder="0" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                  <span className="text-sm text-gray-400">Loan type</span>
                  <select className="compact-input w-full"
                    value={p.loanType || 'pi'} onChange={e => onUpdate({ loanType: e.target.value })}>
                    <option value="pi">Principal & Interest</option>
                    <option value="io">Interest Only</option>
                  </select>
                </div>
              </div>

              {p.loanType === 'io' && (
                <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800/10">
                  <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                    <span className="text-sm text-gray-400">IO period ends (year)</span>
                    <input className="compact-input w-full text-right" type="number" step="1"
                      value={p.ioEndYear || ''} onChange={e => onUpdate({ ioEndYear: numVal(e.target.value) })}
                      onWheel={e => e.target.blur()} placeholder="2028" />
                  </div>
                  <p className="text-xs text-amber-400 px-4 pb-2">Repayments step up to P&I at IO expiry</p>
                </div>
              )}

              <div className="flex items-center h-10 gap-2">
                <input type="checkbox" className="accent-brand-500 shrink-0"
                  checked={p.hasOffset || false} onChange={e => onUpdate({ hasOffset: e.target.checked })} />
                <span className="text-sm text-gray-300">Mortgage offset account</span>
              </div>
              {p.hasOffset && (
                <p className="text-xs text-gray-500">
                  Your cash / savings balance (entered above) will offset this mortgage, reducing the interest charged each year.
                </p>
              )}

              {p.mortgageBalance > 0 && (
                <div className="flex items-center h-10 gap-2">
                  <input type="checkbox" className="accent-brand-500 shrink-0"
                    checked={p.payOffWhenAble || false} onChange={e => onUpdate({ payOffWhenAble: e.target.checked })} />
                  <span className="text-sm text-gray-300">Pay off mortgage when liquid assets can cover it</span>
                </div>
              )}
            </div>
          )}

          {!p.isPrimaryResidence && (
            <div className="px-4 py-3">
              <div className="border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-700/30 bg-gray-800/10">
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                  <span className="text-sm text-gray-400">Annual rental income</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 shrink-0">$</span>
                    <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                      value={p.annualRentalIncome ?? ''} onChange={e => onUpdate({ annualRentalIncome: numVal(e.target.value) })}
                      onWheel={e => e.target.blur()} placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                  <span className="text-sm text-gray-400">Annual property expenses</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 shrink-0">$</span>
                    <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                      value={p.annualPropertyExpenses ?? ''} onChange={e => onUpdate({ annualPropertyExpenses: numVal(e.target.value) })}
                      onWheel={e => e.target.blur()} placeholder="0" />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="px-4 py-3">
            <label className="compact-label">CGT ownership — Person A</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="range" min={0} max={100} step={5}
                value={p.ownershipPctA ?? 100}
                onChange={e => onUpdate({ ownershipPctA: numVal(e.target.value) })}
                className="flex-1 accent-brand-500" />
              <span className="text-sm font-medium text-white w-12 text-right">
                {p.ownershipPctA ?? 100}% / {100 - (p.ownershipPctA ?? 100)}%
              </span>
            </div>
            <p className="text-xs text-gray-600 mt-1">How CGT is split between A and B on sale</p>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-gray-400">Sale event</span>
            {!p.saleEvent ? (
              <button className="btn-ghost text-xs py-1"
                onClick={() => onUpdate({ saleEvent: { year: new Date().getFullYear() + 10, destination: 'shares' } })}>
                + Add sale
              </button>
            ) : (
              <button className="btn-ghost text-xs py-1 text-red-400 hover:text-red-300"
                onClick={() => onUpdate({ saleEvent: null })}>
                Remove
              </button>
            )}
          </div>
            {p.saleEvent && (
              <div className="px-4 pb-4">
              <div className="border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-700/30 bg-gray-800/10">
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                  <span className="text-sm text-gray-400">Sale date</span>
                  <div className="flex justify-end">
                    <MonthYearInput
                      value={p.saleEvent.year}
                      onChange={v => onUpdate({ saleEvent: { ...p.saleEvent, year: v } })}
                      placeholder="Year"
                      nullable={false}
                      yearClassName="text-right"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                  <span className="text-sm text-gray-400">Route proceeds to</span>
                  <select className="compact-input w-full"
                    value={p.saleEvent.destination || 'cash'}
                    onChange={e => onUpdate({ saleEvent: { ...p.saleEvent, destination: e.target.value } })}>
                    <option value="cash">Cash buffer</option>
                    <option value="shares">Share portfolio</option>
                    <option value="super">Super (downsizer)</option>
                    {allProperties.filter((op, oi) => oi !== index - 1 && !op.purchasedCash && op.mortgageBalance > 0).length > 0 && (
                      <optgroup label="Mortgage offset">
                        {allProperties.map((op, oi) => {
                          if (oi === index - 1 || op.purchasedCash || !op.mortgageBalance) return null
                          const name = op.isPrimaryResidence ? 'Home' : (op.name || `Property ${oi + 1}`)
                          return <option key={oi} value={`offset:${oi}`}>{name} offset</option>
                        })}
                      </optgroup>
                    )}
                    <option value="treasuryBonds">Treasury / Corporate Bonds</option>
                    <option value="commodities">Commodities</option>
                    <option value="bonds">Tax-Deferred Bonds</option>
                    <option value="otherAssets">Other Assets</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                  <span className="text-sm text-gray-400">Selling costs</span>
                  <div className="flex items-center gap-1">
                    <input className="compact-input flex-1 text-right text-sm" type="number" step="0.1"
                      value={(p.saleEvent.sellingCostsPct ?? DEFAULT_SELLING_COSTS_PCT) !== '' ? ((p.saleEvent.sellingCostsPct ?? DEFAULT_SELLING_COSTS_PCT) * 100).toFixed(1) : ''}
                      onChange={e => { const v = numVal(e.target.value); onUpdate({ saleEvent: { ...p.saleEvent, sellingCostsPct: v === '' ? '' : v / 100 } }) }}
                      onWheel={e => e.target.blur()} placeholder="0" />
                    <span className="text-xs text-gray-500 shrink-0">%</span>
                  </div>
                </div>
                {(() => {
                  const { fyEndYear } = currentAustralianFY()
                  const saleYearVal = extractYear(p.saleEvent.year)
                  if (!saleYearVal || saleYearVal > fyEndYear) return null
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                      <span className="text-sm text-gray-400">Actual sale price</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500 shrink-0">$</span>
                        <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                          value={p.saleEvent.actualSalePrice ?? ''}
                          onChange={e => onUpdate({ saleEvent: { ...p.saleEvent, actualSalePrice: numVal(e.target.value) } })}
                          onWheel={e => e.target.blur()} placeholder="0" />
                      </div>
                    </div>
                  )
                })()}
              </div>
              </div>
            )}
        </div>
      )}
    </div>
  )
}

// ── Shares form ───────────────────────────────────────────────────────────

function SharesForm({ shares, onUpdate }) {
  const s = shares || {}
  const mode = s.contributionMode || 'surplus'
  return (
    <div className="space-y-4">
      <div className="border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-700/30 bg-gray-800/10">
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Current portfolio value</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 shrink-0">$</span>
            <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
              value={s.currentValue ?? ''} onChange={e => onUpdate({ currentValue: numVal(e.target.value) })}
              onWheel={e => e.target.blur()} placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">{mode === 'surplus' ? 'Target contribution/yr' : 'Annual contribution'}</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 shrink-0">$</span>
            <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
              value={s.annualContribution ?? ''} onChange={e => onUpdate({ annualContribution: numVal(e.target.value) })}
              onWheel={e => e.target.blur()} placeholder="0" />
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="flex gap-2">
            <button
              className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${mode === 'fixed' ? 'bg-brand-600/20 border-brand-500 text-brand-500' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'}`}
              onClick={() => onUpdate({ contributionMode: 'fixed' })}
            >Fixed expense</button>
            <button
              className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${mode === 'surplus' ? 'bg-brand-600/20 border-brand-500 text-brand-500' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'}`}
              onClick={() => onUpdate({ contributionMode: 'surplus' })}
            >From surplus</button>
          </div>
          <p className="text-xs text-gray-600 mt-1.5">
            {mode === 'fixed' ? 'Deducted from cashflow each year like an expense — guaranteed contribution.' : 'Funded from surplus only — set priority in Surplus Strategy below. No surplus = no contribution.'}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Annual increase</span>
          <div className="flex items-center gap-1">
            <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
              value={s.annualIncreaseRate != null && s.annualIncreaseRate !== '' ? (s.annualIncreaseRate * 100).toFixed(0) : '0'}
              onChange={e => { const v = numVal(e.target.value); onUpdate({ annualIncreaseRate: v === '' ? '' : v / 100 }) }}
              onWheel={e => e.target.blur()} placeholder="0" />
            <span className="text-xs text-gray-500 shrink-0">%</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Dividend yield</span>
          <div className="flex items-center gap-1">
            <input className="compact-input flex-1 text-right text-sm" type="number" step="0.1"
              value={s.dividendYield != null && s.dividendYield !== '' ? (s.dividendYield * 100).toFixed(1) : ''}
              onChange={e => { const v = numVal(e.target.value); onUpdate({ dividendYield: v === '' ? '' : v / 100 }) }}
              onWheel={e => e.target.blur()} placeholder="0" />
            <span className="text-xs text-gray-500 shrink-0">%</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Franking credit %</span>
          <div className="flex items-center gap-1">
            <input className="compact-input flex-1 text-right text-sm" type="number" step="5"
              value={s.frankingPct != null && s.frankingPct !== '' ? (s.frankingPct * 100).toFixed(0) : ''}
              onChange={e => { const v = numVal(e.target.value); onUpdate({ frankingPct: v === '' ? '' : v / 100 }) }}
              onWheel={e => e.target.blur()} placeholder="0" />
            <span className="text-xs text-gray-500 shrink-0">%</span>
          </div>
        </div>
        <div className="flex items-center h-10 gap-2 px-4">
          <input type="checkbox" id="preserve-capital" checked={!!s.preserveCapital}
            onChange={e => onUpdate({ preserveCapital: e.target.checked })} />
          <label htmlFor="preserve-capital" className="text-sm leading-5 text-gray-400">
            Preserve capital — no drawdown from share portfolio
          </label>
        </div>
        {s.preserveCapital && (
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
            <span className="text-sm text-gray-400">Preserve from age</span>
            <input className="compact-input w-full text-right" type="number" step="1"
              value={s.preserveCapitalFromAge || ''}
              onChange={e => onUpdate({ preserveCapitalFromAge: numVal(e.target.value) })}
              onWheel={e => e.target.blur()} placeholder="65" />
          </div>
        )}
      </div>
      <div className="border-t border-gray-800 pt-4">
        <HoldingsSubForm
          holdings={s.holdings}
          fields={['ticker', 'dividendYield']}
          createDefault={createDefaultShareHolding}
          label="share holding"
          onUpdate={holdings => onUpdate({ holdings })}
        />
      </div>
    </div>
  )
}

// ── Holdings sub-form (reusable for shares, treasury bonds, commodities, super) ──

function livePriceAge(fetchedAt) {
  if (!fetchedAt) return null
  const ms = Date.now() - new Date(fetchedAt).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmt$(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

function HoldingCard({ holding, fields, onUpdate, onRemove }) {
  const [open, setOpen] = useState(!holding.name && !holding.ticker && !(holding.currentValue > 0))
  const hasTicker     = fields.includes('ticker')
  const tickerEntered = hasTicker && (holding.ticker || '').trim().length > 0
  const hasLivePrice  = tickerEntered && holding.livePrice != null
  const liveValue     = hasLivePrice ? (holding.units || 0) * holding.livePrice : null

  const primaryLabel = holding.ticker || holding.name || 'New holding'
  const secondLabel  = holding.ticker && holding.name ? holding.name : null
  const displayValue = liveValue != null && (holding.units || 0) > 0
    ? fmt$(liveValue)
    : holding.currentValue ? fmt$(holding.currentValue) : null

  return (
    <div className="border border-gray-700 rounded-xl item-card overflow-hidden flex flex-col">
      {/* Collapsed summary card — click to expand */}
      <button
        className="w-full p-3 text-left hover:bg-gray-800/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <span className="text-sm font-semibold text-gray-100 truncate leading-tight">
            {primaryLabel}
          </span>
          <span className="text-gray-600 text-xs shrink-0 mt-0.5">{open ? '▾' : '▸'}</span>
        </div>
        {secondLabel && (
          <p className="text-xs text-gray-500 truncate mb-1.5 -mt-0.5">{secondLabel}</p>
        )}
        {hasLivePrice && (
          <p className="text-xs text-green-400 mb-1">
            ${holding.livePrice.toFixed(2)}
            <span className="text-gray-600 ml-1">· {livePriceAge(holding.livePriceFetchedAt)}</span>
          </p>
        )}
        <div className="flex items-end justify-between gap-2 mt-1">
          {displayValue ? (
            <span className="text-sm font-bold text-white">{displayValue}</span>
          ) : (
            <span className="text-xs text-gray-600 italic">No value</span>
          )}
          {holding.returnRate != null && (
            <span className="text-xs text-gray-500 shrink-0">
              {(holding.returnRate * 100).toFixed(1)}%/yr
            </span>
          )}
        </div>
      </button>

      {/* Expanded detail panel — label left, value right */}
      {open && (
        <div className="border-t border-gray-700/60 bg-gray-800/20 divide-y divide-gray-700/30 text-xs">

          {/* Name */}
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Name</span>
            <input
              className="compact-input w-28 text-right text-sm"
              value={holding.name || ''}
              onChange={e => onUpdate({ name: e.target.value })}
              placeholder="e.g. VAS ETF"
            />
          </div>

          {/* Ticker */}
          {hasTicker && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">
                Ticker <span className="text-gray-600">(opt.)</span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  className="compact-input w-28 text-right text-sm"
                  value={holding.ticker || ''}
                  onChange={e => onUpdate({ ticker: e.target.value.toUpperCase() })}
                  placeholder="CBA.AX"
                />
                {tickerEntered && !hasLivePrice && (
                  <span className="text-amber-400">…</span>
                )}
              </div>
            </div>
          )}
          {tickerEntered && (
            <div className="px-3 py-1 text-gray-600">
              ASX: add <span className="text-gray-500">.AX</span> suffix. US: symbol only.
            </div>
          )}

          {/* Units */}
          {tickerEntered && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">Units</span>
              <input
                className="compact-input w-28 text-right text-sm"
                type="number"
                step="1"
                value={holding.units ?? ''}
                onChange={e => onUpdate({ units: numVal(e.target.value) })}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
            </div>
          )}

          {/* Buy price / unit */}
          {tickerEntered && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">Buy price / unit</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-gray-500">$</span>
                <input
                  className="compact-input w-28 text-right text-sm"
                  type="number"
                  step="0.01"
                  value={holding.purchasePrice ?? ''}
                  onChange={e => onUpdate({ purchasePrice: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()}
                  placeholder="0"
                />
              </div>
            </div>
          )}

          {/* Purchase date */}
          {tickerEntered && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">Purchase date</span>
              <div className="shrink-0">
                <MonthYearInput
                  value={holding.purchaseDate}
                  onChange={v => onUpdate({ purchaseDate: v })}
                  placeholder="Year"
                  minYear={1970}
                  maxYear={new Date().getFullYear()}
                  selectWidth="w-16"
                  yearWidth="w-20"
                  yearClassName="text-right"
                />
              </div>
            </div>
          )}

          {/* Live value note */}
          {hasLivePrice && (holding.units || 0) > 0 && (
            <div className="px-3 py-2 bg-green-900/10">
              <span className="text-green-400">
                Live value {fmt$(liveValue)}
                <span className="text-green-700 ml-1">· {holding.units} × ${holding.livePrice.toFixed(2)}</span>
              </span>
            </div>
          )}

          {/* Current value */}
          {(!hasTicker || !hasLivePrice) && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">Current value</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-gray-500">$</span>
                <input
                  className="compact-input w-28 text-right text-sm"
                  type="number"
                  step="1"
                  value={holding.currentValue ?? ''}
                  onChange={e => onUpdate({ currentValue: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()}
                  placeholder="0"
                />
              </div>
            </div>
          )}

          {/* Return rate */}
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">
              {hasTicker && hasLivePrice ? 'Return rate (proj.)' : 'Return rate'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <input
                className="compact-input w-28 text-right text-sm"
                type="number"
                step="0.5"
                value={holding.returnRate != null && holding.returnRate !== '' ? (holding.returnRate * 100).toFixed(1) : ''}
                onChange={e => { const v = numVal(e.target.value); onUpdate({ returnRate: v === '' ? '' : v / 100 }) }}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
              <span className="text-gray-500">%</span>
            </div>
          </div>

          {/* Dividend yield + franking */}
          {fields.includes('dividendYield') && (
            <>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-gray-400 flex-1">Dividend yield</span>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    className="compact-input w-28 text-right text-sm"
                    type="number"
                    step="0.1"
                    value={holding.dividendYield != null && holding.dividendYield !== '' ? (holding.dividendYield * 100).toFixed(1) : ''}
                    onChange={e => { const v = numVal(e.target.value); onUpdate({ dividendYield: v === '' ? '' : v / 100 }) }}
                    onWheel={e => e.target.blur()}
                    placeholder="0"
                  />
                  <span className="text-gray-500">%</span>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-gray-400 flex-1">Franking</span>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    className="compact-input w-28 text-right text-sm"
                    type="number"
                    step="5"
                    value={holding.frankingPct != null && holding.frankingPct !== '' ? (holding.frankingPct * 100).toFixed(0) : ''}
                    onChange={e => { const v = numVal(e.target.value); onUpdate({ frankingPct: v === '' ? '' : v / 100 }) }}
                    onWheel={e => e.target.blur()}
                    placeholder="0"
                  />
                  <span className="text-gray-500">%</span>
                </div>
              </div>
            </>
          )}

          {/* Coupon rate */}
          {fields.includes('couponRate') && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">Coupon rate</span>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  className="compact-input w-28 text-right text-sm"
                  type="number"
                  step="0.1"
                  value={holding.couponRate != null && holding.couponRate !== '' ? (holding.couponRate * 100).toFixed(1) : ''}
                  onChange={e => { const v = numVal(e.target.value); onUpdate({ couponRate: v === '' ? '' : v / 100 }) }}
                  onWheel={e => e.target.blur()}
                  placeholder="0"
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>
          )}

          {/* Pension phase return */}
          {fields.includes('pensionReturnRate') && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">Pension return</span>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  className="compact-input w-28 text-right text-sm"
                  type="number"
                  step="0.5"
                  value={holding.pensionReturnRate != null && holding.pensionReturnRate !== '' ? (holding.pensionReturnRate * 100).toFixed(1) : ''}
                  onChange={e => { const v = numVal(e.target.value); onUpdate({ pensionReturnRate: v === '' ? '' : v / 100 }) }}
                  onWheel={e => e.target.blur()}
                  placeholder="0"
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>
          )}

          {/* Sold toggle */}
          {tickerEntered && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">Sold / disposed</span>
              <input
                type="checkbox"
                className="accent-brand-500 shrink-0"
                checked={!!holding.saleDate}
                onChange={e => onUpdate({ saleDate: e.target.checked ? (holding.saleDate || `${new Date().getFullYear()}-01`) : null })}
              />
            </div>
          )}

          {/* Sale date + price */}
          {holding.saleDate && (
            <>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-gray-400 flex-1">Sale date</span>
                <div className="shrink-0">
                  <MonthYearInput
                    value={holding.saleDate}
                    onChange={v => onUpdate({ saleDate: v })}
                    placeholder="Year"
                    minYear={1970}
                    maxYear={new Date().getFullYear() + 1}
                    selectWidth="w-16"
                    yearWidth="w-20"
                    yearClassName="text-right"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-gray-400 flex-1">Sale price / unit</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-gray-500">$</span>
                  <input
                    className="compact-input w-28 text-right text-sm"
                    type="number"
                    step="0.01"
                    value={holding.salePrice ?? ''}
                    onChange={e => onUpdate({ salePrice: numVal(e.target.value) })}
                    onWheel={e => e.target.blur()}
                    placeholder="0"
                  />
                </div>
              </div>
            </>
          )}

          {/* Remove */}
          <div className="flex justify-end px-3 py-2">
            <button
              className="text-red-400 hover:text-red-300"
              onClick={e => { e.stopPropagation(); onRemove() }}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function HoldingsSubForm({ holdings, fields, createDefault, label, onUpdate }) {
  const totalValue = (holdings || []).reduce((s, h) => s + (h.currentValue || 0), 0)
  const [expanded, setExpanded] = useState((holdings || []).length > 0)
  const hasTickers = fields.includes('ticker') && (holdings || []).some(h => (h.ticker || '').trim())

  const handleRefreshPrices = () => {
    const cleared = (holdings || []).map(h =>
      (h.ticker || '').trim() ? { ...h, livePrice: null, livePriceFetchedAt: null } : h
    )
    onUpdate(cleared)
  }

  return (
    <div className="border border-gray-700/50 rounded-lg p-3 mt-3">
      <div className="w-full flex items-center justify-between mb-1">
        <button
          className="flex-1 flex items-center gap-2 text-left"
          onClick={() => setExpanded(o => !o)}
        >
          <span className="text-xs font-medium text-gray-400">
            Individual Holdings ({(holdings || []).length})
            {totalValue > 0 && ` — $${Math.round(totalValue).toLocaleString()}`}
          </span>
          <span className="text-gray-500 text-xs">{expanded ? '▾' : '▸'}</span>
        </button>
        {hasTickers && expanded && (
          <button
            className="text-xs text-brand-500 hover:text-brand-400 flex-shrink-0 ml-2"
            onClick={handleRefreshPrices}
            title="Force re-fetch all live prices"
          >
            ↻ Refresh
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
            {(holdings || []).map((h, i) => (
              <HoldingCard
                key={h.id}
                holding={h}
                fields={fields}
                onUpdate={patch => {
                  const updated = [...holdings]
                  updated[i] = { ...updated[i], ...patch }
                  onUpdate(updated)
                }}
                onRemove={() => onUpdate(holdings.filter((_, idx) => idx !== i))}
              />
            ))}
            <button
              className="border border-dashed border-gray-700 rounded-xl p-4 text-gray-600 hover:text-gray-400 hover:border-gray-600 transition-colors flex flex-col items-center justify-center min-h-[88px] gap-1"
              onClick={() => onUpdate([...(holdings || []), createDefault()])}
            >
              <span className="text-xl leading-none">+</span>
              <span className="text-xs">Add {label}</span>
            </button>
          </div>
          {(holdings || []).length > 0 && (
            <p className="text-xs text-gray-600 mt-2">
              Weighted-average rates from holdings override the category defaults.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Treasury/Corporate Bonds form ────────────────────────────────────────

function TreasuryBondsForm({ bonds, onUpdate }) {
  const b = bonds || {}
  const mode = b.contributionMode || 'fixed'
  return (
    <div className="space-y-4">
      <div className="border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-700/30 bg-gray-800/10">
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Current portfolio value</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 shrink-0">$</span>
            <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
              value={b.currentValue ?? ''} onChange={e => onUpdate({ currentValue: numVal(e.target.value) })}
              onWheel={e => e.target.blur()} placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">{mode === 'surplus' ? 'Target contribution/yr' : 'Annual contribution'}</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 shrink-0">$</span>
            <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
              value={b.annualContribution ?? ''} onChange={e => onUpdate({ annualContribution: numVal(e.target.value) })}
              onWheel={e => e.target.blur()} placeholder="0" />
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="flex gap-2">
            <button
              className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${mode === 'fixed' ? 'bg-brand-600/20 border-brand-500 text-brand-500' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'}`}
              onClick={() => onUpdate({ contributionMode: 'fixed' })}
            >Fixed expense</button>
            <button
              className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${mode === 'surplus' ? 'bg-brand-600/20 border-brand-500 text-brand-500' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'}`}
              onClick={() => onUpdate({ contributionMode: 'surplus' })}
            >From surplus</button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5">
          {mode === 'fixed'
            ? 'Deducted from cashflow each year like an expense — guaranteed contribution.'
            : 'Funded from surplus only — set priority in Surplus Strategy below. No surplus = no contribution.'}
        </p>
      </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Annual increase</span>
          <div className="flex items-center gap-1">
            <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
              value={b.annualIncreaseRate != null && b.annualIncreaseRate !== '' ? (b.annualIncreaseRate * 100).toFixed(0) : '0'}
              onChange={e => { const v = numVal(e.target.value); onUpdate({ annualIncreaseRate: v === '' ? '' : v / 100 }) }}
              onWheel={e => e.target.blur()} placeholder="0" />
            <span className="text-xs text-gray-500 shrink-0">%</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Coupon rate</span>
          <div className="flex items-center gap-1">
            <input className="compact-input flex-1 text-right text-sm" type="number" step="0.1"
              value={b.couponRate != null && b.couponRate !== '' ? (b.couponRate * 100).toFixed(1) : ''}
              onChange={e => { const v = numVal(e.target.value); onUpdate({ couponRate: v === '' ? '' : v / 100 }) }}
              onWheel={e => e.target.blur()} placeholder="0" />
            <span className="text-xs text-gray-500 shrink-0">%</span>
          </div>
        </div>
        <div className="flex items-center h-10 gap-2 px-4">
          <input type="checkbox" id="tb-preserve-capital" checked={!!b.preserveCapital}
            onChange={e => onUpdate({ preserveCapital: e.target.checked })} />
          <label htmlFor="tb-preserve-capital" className="text-sm leading-5 text-gray-400">
            Preserve capital — no drawdown from bond portfolio
          </label>
        </div>
        {b.preserveCapital && (
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
            <span className="text-sm text-gray-400">Preserve from age</span>
            <input className="compact-input w-full text-right" type="number" step="1"
              value={b.preserveCapitalFromAge || ''}
              onChange={e => onUpdate({ preserveCapitalFromAge: numVal(e.target.value) })}
              onWheel={e => e.target.blur()} placeholder="65" />
          </div>
        )}
      </div>
      <div className="border-t border-gray-800 pt-4">
        <HoldingsSubForm
          holdings={b.holdings}
          fields={['ticker', 'couponRate']}
          createDefault={createDefaultTreasuryBondHolding}
          label="bond ETF holding"
          onUpdate={holdings => onUpdate({ holdings })}
        />
      </div>
    </div>
  )
}

// ── Commodities form ─────────────────────────────────────────────────────

function CommoditiesForm({ commodities, onUpdate }) {
  const c = commodities || {}
  const mode = c.contributionMode || 'fixed'
  return (
    <div className="space-y-4">
      <div className="border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-700/30 bg-gray-800/10">
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Current portfolio value</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 shrink-0">$</span>
            <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
              value={c.currentValue ?? ''} onChange={e => onUpdate({ currentValue: numVal(e.target.value) })}
              onWheel={e => e.target.blur()} placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">{mode === 'surplus' ? 'Target contribution/yr' : 'Annual contribution'}</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 shrink-0">$</span>
            <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
              value={c.annualContribution ?? ''} onChange={e => onUpdate({ annualContribution: numVal(e.target.value) })}
              onWheel={e => e.target.blur()} placeholder="0" />
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="flex gap-2">
            <button
              className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${mode === 'fixed' ? 'bg-brand-600/20 border-brand-500 text-brand-500' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'}`}
              onClick={() => onUpdate({ contributionMode: 'fixed' })}
            >Fixed expense</button>
            <button
              className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${mode === 'surplus' ? 'bg-brand-600/20 border-brand-500 text-brand-500' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'}`}
              onClick={() => onUpdate({ contributionMode: 'surplus' })}
            >From surplus</button>
          </div>
          <p className="text-xs text-gray-600 mt-1.5">
            {mode === 'fixed' ? 'Deducted from cashflow each year like an expense — guaranteed contribution.' : 'Funded from surplus only — set priority in Surplus Strategy below. No surplus = no contribution.'}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
          <span className="text-sm text-gray-400">Annual increase</span>
          <div className="flex items-center gap-1">
            <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
              value={c.annualIncreaseRate != null && c.annualIncreaseRate !== '' ? (c.annualIncreaseRate * 100).toFixed(0) : '0'}
              onChange={e => { const v = numVal(e.target.value); onUpdate({ annualIncreaseRate: v === '' ? '' : v / 100 }) }}
              onWheel={e => e.target.blur()} placeholder="0" />
            <span className="text-xs text-gray-500 shrink-0">%</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Pure capital growth — no income component. Includes forex, metals, oil, and other commodity investments.
      </p>
      <div className="border-t border-gray-800 pt-4">
        <HoldingsSubForm
          holdings={c.holdings}
          fields={[]}
          createDefault={createDefaultCommodityHolding}
          label="commodity holding"
          onUpdate={holdings => onUpdate({ holdings })}
        />
      </div>
    </div>
  )
}

// ── Bond card (card-grid style) ───────────────────────────────────────────

function BondCard({ bond, onUpdate, onRemove }) {
  const b = bond || {}
  const currentYear = new Date().getFullYear()
  const inceptionYear = b.inceptionDate ? new Date(b.inceptionDate).getFullYear() : null
  const yearsElapsed = inceptionYear != null ? currentYear - inceptionYear : null
  const isTaxFree = yearsElapsed != null && yearsElapsed >= 10
  const contributionMode = b.contributionMode || 'fixed'
  const [open, setOpen] = useState(!b.name && !(b.currentBalance > 0))

  return (
    <div className="border border-gray-700 rounded-xl item-card overflow-hidden flex flex-col">
      <button
        className="w-full p-3 text-left hover:bg-gray-800/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <span className="text-sm font-semibold text-gray-100 truncate leading-tight">
            {b.name || 'Unnamed bond'}
          </span>
          <span className="text-gray-600 text-xs shrink-0 mt-0.5">{open ? '▾' : '▸'}</span>
        </div>
        {yearsElapsed != null && (
          <p className={`text-xs mb-1 ${isTaxFree ? 'text-green-400' : 'text-amber-400'}`}>
            {isTaxFree ? 'Tax-free' : `Year ${yearsElapsed} of 10`}
          </p>
        )}
        <div className="flex items-end justify-between gap-2 mt-1">
          {b.currentBalance ? (
            <span className="text-sm font-bold text-white">{fmt$(b.currentBalance)}</span>
          ) : (
            <span className="text-xs text-gray-600 italic">No balance</span>
          )}
          {(b.annualContribution || 0) > 0 && (
            <span className="text-xs text-gray-500 shrink-0">+{fmt$(b.annualContribution)}/yr</span>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-700/60 bg-gray-800/20 divide-y divide-gray-700/30 text-xs">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Name</span>
            <input
              className="compact-input w-28 text-right text-sm"
              value={b.name || ''}
              onChange={e => onUpdate({ name: e.target.value })}
              placeholder="e.g. Education fund"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Current balance</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-gray-500">$</span>
              <input
                className="compact-input w-28 text-right text-sm"
                type="number" step="1"
                value={b.currentBalance ?? ''}
                onChange={e => onUpdate({ currentBalance: numVal(e.target.value) })}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">{contributionMode === 'surplus' ? 'Target contribution' : 'Annual contribution'}</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-gray-500">$</span>
              <input
                className="compact-input w-28 text-right text-sm"
                type="number" step="1"
                value={b.annualContribution ?? ''}
                onChange={e => onUpdate({ annualContribution: numVal(e.target.value) })}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
            </div>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            <span className="text-gray-400">Contribution mode</span>
            <div className="flex gap-2 mt-1">
              <button
                className={`flex-1 text-xs py-1.5 px-2 rounded-lg border transition-colors ${contributionMode === 'fixed' ? 'bg-brand-600/20 border-brand-500 text-brand-500' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'}`}
                onClick={e => { e.stopPropagation(); onUpdate({ contributionMode: 'fixed' }) }}
              >Fixed</button>
              <button
                className={`flex-1 text-xs py-1.5 px-2 rounded-lg border transition-colors ${contributionMode === 'surplus' ? 'bg-brand-600/20 border-brand-500 text-brand-500' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'}`}
                onClick={e => { e.stopPropagation(); onUpdate({ contributionMode: 'surplus' }) }}
              >Surplus</button>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Annual increase</span>
            <div className="flex items-center gap-1 shrink-0">
              <input
                className="compact-input w-28 text-right text-sm"
                type="number" step="1"
                value={b.annualIncreaseRate != null && b.annualIncreaseRate !== '' ? (b.annualIncreaseRate * 100).toFixed(0) : ''}
                onChange={e => { const v = numVal(e.target.value); onUpdate({ annualIncreaseRate: v === '' ? '' : v / 100 }) }}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
              <span className="text-gray-500">%</span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Inception date</span>
            <input
              className="compact-input w-28 text-right text-sm"
              type="date"
              value={b.inceptionDate || ''}
              onChange={e => onUpdate({ inceptionDate: e.target.value })}
            />
          </div>
          {yearsElapsed != null && !isTaxFree && (
            <div className="px-3 py-2 text-amber-400">{10 - yearsElapsed} yr{10 - yearsElapsed !== 1 ? 's' : ''} until tax-free</div>
          )}
          {isTaxFree && (
            <div className="px-3 py-2 text-green-400">10-year threshold passed — tax-free</div>
          )}
          <div className="flex justify-end px-3 py-2">
            <button className="text-red-400 hover:text-red-300" onClick={e => { e.stopPropagation(); onRemove() }}>Remove</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Expense item ──────────────────────────────────────────────────────────

const AMOUNT_TYPE_LABELS = {
  annual: 'Annual',
  monthly: 'Monthly',
  one_off: 'One-off',
  recurring: 'Recurring',
}

const EXPENSE_DEPTH_LABELS = ['group', 'category', 'subcategory']
const EXPENSE_DEPTH_PLACEHOLDERS = ['Group name (e.g. Living)', 'Category name (e.g. Food)', 'Item name (e.g. Groceries)']

function calcExpenseTotal(node) {
  const own = node.amountType === 'monthly' ? (node.amount || 0) * 12 : (node.amount || 0)
  const childTotal = (node.children || []).reduce((sum, c) => sum + calcExpenseTotal(c), 0)
  return own + childTotal
}

function recurringDisplayLabel(node) {
  if (node.amountType !== 'recurring' || !node.recurringEveryYears) return ''
  return `every ${node.recurringEveryYears} yr${node.recurringEveryYears > 1 ? 's' : ''}`
}

function ExpenseNode({ item, depth, onUpdate, onRemove, planStartYear, planEndYear }) {
  const [open, setOpen] = useState(false)
  const totalAmt = calcExpenseTotal(item)
  const ownAmt = item.amountType === 'monthly' ? (item.amount || 0) * 12 : (item.amount || 0)
  const hasChildren = (item.children || []).length > 0
  const canAddChild = depth < 2 // max 3 levels: group(0) → category(1) → subcategory(2)

  const updateChild = (i, patch) => {
    const children = [...(item.children || [])]
    children[i] = { ...children[i], ...patch }
    onUpdate({ children })
  }
  const removeChild = i => {
    onUpdate({ children: (item.children || []).filter((_, idx) => idx !== i) })
  }
  const addChild = () => {
    onUpdate({
      children: [
        ...(item.children || []),
        {
          id: crypto.randomUUID(),
          label: '',
          type: EXPENSE_DEPTH_LABELS[depth + 1] || 'subcategory',
          amountType: 'annual',
          amount: 0,
          isDiscretionary: item.isDiscretionary || false,
          activeFrom: planStartYear || null,
          activeTo: planEndYear || null,
          inflationRate: null,
          notes: '',
          children: [],
        },
      ],
    })
  }

  const indentPx = depth * 20

  return (
    <div className={depth === 0 ? 'border border-gray-700 rounded-lg overflow-hidden' : ''}>
      <div
        className="flex items-center gap-2 px-3 py-2 bg-gray-800/30"
        style={{ paddingLeft: `${12 + indentPx}px` }}
      >
        <button
          className="text-gray-500 text-xs w-4 shrink-0"
          onClick={() => setOpen(o => !o)}
        >
          {open ? '▾' : '▸'}
        </button>
        <input
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder-gray-600 min-w-0"
          value={item.label || ''}
          onChange={e => onUpdate({ label: e.target.value })}
          placeholder={EXPENSE_DEPTH_PLACEHOLDERS[depth] || 'Label'}
        />
        {depth > 0 && (
          <span className="text-xs text-gray-600 shrink-0">
            {item.amountType === 'recurring' ? recurringDisplayLabel(item) : (AMOUNT_TYPE_LABELS[item.amountType] || 'Annual')}
          </span>
        )}
        {item.isDiscretionary && (
          <span className="text-xs text-amber-500 shrink-0">disc.</span>
        )}
        <span className={`text-xs font-mono shrink-0 ${hasChildren && ownAmt === 0 ? 'text-gray-500' : 'text-gray-400'}`}>
          ${Math.round(totalAmt).toLocaleString()}{item.amountType === 'recurring' ? '' : (item.amountType === 'one_off' ? '' : '/yr')}
        </span>
        <button
          className="text-gray-600 hover:text-red-400 text-sm shrink-0"
          onClick={onRemove}
        >
          ×
        </button>
      </div>

      {open && (
        <>
          {/* Own amount + settings */}
          <div className="divide-y divide-gray-700/30 bg-gray-800/10" style={{ paddingLeft: `${indentPx}px` }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
              <span className="text-sm text-gray-400">{hasChildren ? 'Own amount (excl. children)' : 'Amount'}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 shrink-0">$</span>
                <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                  value={item.amount ?? ''} onChange={e => onUpdate({ amount: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
              <span className="text-sm text-gray-400">Amount type</span>
              <select className="compact-input w-full"
                value={item.amountType || 'annual'}
                onChange={e => {
                  const newType = e.target.value
                  const patch = { amountType: newType }
                  if (newType === 'one_off') patch.activeTo = null
                  if (newType === 'recurring' && !item.recurringEveryYears) patch.recurringEveryYears = 5
                  if (newType !== 'recurring') patch.recurringEveryYears = null
                  onUpdate(patch)
                }}>
                <option value="annual">Annual</option>
                <option value="monthly">Monthly (×12)</option>
                <option value="one_off">One-off</option>
                <option value="recurring">Recurring (other)</option>
              </select>
            </div>
            {item.amountType === 'recurring' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                <span className="text-sm text-gray-400">Every X years</span>
                <input className="compact-input w-full text-right" type="number" step="1"
                  value={item.recurringEveryYears || ''}
                  onChange={e => onUpdate({ recurringEveryYears: numVal(e.target.value) || null })}
                  onWheel={e => e.target.blur()} placeholder="10" />
              </div>
            )}
            <div className="flex items-center h-10 gap-2 px-4">
              <input type="checkbox" id={`disc-${item.id}`} checked={!!item.isDiscretionary}
                onChange={e => onUpdate({ isDiscretionary: e.target.checked })} />
              <label htmlFor={`disc-${item.id}`} className="text-sm leading-5 text-gray-400">Discretionary</label>
            </div>
            {item.amountType === 'one_off' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                <span className="text-sm text-gray-400">Date</span>
                <div className="flex justify-end">
                  <MonthYearInput
                    value={item.activeFrom}
                    onChange={v => onUpdate({ activeFrom: v, activeTo: null })}
                    placeholder={planStartYear ? String(planStartYear) : 'Year'}
                    yearClassName="text-right"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                  <span className="text-sm text-gray-400">Start</span>
                  <div className="flex justify-end">
                    <MonthYearInput
                      value={item.activeFrom}
                      onChange={v => onUpdate({ activeFrom: v })}
                      placeholder={planStartYear ? String(planStartYear) : 'Year'}
                      yearClassName="text-right"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
                  <span className="text-sm text-gray-400">End</span>
                  <div className="flex justify-end">
                    <MonthYearInput
                      value={item.activeTo}
                      onChange={v => onUpdate({ activeTo: v })}
                      placeholder="Ongoing"
                      yearClassName="text-right"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Children */}
          {(item.children || []).map((child, i) => (
            <ExpenseNode
              key={child.id}
              item={child}
              depth={depth + 1}
              onUpdate={patch => updateChild(i, patch)}
              onRemove={() => removeChild(i)}
              planStartYear={planStartYear}
              planEndYear={planEndYear}
            />
          ))}

          {canAddChild && (
            <div style={{ paddingLeft: `${16 + (depth + 1) * 20}px` }} className="py-1.5">
              <button
                className="text-xs text-gray-500 hover:text-gray-300"
                onClick={addChild}
              >
                + Add {EXPENSE_DEPTH_LABELS[depth + 1] || 'item'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function OtherIncomeCard({ item, personAName, personBName, onUpdate, onRemove }) {
  const [open, setOpen] = useState(!item.name && !(item.amount > 0))
  const annualAmt = item.amountType === 'monthly' ? (item.amount || 0) * 12 : (item.amount || 0)
  const personLabel = item.person === 'household' ? 'Joint' : item.person === 'B' ? personBName : personAName

  return (
    <div className="border border-gray-700 rounded-xl item-card overflow-hidden flex flex-col">
      <button
        className="w-full p-3 text-left hover:bg-gray-800/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <span className="text-sm font-semibold text-gray-100 truncate leading-tight">
            {item.name || 'Unnamed source'}
          </span>
          <span className="text-gray-600 text-xs shrink-0 mt-0.5">{open ? '▾' : '▸'}</span>
        </div>
        <p className="text-xs text-gray-500 mb-1">
          {personLabel}{!item.isTaxable && ' · tax-free'}
        </p>
        <div className="flex items-end justify-between gap-2 mt-1">
          {annualAmt > 0 ? (
            <span className="text-sm font-bold text-white">
              {fmt$(annualAmt)}{item.amountType !== 'one_off' ? '/yr' : ''}
            </span>
          ) : (
            <span className="text-xs text-gray-600 italic">No amount</span>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-700/60 bg-gray-800/20 divide-y divide-gray-700/30 text-xs">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Name</span>
            <input
              className="compact-input w-28 text-right text-sm"
              value={item.name || ''}
              onChange={e => onUpdate({ name: e.target.value })}
              placeholder="Income source"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Amount</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-gray-500">$</span>
              <input
                className="compact-input w-28 text-right text-sm"
                type="number" step="1"
                value={item.amount ?? ''}
                onChange={e => onUpdate({ amount: numVal(e.target.value) })}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Frequency</span>
            <select
              className="compact-input w-28 text-sm"
              value={item.amountType || 'annual'}
              onChange={e => onUpdate({ amountType: e.target.value })}
              onClick={e => e.stopPropagation()}
            >
              <option value="annual">Annual</option>
              <option value="monthly">Monthly</option>
              <option value="one_off">One-off</option>
            </select>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Attributed to</span>
            <select
              className="compact-input w-28 text-sm"
              value={item.person || 'A'}
              onChange={e => onUpdate({ person: e.target.value })}
              onClick={e => e.stopPropagation()}
            >
              <option value="A">{personAName}</option>
              <option value="B">{personBName}</option>
              <option value="household">Joint</option>
            </select>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Taxable</span>
            <input
              type="checkbox"
              className="accent-brand-500 shrink-0"
              checked={item.isTaxable !== false}
              onChange={e => onUpdate({ isTaxable: e.target.checked })}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">{item.amountType === 'one_off' ? 'Date' : 'Starts'}</span>
            <div className="shrink-0">
              <MonthYearInput
                value={item.activeFrom}
                onChange={v => onUpdate({ activeFrom: v })}
                placeholder="Year"
                selectWidth="w-14"
                yearWidth="w-20"
                yearClassName="text-right"
              />
            </div>
          </div>
          {item.amountType !== 'one_off' && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">Ends</span>
              <div className="shrink-0">
                <MonthYearInput
                  value={item.activeTo}
                  onChange={v => onUpdate({ activeTo: v })}
                  placeholder="Ongoing"
                  selectWidth="w-14"
                  yearWidth="w-20"
                  yearClassName="text-right"
                />
              </div>
            </div>
          )}
          {item.amountType !== 'one_off' && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">Adjustment</span>
              <select
                className="compact-input w-28 text-sm"
                value={item.adjustmentType || 'none'}
                onChange={e => onUpdate({ adjustmentType: e.target.value, adjustmentRate: 0 })}
                onClick={e => e.stopPropagation()}
              >
                <option value="none">None</option>
                <option value="percent">% / yr</option>
                <option value="dollar">$ / yr</option>
              </select>
            </div>
          )}
          {item.amountType !== 'one_off' && item.adjustmentType === 'percent' && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">Rate</span>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  className="compact-input w-28 text-right text-sm"
                  type="number" step="0.1"
                  value={item.adjustmentRate != null && item.adjustmentRate !== '' ? (item.adjustmentRate * 100).toFixed(1) : ''}
                  onChange={e => { const v = numVal(e.target.value); onUpdate({ adjustmentRate: v === '' ? '' : v / 100 }) }}
                  onWheel={e => e.target.blur()}
                  placeholder="0"
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>
          )}
          {item.amountType !== 'one_off' && item.adjustmentType === 'dollar' && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">$ / yr</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-gray-500">$</span>
                <input
                  className="compact-input w-28 text-right text-sm"
                  type="number" step="1"
                  value={item.adjustmentRate ?? ''}
                  onChange={e => onUpdate({ adjustmentRate: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()}
                  placeholder="0"
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Retire routing</span>
            <select
              className="compact-input w-28 text-sm"
              value={item.routeTo || 'cashflow'}
              onChange={e => onUpdate({ routeTo: e.target.value })}
              onClick={e => e.stopPropagation()}
            >
              <option value="cashflow">Cashflow</option>
              <option value="shares">Shares</option>
              <option value="treasuryBonds">Bonds</option>
              <option value="commodities">Commodities</option>
              <option value="bonds">Tax bonds</option>
              <option value="otherAssets">Other assets</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div className="flex justify-end px-3 py-2">
            <button className="text-red-400 hover:text-red-300" onClick={e => { e.stopPropagation(); onRemove() }}>Remove</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Debt helpers ──────────────────────────────────────────────────────────

const DEBT_TYPE_LABELS = { personal_loan: 'Personal Loan', lease: 'Lease', credit_card: 'Credit Card' }

function createDebtDefaults(type) {
  const base = {
    id: crypto.randomUUID(),
    name: '',
    type,
    currentBalance: 0,
    interestRate: type === 'credit_card' ? 0.20 : type === 'lease' ? 0.07 : 0.08,
    startYear: null,
  }
  if (type === 'personal_loan') return { ...base, monthlyRepayment: 0, termYears: 5 }
  if (type === 'lease') return { ...base, termYears: 5, residualValue: 0, monthlyRepayment: 0 }
  return { ...base, monthlyRepayment: 0, repaymentMode: 'payoff' }
}

function DebtCard({ item, onUpdate, onRemove }) {
  const [open, setOpen] = useState(!item.name && !(item.currentBalance > 0))
  const annualRepay = (item.monthlyRepayment || 0) * 12
  let displayRepay = annualRepay
  if (item.type === 'lease' && !item.monthlyRepayment && item.currentBalance > 0 && item.termYears > 0) {
    const financed = item.currentBalance - (item.residualValue || 0)
    const totalInterest = financed * (item.interestRate || 0) * item.termYears
    displayRepay = (financed + totalInterest) / item.termYears
  }

  return (
    <div className="border border-gray-700 rounded-xl item-card overflow-hidden flex flex-col">
      <button
        className="w-full p-3 text-left hover:bg-gray-800/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <span className="text-sm font-semibold text-gray-100 truncate leading-tight">
            {item.name || DEBT_TYPE_LABELS[item.type] || 'Debt'}
          </span>
          <span className="text-gray-600 text-xs shrink-0 mt-0.5">{open ? '▾' : '▸'}</span>
        </div>
        <p className="text-xs text-gray-500 mb-1">{DEBT_TYPE_LABELS[item.type]}</p>
        <div className="flex items-end justify-between gap-2 mt-1">
          {item.currentBalance > 0 ? (
            <span className="text-sm font-bold text-red-400">{fmt$(item.currentBalance)}</span>
          ) : (
            <span className="text-xs text-gray-600 italic">No balance</span>
          )}
          {displayRepay > 0 && (
            <span className="text-xs text-gray-500 shrink-0">{fmt$(displayRepay)}/yr</span>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-700/60 bg-gray-800/20 divide-y divide-gray-700/30 text-xs">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Name</span>
            <input
              className="compact-input w-28 text-right text-sm"
              value={item.name || ''}
              onChange={e => onUpdate({ name: e.target.value })}
              placeholder={DEBT_TYPE_LABELS[item.type]}
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Current balance</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-gray-500">$</span>
              <input
                className="compact-input w-28 text-right text-sm"
                type="number" step="1"
                value={item.currentBalance ?? ''}
                onChange={e => onUpdate({ currentBalance: numVal(e.target.value) })}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Interest rate</span>
            <div className="flex items-center gap-1 shrink-0">
              <input
                className="compact-input w-28 text-right text-sm"
                type="number" step="0.1"
                value={item.interestRate != null && item.interestRate !== '' ? (item.interestRate * 100).toFixed(1) : ''}
                onChange={e => { const v = numVal(e.target.value); onUpdate({ interestRate: v === '' ? '' : v / 100 }) }}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
              <span className="text-gray-500">%</span>
            </div>
          </div>
          {item.type !== 'credit_card' && (
            <>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-gray-400 flex-1">Term (years)</span>
                <input
                  className="compact-input w-28 text-right text-sm"
                  type="number" step="1"
                  value={item.termYears || ''}
                  onChange={e => onUpdate({ termYears: numVal(e.target.value) || null })}
                  onWheel={e => e.target.blur()}
                  placeholder="5"
                />
              </div>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-gray-400 flex-1">Start year</span>
                <input
                  className="compact-input w-28 text-right text-sm"
                  type="number" step="1"
                  value={item.startYear || ''}
                  onChange={e => onUpdate({ startYear: numVal(e.target.value) || null })}
                  onWheel={e => e.target.blur()}
                  placeholder="Already held"
                />
              </div>
            </>
          )}
          {item.type === 'lease' && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">Residual value</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-gray-500">$</span>
                <input
                  className="compact-input w-28 text-right text-sm"
                  type="number" step="1"
                  value={item.residualValue ?? ''}
                  onChange={e => onUpdate({ residualValue: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()}
                  placeholder="0"
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">
              {item.type === 'lease' ? 'Monthly repay (0=auto)' : item.type === 'credit_card' ? 'Monthly repay (0=min 2%)' : 'Monthly repayment'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-gray-500">$</span>
              <input
                className="compact-input w-28 text-right text-sm"
                type="number" step="1"
                value={item.monthlyRepayment ?? ''}
                onChange={e => onUpdate({ monthlyRepayment: numVal(e.target.value) })}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
            </div>
          </div>
          {item.type === 'credit_card' && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-gray-400 flex-1">Mode</span>
              <select
                className="compact-input w-28 text-sm"
                value={item.repaymentMode || 'payoff'}
                onChange={e => onUpdate({ repaymentMode: e.target.value })}
                onClick={e => e.stopPropagation()}
              >
                <option value="payoff">Pay off</option>
                <option value="revolving">Revolving</option>
              </select>
            </div>
          )}
          {item.type === 'lease' && item.currentBalance > 0 && item.termYears > 0 && (() => {
            const financed = item.currentBalance - (item.residualValue || 0)
            const totalInterest = financed * (item.interestRate || 0) * item.termYears
            const annualPay = (financed + totalInterest) / item.termYears
            return <div className="px-3 py-2 text-gray-500">{fmt$(annualPay)}/yr auto-calculated</div>
          })()}
          <div className="flex justify-end px-3 py-2">
            <button className="text-red-400 hover:text-red-300" onClick={e => { e.stopPropagation(); onRemove() }}>Remove</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Other asset card (card-grid style) ───────────────────────────────────

function OtherAssetCard({ asset, onUpdate, onRemove }) {
  const [open, setOpen] = useState(!asset.name && !(asset.currentValue > 0))
  const contributionMode = asset.contributionMode || 'fixed'

  return (
    <div className="border border-gray-700 rounded-xl item-card overflow-hidden flex flex-col">
      <button
        className="w-full p-3 text-left hover:bg-gray-800/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-start justify-between gap-1 mb-1.5">
          <span className="text-sm font-semibold text-gray-100 truncate leading-tight">
            {asset.name || 'Unnamed asset'}
          </span>
          <span className="text-gray-600 text-xs shrink-0 mt-0.5">{open ? '▾' : '▸'}</span>
        </div>
        <div className="flex items-end justify-between gap-2 mt-1">
          {asset.currentValue ? (
            <span className="text-sm font-bold text-white">{fmt$(asset.currentValue)}</span>
          ) : (
            <span className="text-xs text-gray-600 italic">No value</span>
          )}
          {asset.returnRate != null && (
            <span className="text-xs text-gray-500 shrink-0">
              {(asset.returnRate * 100).toFixed(1)}%/yr
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-700/60 bg-gray-800/20 divide-y divide-gray-700/30 text-xs">
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Name</span>
            <input
              className="compact-input w-28 text-right text-sm"
              value={asset.name || ''}
              onChange={e => onUpdate({ name: e.target.value })}
              placeholder="Asset name"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Current value</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-gray-500">$</span>
              <input
                className="compact-input w-28 text-right text-sm"
                type="number" step="1"
                value={asset.currentValue ?? ''}
                onChange={e => onUpdate({ currentValue: numVal(e.target.value) })}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">{contributionMode === 'surplus' ? 'Target contribution' : 'Annual contribution'}</span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-gray-500">$</span>
              <input
                className="compact-input w-28 text-right text-sm"
                type="number" step="1"
                value={asset.annualContribution ?? ''}
                onChange={e => onUpdate({ annualContribution: numVal(e.target.value) })}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Return rate</span>
            <div className="flex items-center gap-1 shrink-0">
              <input
                className="compact-input w-28 text-right text-sm"
                type="number" step="0.5"
                value={asset.returnRate != null && asset.returnRate !== '' ? (asset.returnRate * 100).toFixed(1) : ''}
                onChange={e => { const v = numVal(e.target.value); onUpdate({ returnRate: v === '' ? '' : v / 100 }) }}
                onWheel={e => e.target.blur()}
                placeholder="7.0"
              />
              <span className="text-gray-500">%</span>
            </div>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            <span className="text-gray-400">Contribution mode</span>
            <div className="flex gap-2 mt-1">
              <button
                className={`flex-1 text-xs py-1.5 px-2 rounded-lg border transition-colors ${contributionMode === 'fixed' ? 'bg-brand-600/20 border-brand-500 text-brand-500' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'}`}
                onClick={e => { e.stopPropagation(); onUpdate({ contributionMode: 'fixed' }) }}
              >Fixed</button>
              <button
                className={`flex-1 text-xs py-1.5 px-2 rounded-lg border transition-colors ${contributionMode === 'surplus' ? 'bg-brand-600/20 border-brand-500 text-brand-500' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'}`}
                onClick={e => { e.stopPropagation(); onUpdate({ contributionMode: 'surplus' }) }}
              >Surplus</button>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Annual increase</span>
            <div className="flex items-center gap-1 shrink-0">
              <input
                className="compact-input w-28 text-right text-sm"
                type="number" step="1"
                value={asset.annualIncreaseRate != null && asset.annualIncreaseRate !== '' ? (asset.annualIncreaseRate * 100).toFixed(0) : ''}
                onChange={e => { const v = numVal(e.target.value); onUpdate({ annualIncreaseRate: v === '' ? '' : v / 100 }) }}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
              <span className="text-gray-500">%</span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-gray-400 flex-1">Available for drawdown</span>
            <input
              type="checkbox"
              className="accent-brand-500 shrink-0"
              checked={asset.canDrawdown ?? true}
              onChange={e => onUpdate({ canDrawdown: e.target.checked })}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="flex justify-end px-3 py-2">
            <button className="text-red-400 hover:text-red-300" onClick={e => { e.stopPropagation(); onRemove() }}>Remove</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────

const HOUSEHOLD_TUTORIAL = [
  {
    title: 'Your household data',
    body: 'This is the foundation for every projection. Start with People (dates of birth and planned retirement ages), then work through Super, Property, Shares, Bonds, Commodities, and Expenses.',
  },
  {
    title: 'People section',
    body: 'Enter dates of birth, current salaries, and planned retirement ages for Person A and (optionally) Person B. Preservation age is auto-set to 60 for anyone born after 1 July 1964.',
  },
  {
    title: 'Assets',
    body: 'Fill in current balances for super, property, shares, and investment bonds. The more accurately you enter each section, the more meaningful the projections will be.',
  },
  {
    title: 'Expenses',
    body: 'Add your expense categories with amounts, frequencies, and date ranges. Tag expenses as fixed or discretionary — this affects how the Impact Analyser and Goal Planner adjust them.',
  },
  {
    title: 'Salary packaging',
    body: 'If you salary package, enter the details here. Packaging and novated lease amounts feed directly into the tax engine and can significantly affect your projections.',
  },
]

export default function HouseholdProfile({ scenario, updateScenario }) {
  const [showTutorial, setShowTutorial, closeTutorial] = useTutorial('householdTutorialSeen', { waitFor: 'welcomeTutorialSeen' })
  const { personA, personB } = scenario.household
  const superA = scenario.super.find(s => s.personLabel === 'A') || {}
  const superB = scenario.super.find(s => s.personLabel === 'B') || {}
  const expenseItems = scenario.expenses?.children || []

  // Validation warnings for critical fields
  const validationWarnings = useMemo(() => {
    const warnings = []
    const nameA = personA?.name || 'Person A'
    if (!personA?.dateOfBirth) warnings.push(`${nameA}: date of birth is required`)
    if (!personA?.retirementAge && personA?.retirementAge !== 0) warnings.push(`${nameA}: retirement age is required`)
    if (personB?.dateOfBirth || personB?.currentSalary || personB?.name) {
      const nameB = personB?.name || 'Person B'
      if (!personB?.dateOfBirth) warnings.push(`${nameB}: date of birth is required`)
      if (!personB?.retirementAge && personB?.retirementAge !== 0) warnings.push(`${nameB}: retirement age is required`)
    }
    return warnings
  }, [personA, personB])

  // Plan year range for expense date defaults
  const planStartYear = new Date().getFullYear()
  const olderBirthYear = Math.min(
    personA?.dateOfBirth ? new Date(personA.dateOfBirth).getFullYear() : 9999,
    personB?.dateOfBirth ? new Date(personB.dateOfBirth).getFullYear() : 9999,
  )
  const planEndYear = olderBirthYear < 9999
    ? olderBirthYear + (scenario.assumptions?.simulationEndAge || 90)
    : planStartYear + 40

  const updatePersonA = patch =>
    updateScenario({ household: { ...scenario.household, personA: { ...personA, ...patch } } })
  const updatePersonB = patch =>
    updateScenario({ household: { ...scenario.household, personB: { ...personB, ...patch } } })

  const updateSuperA = patch =>
    updateScenario({ super: scenario.super.map(s => s.personLabel === 'A' ? { ...s, ...patch } : s) })
  const updateSuperB = patch =>
    updateScenario({ super: scenario.super.map(s => s.personLabel === 'B' ? { ...s, ...patch } : s) })

  const addProperty = () => {
    if (scenario.properties.length >= 4) return
    const isPrimary = scenario.properties.length === 0
    updateScenario({
      properties: [
        ...scenario.properties,
        {
          isPrimaryResidence: isPrimary,
          currentValue: 0,
          purchasePrice: 0,
          purchaseDate: null,
          mortgageBalance: 0,
          interestRate: 0.065,
          loanTermYearsRemaining: 0,
          loanType: 'pi',
          ioEndYear: null,
          offsetBalance: 0,
          annualRentalIncome: 0,
          annualPropertyExpenses: 0,
          growthRate: 0.04,
          saleEvent: null,
          ownershipPctA: 100,
        },
      ],
    })
  }

  const updateProperty = (i, patch) =>
    updateScenario({ properties: scenario.properties.map((p, idx) => idx === i ? { ...p, ...patch } : p) })
  const removeProperty = i =>
    updateScenario({ properties: scenario.properties.filter((_, idx) => idx !== i) })

  const updateShares = patch =>
    updateScenario({ shares: { ...scenario.shares, ...patch } })

  const updateTreasuryBonds = patch =>
    updateScenario({ treasuryBonds: { ...(scenario.treasuryBonds || {}), ...patch } })

  const updateCommodities = patch =>
    updateScenario({ commodities: { ...(scenario.commodities || {}), ...patch } })

  const addBond = () =>
    updateScenario({
      investmentBonds: [
        ...scenario.investmentBonds,
        {
          id: crypto.randomUUID(),
          name: '',
          currentBalance: 0,
          annualContribution: 0,
          inceptionDate: null,
          ratePeriods: [{ fromYear: new Date().getFullYear(), toYear: 2090, rate: 0.07 }],
        },
      ],
    })
  const updateBond = (i, patch) =>
    updateScenario({ investmentBonds: scenario.investmentBonds.map((b, idx) => idx === i ? { ...b, ...patch } : b) })
  const removeBond = i =>
    updateScenario({ investmentBonds: scenario.investmentBonds.filter((_, idx) => idx !== i) })

  const addExpenseGroup = () =>
    updateScenario({
      expenses: {
        ...scenario.expenses,
        children: [
          ...expenseItems,
          {
            id: crypto.randomUUID(),
            label: '',
            type: 'group',
            amountType: 'annual',
            amount: 0,
            isDiscretionary: false,
            activeFrom: null,
            activeTo: null,
            inflationRate: null,
            notes: '',
            children: [],
          },
        ],
      },
    })
  const updateExpense = (i, patch) =>
    updateScenario({
      expenses: {
        ...scenario.expenses,
        children: expenseItems.map((e, idx) => idx === i ? { ...e, ...patch } : e),
      },
    })
  const removeExpense = i =>
    updateScenario({
      expenses: {
        ...scenario.expenses,
        children: expenseItems.filter((_, idx) => idx !== i),
      },
    })

  return (
    <div className="px-6 py-4 max-w-6xl mx-auto">
      {showTutorial && <Tutorial steps={HOUSEHOLD_TUTORIAL} onClose={closeTutorial} />}
      <div className="flex items-center gap-2 mb-3">
        <h1 className="text-lg font-semibold text-white">Household Profile</h1>
        <TutorialButton onClick={() => setShowTutorial(true)} />
      </div>

      {validationWarnings.length > 0 && (
        <div className="bg-amber-900/50 border border-amber-800 rounded-lg px-4 py-3 mb-3">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1">Missing required fields</p>
          <ul className="text-sm text-amber-400 space-y-0.5">
            {validationWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="divide-y divide-gray-800/40 border-t border-gray-800/40">

      <Section title="People">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(() => {
            const hasSharedHecs = !!personA.hecs || !!personB.hecs
            const maxSalaryChanges = Math.max(
              (personA.salaryChanges || []).length,
              (personB.salaryChanges || []).length
            )
            return (
              <>
                <PersonForm
                  person={personA}
                  label="A"
                  onUpdate={updatePersonA}
                  alignHecsSlot={hasSharedHecs}
                  alignSalaryChangesCount={maxSalaryChanges}
                />
                <PersonForm
                  person={personB}
                  label="B"
                  onUpdate={updatePersonB}
                  alignHecsSlot={hasSharedHecs}
                  alignSalaryChangesCount={maxSalaryChanges}
                />
              </>
            )
          })()}
        </div>
        <p className="text-xs text-gray-600 mt-3">
          Preservation age is auto-set to 60 for anyone born after 1 July 1964.
        </p>
      </Section>

      <Section title="Superannuation">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(() => {
            const alignEmployerPctSlot =
              (superA?.employerScheme || 'sg') === 'match' ||
              (superA?.employerScheme || 'sg') === 'fixed_pct' ||
              (superB?.employerScheme || 'sg') === 'match' ||
              (superB?.employerScheme || 'sg') === 'fixed_pct'
            return (
              <>
          <SuperForm
            superProfile={superA}
            personLabel="A"
            grossSalary={personA.currentSalary}
            alignEmployerPctSlot={alignEmployerPctSlot}
            onUpdate={updateSuperA}
          />
          <SuperForm
            superProfile={superB}
            personLabel="B"
            grossSalary={personB.currentSalary}
            alignEmployerPctSlot={alignEmployerPctSlot}
            onUpdate={updateSuperB}
          />
              </>
            )
          })()}
        </div>
      </Section>

      <Section title={`Properties (${scenario.properties.length} / 4)`}>
        <div className="space-y-3">
          {scenario.properties.map((p, i) => (
            <PropertyForm
              key={i}
              property={p}
              index={i + 1}
              allProperties={scenario.properties}
              onUpdate={patch => updateProperty(i, patch)}
              onRemove={() => removeProperty(i)}
            />
          ))}
          {scenario.properties.length === 0 && (
            <p className="text-sm text-gray-500 py-1">No properties added yet.</p>
          )}
          {scenario.properties.length < 4 && (
            <button
              className="btn-ghost w-full py-2.5 border border-dashed border-gray-700 rounded-lg text-sm mt-1"
              onClick={addProperty}
            >
              + Add property
            </button>
          )}
        </div>
      </Section>

      <Section title="Cash &amp; Savings">
        <div className="border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-700/30 bg-gray-800/10">
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
            <span className="text-sm text-gray-400">Cash / savings balance</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 shrink-0">$</span>
              <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                value={scenario.cashSavings ?? 0} onChange={e => updateScenario({ cashSavings: numVal(e.target.value) })}
                onWheel={e => e.target.blur()} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
            <span className="text-sm text-gray-400">Minimum cash buffer</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 shrink-0">$</span>
              <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                value={scenario.minCashBuffer ?? 0} onChange={e => updateScenario({ minCashBuffer: numVal(e.target.value) })}
                onWheel={e => e.target.blur()} placeholder="0" />
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Cash earns no return. Surplus accumulates here unless routed elsewhere via the Surplus Strategy.
        </p>
      </Section>

      <Section title="Share Portfolio">
        <SharesForm shares={scenario.shares} onUpdate={updateShares} />
        <div className="mt-3 border border-gray-700 rounded-lg overflow-hidden bg-gray-800/10">
          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-1 sm:gap-3 px-4 py-3">
            <span className="text-sm text-gray-400">Capital losses carried fwd (prior FY)</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 shrink-0">$</span>
              <input className="compact-input flex-1 text-right text-sm" type="number" step="1"
                value={scenario.capitalLossesCarriedForward ?? 0}
                onChange={e => updateScenario({ capitalLossesCarriedForward: numVal(e.target.value) })}
                onWheel={e => e.target.blur()} placeholder="0" />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Treasury / Corporate Bonds">
        <TreasuryBondsForm bonds={scenario.treasuryBonds} onUpdate={updateTreasuryBonds} />
      </Section>

      <Section title="Commodities">
        <CommoditiesForm commodities={scenario.commodities} onUpdate={updateCommodities} />
      </Section>

      <Section title={`Tax-Deferred Bonds — 10yr (${scenario.investmentBonds.length})`}>
        {scenario.investmentBonds.length === 0 && (
          <p className="text-sm text-gray-500 mb-3">
            Tax-deferred bonds offer tax-free withdrawals after 10 years — useful for high-income earners.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-start">
          {scenario.investmentBonds.map((b, i) => (
            <BondCard
              key={b.id}
              bond={b}
              onUpdate={patch => updateBond(i, patch)}
              onRemove={() => removeBond(i)}
            />
          ))}
          <button
            className="border border-dashed border-gray-700 rounded-xl p-4 text-gray-600 hover:text-gray-400 hover:border-gray-600 transition-colors flex flex-col items-center justify-center min-h-[88px] gap-1"
            onClick={addBond}
          >
            <span className="text-xl leading-none">+</span>
            <span className="text-xs">Add bond</span>
          </button>
        </div>
      </Section>

      <Section title={`Expenses (${expenseItems.length} groups)`}>
        <p className="text-xs text-gray-500 mb-3">
          Organise expenses into groups, categories, and items (up to 3 levels). Each level can hold its own amount.
        </p>
        <div className="space-y-2">
          {expenseItems.length === 0 && (
            <p className="text-sm text-gray-500 py-1">
              No expenses added — simulation uses zero living costs.
            </p>
          )}
          {expenseItems.map((item, i) => (
            <ExpenseNode
              key={item.id}
              item={item}
              depth={0}
              onUpdate={patch => updateExpense(i, patch)}
              onRemove={() => removeExpense(i)}
              planStartYear={planStartYear}
              planEndYear={planEndYear}
            />
          ))}
          <button
            className="btn-ghost w-full py-2.5 border border-dashed border-gray-700 rounded-lg text-sm mt-2"
            onClick={addExpenseGroup}
          >
            + Add expense group
          </button>
        </div>
      </Section>

      <Section title={`Other Income (${(scenario.otherIncome || []).length})`}>
        <p className="text-sm text-gray-500 mb-3">
          Consulting, part-time work, gifts, pensions, trust distributions, or any non-salary income.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-start">
          {(scenario.otherIncome || []).map((src, i) => (
            <OtherIncomeCard
              key={src.id}
              item={src}
              personAName={scenario.household.personA.name || 'Person A'}
              personBName={scenario.household.personB.name || 'Person B'}
              onUpdate={patch => {
                const updated = [...(scenario.otherIncome || [])]
                updated[i] = { ...updated[i], ...patch }
                updateScenario({ otherIncome: updated })
              }}
              onRemove={() => {
                updateScenario({ otherIncome: (scenario.otherIncome || []).filter((_, idx) => idx !== i) })
              }}
            />
          ))}
          <button
            className="border border-dashed border-gray-700 rounded-xl p-4 text-gray-600 hover:text-gray-400 hover:border-gray-600 transition-colors flex flex-col items-center justify-center min-h-[88px] gap-1"
            onClick={() => {
              updateScenario({
                otherIncome: [
                  ...(scenario.otherIncome || []),
                  {
                    id: crypto.randomUUID(),
                    name: '',
                    amount: 0,
                    amountType: 'annual',
                    activeFrom: null,
                    activeTo: null,
                    adjustmentType: 'none',
                    adjustmentRate: 0,
                    isTaxable: true,
                    person: 'A',
                    notes: '',
                  },
                ],
              })
            }}
          >
            <span className="text-xl leading-none">+</span>
            <span className="text-xs">Add income source</span>
          </button>
        </div>
      </Section>

      <Section title={`Other Assets (${(scenario.otherAssets || []).length})`}>
        <p className="text-sm text-gray-500 mb-3">
          Private equity, business interests, collectibles, or any asset not covered above.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-start">
          {(scenario.otherAssets || []).map((asset, i) => (
            <OtherAssetCard
              key={asset.id}
              asset={asset}
              onUpdate={patch => {
                const updated = [...(scenario.otherAssets || [])]
                updated[i] = { ...updated[i], ...patch }
                updateScenario({ otherAssets: updated })
              }}
              onRemove={() => {
                updateScenario({ otherAssets: (scenario.otherAssets || []).filter((_, idx) => idx !== i) })
              }}
            />
          ))}
          <button
            className="border border-dashed border-gray-700 rounded-xl p-4 text-gray-600 hover:text-gray-400 hover:border-gray-600 transition-colors flex flex-col items-center justify-center min-h-[88px] gap-1"
            onClick={() => {
              updateScenario({
                otherAssets: [
                  ...(scenario.otherAssets || []),
                  { id: crypto.randomUUID(), name: '', currentValue: 0, annualContribution: 0, returnRate: 0.07, canDrawdown: true },
                ],
              })
            }}
          >
            <span className="text-xl leading-none">+</span>
            <span className="text-xs">Add other asset</span>
          </button>
        </div>
      </Section>

      <Section title={`Debts (${(scenario.debts || []).length})`}>
        <p className="text-sm text-gray-500 mb-3">
          Personal loans, car leases, credit cards — any non-mortgage liabilities. Repayments are deducted from cashflow.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-start">
          {(scenario.debts || []).map((debt, i) => (
            <DebtCard
              key={debt.id}
              item={debt}
              onUpdate={patch => {
                const updated = [...(scenario.debts || [])]
                updated[i] = { ...updated[i], ...patch }
                updateScenario({ debts: updated })
              }}
              onRemove={() => {
                updateScenario({ debts: (scenario.debts || []).filter((_, idx) => idx !== i) })
              }}
            />
          ))}
          <button
            className="border border-dashed border-gray-700 rounded-xl p-4 text-gray-600 hover:text-gray-400 hover:border-gray-600 transition-colors flex flex-col items-center justify-center min-h-[88px] gap-1"
            onClick={() => updateScenario({ debts: [...(scenario.debts || []), createDebtDefaults('personal_loan')] })}
          >
            <span className="text-xl leading-none">+</span>
            <span className="text-xs">Personal loan</span>
          </button>
          <button
            className="border border-dashed border-gray-700 rounded-xl p-4 text-gray-600 hover:text-gray-400 hover:border-gray-600 transition-colors flex flex-col items-center justify-center min-h-[88px] gap-1"
            onClick={() => updateScenario({ debts: [...(scenario.debts || []), createDebtDefaults('lease')] })}
          >
            <span className="text-xl leading-none">+</span>
            <span className="text-xs">Lease</span>
          </button>
          <button
            className="border border-dashed border-gray-700 rounded-xl p-4 text-gray-600 hover:text-gray-400 hover:border-gray-600 transition-colors flex flex-col items-center justify-center min-h-[88px] gap-1"
            onClick={() => updateScenario({ debts: [...(scenario.debts || []), createDebtDefaults('credit_card')] })}
          >
            <span className="text-xl leading-none">+</span>
            <span className="text-xs">Credit card</span>
          </button>
        </div>
      </Section>

      <Section title="Surplus Strategy">
        <p className="text-sm text-gray-500 mb-4">
          When income exceeds expenses, where should the surplus go? Funds flow through in priority order.
          Only assets set to "From surplus" mode appear here.
        </p>
        {(() => {
          const hasSurplusShares = (scenario.shares?.contributionMode || 'surplus') === 'surplus'
          const hasSurplusBonds = (scenario.investmentBonds || []).some(b => b.contributionMode === 'surplus')
          const hasSurplusOtherAssets = (scenario.otherAssets || []).some(a => a.contributionMode === 'surplus')
          const hasSurplusTB = (scenario.treasuryBonds?.contributionMode) === 'surplus'
          const hasSurplusComm = (scenario.commodities?.contributionMode) === 'surplus'

          const defaultOrder = ['offset', 'shares', 'cash']
          let order = [...(scenario.surplusRoutingOrder || defaultOrder)]

          // Auto-add/remove surplus destinations based on which assets are in surplus mode
          if (hasSurplusShares && !order.includes('shares')) order.splice(order.indexOf('cash'), 0, 'shares')
          if (!hasSurplusShares) order = order.filter(d => d !== 'shares')
          if (hasSurplusTB && !order.includes('treasuryBonds')) order.splice(Math.max(0, order.indexOf('cash')), 0, 'treasuryBonds')
          if (!hasSurplusTB) order = order.filter(d => d !== 'treasuryBonds')
          if (hasSurplusComm && !order.includes('commodities')) order.splice(Math.max(0, order.indexOf('cash')), 0, 'commodities')
          if (!hasSurplusComm) order = order.filter(d => d !== 'commodities')
          if (hasSurplusBonds && !order.includes('bonds')) order.splice(Math.max(0, order.indexOf('cash')), 0, 'bonds')
          if (!hasSurplusBonds) order = order.filter(d => d !== 'bonds')
          if (hasSurplusOtherAssets && !order.includes('otherAssets')) order.splice(Math.max(0, order.indexOf('cash')), 0, 'otherAssets')
          if (!hasSurplusOtherAssets) order = order.filter(d => d !== 'otherAssets')
          // Always keep offset and cash
          if (!order.includes('offset')) order.unshift('offset')
          if (!order.includes('cash')) order.push('cash')

          const destLabels = {
            offset: 'Mortgage offset accounts',
            shares: 'Share portfolio',
            treasuryBonds: 'Treasury / corporate bonds',
            commodities: 'Commodities',
            bonds: 'Tax-deferred bonds',
            otherAssets: 'Other assets',
            cash: 'Cash buffer',
          }

          return (
            <div className="border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-700/30 bg-gray-800/10">
              {order.map((dest, i) => (
                <div key={dest} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xs text-gray-600 w-5 shrink-0 text-right">{i + 1}.</span>
                  <select
                    className="compact-input w-72 max-w-full flex-1 text-sm"
                    value={dest}
                    onChange={e => {
                      const newOrder = [...order]
                      const newDest = e.target.value
                      const existingIdx = newOrder.indexOf(newDest)
                      if (existingIdx !== -1) {
                        newOrder[existingIdx] = newOrder[i]
                      }
                      newOrder[i] = newDest
                      updateScenario({ surplusRoutingOrder: newOrder })
                    }}
                  >
                    <option value="offset">{destLabels.offset}</option>
                    {(hasSurplusShares || dest === 'shares') && <option value="shares">{destLabels.shares}</option>}
                    {(hasSurplusTB || dest === 'treasuryBonds') && <option value="treasuryBonds">{destLabels.treasuryBonds}</option>}
                    {(hasSurplusComm || dest === 'commodities') && <option value="commodities">{destLabels.commodities}</option>}
                    {(hasSurplusBonds || dest === 'bonds') && <option value="bonds">{destLabels.bonds}</option>}
                    {(hasSurplusOtherAssets || dest === 'otherAssets') && <option value="otherAssets">{destLabels.otherAssets}</option>}
                    <option value="cash">{destLabels.cash}</option>
                  </select>
                  {i > 0 && (
                    <button
                      className="text-gray-600 hover:text-gray-300 text-xs shrink-0"
                      onClick={() => {
                        const newOrder = [...order]
                        ;[newOrder[i - 1], newOrder[i]] = [newOrder[i], newOrder[i - 1]]
                        updateScenario({ surplusRoutingOrder: newOrder })
                      }}
                    >
                      ▲
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        })()}
        <p className="text-xs text-gray-600 mt-3">
          Each surplus-mode investment gets up to its target contribution. Shares with no target absorb all remaining surplus. Cash absorbs anything left over.
        </p>
      </Section>

      <Section title="Drawdown Strategy">
        <p className="text-sm text-gray-500 mb-4">
          When expenses exceed income (post-retirement), which assets should be sold first to cover the shortfall?
        </p>
        {(() => {
          const defaultOrder = ['cash', 'shares', 'treasuryBonds', 'commodities', 'bonds', 'otherAssets', 'super']
          const order = [...(scenario.drawdownOrder || defaultOrder)]

          const destLabels = {
            cash: 'Cash buffer',
            shares: 'Share portfolio',
            treasuryBonds: 'Treasury / corporate bonds',
            commodities: 'Commodities',
            bonds: 'Tax-deferred bonds',
            otherAssets: 'Other assets',
            super: 'Super (pension phase)',
          }

          return (
            <div className="border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-700/30 bg-gray-800/10">
              {order.map((dest, i) => (
                <div key={dest} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xs text-gray-600 w-5 shrink-0 text-right">{i + 1}.</span>
                  <select
                    className="compact-input w-72 max-w-full flex-1 text-sm"
                    value={dest}
                    onChange={e => {
                      const newOrder = [...order]
                      const newDest = e.target.value
                      const existingIdx = newOrder.indexOf(newDest)
                      if (existingIdx !== -1) {
                        newOrder[existingIdx] = newOrder[i]
                      }
                      newOrder[i] = newDest
                      updateScenario({ drawdownOrder: newOrder })
                    }}
                  >
                    {Object.entries(destLabels).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  {i > 0 && (
                    <button
                      className="text-gray-600 hover:text-gray-300 text-xs shrink-0"
                      onClick={() => {
                        const newOrder = [...order]
                        ;[newOrder[i - 1], newOrder[i]] = [newOrder[i], newOrder[i - 1]]
                        updateScenario({ drawdownOrder: newOrder })
                      }}
                    >
                      ▲
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        })()}
        <p className="text-xs text-gray-600 mt-3">
          Assets are drawn in this order until the shortfall is covered. Super is only available in pension phase. Tax-deferred bonds draw tax-free tranches first.
        </p>
      </Section>

      </div>{/* end divide-y container */}
    </div>
  )
}
