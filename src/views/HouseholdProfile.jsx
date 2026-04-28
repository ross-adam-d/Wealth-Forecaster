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
  alignSalaryPeriodHintSlot = false,
  alignEmployerPackagingSlot = false,
  alignHecsSlot = false,
  alignSalaryChangesCount = 0,
}) {
  const p = person || {}
  const [leaseOpen, setLeaseOpen] = useState(false)
  const hasLease = !!p.packaging?.novatedLease
  const hasSalaryPeriodHint = !!(p.salaryPeriod && p.salaryPeriod !== 'annual' && p.currentSalary > 0)
  const showSalaryPeriodHintSlot = alignSalaryPeriodHintSlot || hasSalaryPeriodHint
  const employerType = p.employerType || 'standard'
  const hasEmployerPackagingFields = employerType === 'pbi_nfp' || employerType === 'qld_health'
  const showEmployerPackagingSlot = alignEmployerPackagingSlot || hasEmployerPackagingFields
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
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Person {label}</h3>

      <div className="flex flex-wrap gap-x-3 gap-y-2 items-end">
        <div>
          <label className="compact-label">Name</label>
          <input
            className="compact-input w-28"
            value={p.name || ''}
            onChange={e => onUpdate({ name: e.target.value })}
            placeholder="e.g. Alex"
          />
        </div>
        <div>
          <label className="compact-label">Date of birth</label>
          <input
            className="compact-input w-36"
            type="date"
            value={p.dateOfBirth || ''}
            onChange={e => onUpdate({ dateOfBirth: e.target.value })}
          />
        </div>
        <div>
          <label className="compact-label">Retire age</label>
          <input
            className="compact-input w-14"
            type="number"
            step="1"
            value={p.retirementAge ?? ''}
            onChange={e => onUpdate({ retirementAge: numVal(e.target.value) })}
            onWheel={e => e.target.blur()}
            placeholder="60"
          />
          {!p.retirementAge && <p className="text-xs text-amber-400 mt-0.5">Required</p>}
        </div>
        <div>
          <label className="compact-label">Gross salary</label>
          <div className="flex gap-1">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                className="compact-input w-28 pl-7"
                type="number"
                step="1"
                value={p.currentSalary ?? ''}
                onChange={e => onUpdate({ currentSalary: numVal(e.target.value) })}
                onWheel={e => e.target.blur()}
                placeholder="0"
              />
            </div>
            <select
              className="compact-input w-24 flex-shrink-0"
              value={p.salaryPeriod || 'annual'}
              onChange={e => onUpdate({ salaryPeriod: e.target.value })}
            >
              <option value="annual">Annual</option>
              <option value="monthly">Monthly</option>
              <option value="fortnightly">F/nightly</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          {showSalaryPeriodHintSlot && (
            <p className={`text-xs mt-0.5 min-h-4 ${hasSalaryPeriodHint ? 'text-gray-500' : 'text-transparent'}`}>
              {hasSalaryPeriodHint
                ? `= $${(p.salaryPeriod === 'weekly' ? p.currentSalary * 52
                  : p.salaryPeriod === 'fortnightly' ? p.currentSalary * 26
                  : p.currentSalary * 12).toLocaleString()}/yr`
                : 'placeholder'}
            </p>
          )}
        </div>
      </div>

      {/* Salary changes — part-time, career breaks, promotions */}
      <div>
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
          <div key={change.id || ci} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 mb-2">
            <div className="flex items-center justify-between mb-2">
              <input
                className="compact-input w-80 max-w-full text-xs mr-2"
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="compact-label">From</label>
                <input
                  className="compact-input w-full"
                  type="number"
                  step="1"
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
              <div>
                <label className="compact-label">To</label>
                <input
                  className="compact-input w-full"
                  type="number"
                  step="1"
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
              <div>
                <label className="compact-label">Salary</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    className="compact-input w-full pl-7"
                    type="number"
                    step="1"
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
              <div>
                <label className="compact-label">Period</label>
                <select
                  className="compact-input w-full"
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
            <p className="text-xs text-gray-500 mt-1">Enter in today's dollars — grows with wages, so projection shows ≈ this amount in real terms</p>
          </div>
        ))}
        {Array.from({ length: Math.max(0, alignSalaryChangesCount - (p.salaryChanges || []).length) }).map((_, i) => (
          <div key={`sc-ph-${i}`} className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 mb-2 opacity-0 pointer-events-none" aria-hidden="true">
            <div className="flex items-center justify-between mb-2">
              <input type="text" readOnly tabIndex={-1} className="compact-input w-80 max-w-full text-xs mr-2" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="compact-label">&nbsp;</label>
                <input type="text" readOnly tabIndex={-1} className="compact-input w-full" />
              </div>
              <div>
                <label className="compact-label">&nbsp;</label>
                <input type="text" readOnly tabIndex={-1} className="compact-input w-full" />
              </div>
              <div>
                <label className="compact-label">&nbsp;</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input type="text" readOnly tabIndex={-1} className="compact-input w-full pl-7" />
                </div>
              </div>
              <div>
                <label className="compact-label">&nbsp;</label>
                <input type="text" readOnly tabIndex={-1} className="compact-input w-full" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">&nbsp;</p>
          </div>
        ))}
      </div>

      {/* HECS/HELP debt */}
      <div className="border-t border-gray-800 pt-4">
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
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="flex flex-wrap gap-x-3 gap-y-2 items-start">
              <CurrencyInput
                label="Current HECS balance"
                value={p.hecs.balance}
                onChange={v => onUpdate({ hecs: { ...p.hecs, balance: v || 0 } })}
                className="max-w-40"
              />
              <CurrencyInput
                label="Extra annual repayment"
                value={p.hecs.extraAnnual || 0}
                onChange={v => onUpdate({ hecs: { ...p.hecs, extraAnnual: v || 0 } })}
                hint="$0 = compulsory minimum only"
                className="max-w-40"
              />
            </div>
          </div>
        )}
        {showHecsSlot && !p.hecs && (
          <div className="p-3 opacity-0 pointer-events-none" aria-hidden="true">
            <div className="flex flex-wrap gap-x-3 gap-y-2 items-start">
              <div className="w-full max-w-40">
                <label className="compact-label">&nbsp;</label>
                <input type="text" readOnly tabIndex={-1} className="compact-input w-full" />
              </div>
              <div className="w-full max-w-40">
                <label className="compact-label">&nbsp;</label>
                <input type="text" readOnly tabIndex={-1} className="compact-input w-full" />
                <p className="text-xs mt-0.5">&nbsp;</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-800 pt-4 space-y-3">
        <div>
          <label className="compact-label">Employer type</label>
          <select
            className="compact-input w-48"
            value={employerType}
            onChange={e => onUpdate({ employerType: e.target.value })}
          >
            <option value="standard">Standard</option>
            <option value="pbi_nfp">PBI / Not-for-profit</option>
            <option value="qld_health">QLD Health / Hospital and Health Service</option>
          </select>
        </div>

      {showEmployerPackagingSlot && (
        hasEmployerPackagingFields ? (
          <div className="flex flex-wrap gap-x-3 gap-y-2 items-start p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            {employerType === 'pbi_nfp' ? (
              <>
                <CurrencyInput
                  label="PBI general packaging"
                  value={p.packaging?.pbiGeneral}
                  max={PBI_GENERAL_CAP}
                  hint={`Max $${PBI_GENERAL_CAP.toLocaleString()}`}
                  onChange={v => onUpdate({ packaging: { ...p.packaging, pbiGeneral: v } })}
                />
                <CurrencyInput
                  label="Meal entertainment"
                  value={p.packaging?.pbiMealEntertainment}
                  max={PBI_MEAL_ENTERTAINMENT_CAP}
                  hint={`Max $${PBI_MEAL_ENTERTAINMENT_CAP.toLocaleString()}`}
                  onChange={v => onUpdate({ packaging: { ...p.packaging, pbiMealEntertainment: v } })}
                />
              </>
            ) : (
              <>
                <CurrencyInput
                  label="QLD Health general cap"
                  value={p.packaging?.qldHealthGeneral}
                  max={QLD_HEALTH_GENERAL_CAP}
                  hint={`Max $${QLD_HEALTH_GENERAL_CAP.toLocaleString()}`}
                  onChange={v => onUpdate({ packaging: { ...p.packaging, qldHealthGeneral: v } })}
                />
                <CurrencyInput
                  label="Meal entertainment"
                  value={p.packaging?.qldHealthMealEntertainment}
                  max={QLD_HEALTH_MEAL_ENTERTAINMENT_CAP}
                  hint={`Max $${QLD_HEALTH_MEAL_ENTERTAINMENT_CAP.toLocaleString()}`}
                  onChange={v => onUpdate({ packaging: { ...p.packaging, qldHealthMealEntertainment: v } })}
                />
              </>
            )}
          </div>
        ) : (
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700" aria-hidden="true">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="compact-label text-transparent">placeholder</label>
                <input type="text" readOnly tabIndex={-1} className="compact-input w-full opacity-0 pointer-events-none" />
                <p className="text-xs mt-0.5 text-transparent">placeholder</p>
              </div>
              <div>
                <label className="compact-label text-transparent">placeholder</label>
                <input type="text" readOnly tabIndex={-1} className="compact-input w-full opacity-0 pointer-events-none" />
                <p className="text-xs mt-0.5 text-transparent">placeholder</p>
              </div>
            </div>
          </div>
        )
      )}

      {/* Novated lease */}
      <div>
        <div className="flex items-center justify-between">
          <span className="compact-label mb-0">Novated lease</span>
          {hasLease ? (
            <div className="flex gap-2">
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
            <button className="btn-ghost text-xs py-1" onClick={addLease}>
              + Add lease
            </button>
          )}
        </div>

        {hasLease && leaseOpen && (
          <div className="mt-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700 space-y-3">
            {/* Financing + core costs */}
            <div className="flex flex-wrap gap-x-3 gap-y-2 items-start">
              <CurrencyInput
                label="Vehicle cost price"
                value={p.packaging.novatedLease.vehicleCostPrice}
                onChange={v => updateLease({ vehicleCostPrice: v })}
                className="max-w-40"
              />
              <CurrencyInput
                label="Residual / balloon"
                value={p.packaging.novatedLease.residualValue}
                onChange={v => updateLease({ residualValue: v })}
                className="max-w-40"
              />
              <CurrencyInput
                label="Annual running costs"
                value={p.packaging.novatedLease.annualRunningCosts}
                onChange={v => updateLease({ annualRunningCosts: v })}
                className="max-w-40"
              />
              <PctInput
                label="Interest rate"
                value={p.packaging.novatedLease.interestRate}
                onChange={v => updateLease({ interestRate: v })}
                className="w-20"
              />
              <div>
                <label className="compact-label">Term (years)</label>
                <input
                  className="compact-input w-16"
                  type="number"
                  step="1"
                  value={p.packaging.novatedLease.termYears || ''}
                  onChange={e => updateLease({ termYears: numVal(e.target.value) || null })}
                  onWheel={e => e.target.blur()}
                  placeholder="5"
                />
              </div>
            </div>

            {/* Usage + active dates */}
            <div className="flex flex-wrap gap-x-3 gap-y-2 items-start">
              <div>
                <label className="compact-label">Total km / year</label>
                <input
                  className="compact-input w-20"
                  type="number"
                  step="1"
                  value={p.packaging.novatedLease.annualKmTotal || ''}
                  onChange={e => updateLease({ annualKmTotal: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="compact-label">Business km / year</label>
                <input
                  className="compact-input w-20"
                  type="number"
                  step="1"
                  value={p.packaging.novatedLease.annualKmBusiness || ''}
                  onChange={e => updateLease({ annualKmBusiness: numVal(e.target.value) })}
                  onWheel={e => e.target.blur()}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="compact-label">Lease start</label>
                <input
                  className="compact-input w-32"
                  type="month"
                  value={p.packaging.novatedLease.activeYears?.from || ''}
                  onChange={e => updateLease({ activeYears: { ...p.packaging.novatedLease.activeYears, from: e.target.value || null } })}
                />
              </div>
              <div>
                <label className="compact-label">Lease end</label>
                <input
                  className="compact-input w-32"
                  type="month"
                  value={p.packaging.novatedLease.activeYears?.to || ''}
                  onChange={e => updateLease({ activeYears: { ...p.packaging.novatedLease.activeYears, to: e.target.value || null } })}
                />
              </div>
            </div>

            {/* Lease payment breakdown */}
            {leasePaymentCalc && leasePaymentCalc.annualPayment > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400 space-y-1">
                <div className="text-gray-300 font-medium mb-1">Lease Payment</div>
                <div>Financed: ${Math.round(leasePaymentCalc.financed).toLocaleString()} (cost − residual)</div>
                <div>Total interest: ${Math.round(leasePaymentCalc.totalInterest).toLocaleString()} (upfront)</div>
                <div className="text-gray-300 font-medium">Annual lease payment: ${Math.round(leasePaymentCalc.annualPayment).toLocaleString()}/yr</div>
                {(p.packaging.novatedLease.residualValue || 0) > 0 && (
                  <div className="text-amber-400">Balloon of ${Math.round(p.packaging.novatedLease.residualValue).toLocaleString()} due at end of term</div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`ev-${label}`}
                  checked={!!p.packaging.novatedLease.isEV}
                  onChange={e => updateLease({ isEV: e.target.checked })}
                />
                <label htmlFor={`ev-${label}`} className="text-sm text-gray-400">
                  Electric / zero-emission vehicle (FBT exempt)
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`ecm-offset-${label}`}
                  checked={!!p.packaging.novatedLease.offsetWithECM}
                  onChange={e => {
                    const offset = e.target.checked
                    const contrib = offset && fbtBreakdown ? fbtBreakdown.offsetContribution : 0
                    updateLease({
                      offsetWithECM: offset,
                      employeePostTaxContribution: contrib,
                    })
                  }}
                />
                <label htmlFor={`ecm-offset-${label}`} className="text-sm text-gray-400">
                  Offset FBT with employee post-tax contribution (auto-calculated)
                </label>
              </div>
            </div>

            {!p.packaging.novatedLease.offsetWithECM && (
              <div className="flex flex-wrap gap-x-3 gap-y-2 items-end">
                <div>
                  <label className="compact-label">FBT method</label>
                  <select
                    className="compact-input w-48"
                    value={p.packaging.novatedLease.method}
                    onChange={e => updateLease({ method: e.target.value })}
                  >
                    <option value="statutory">Statutory (20% flat)</option>
                    <option value="ecm">Operating cost / ECM</option>
                  </select>
                </div>
                <CurrencyInput
                  label="Employee post-tax contribution"
                  value={p.packaging.novatedLease.employeePostTaxContribution}
                  onChange={v => updateLease({ employeePostTaxContribution: v })}
                />
              </div>
            )}

            {/* FBT breakdown */}
            {fbtBreakdown && (
              <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400 space-y-1">
                <div className="text-gray-300 font-medium mb-1">FBT Calculation ({fbtBreakdown.method === 'ev_exempt' ? 'EV exempt' : fbtBreakdown.method === 'ecm' ? 'Operating Cost (ECM)' : 'Statutory'})</div>
                <div>FBT taxable value (cost × 20%): ${Math.round(fbtBreakdown.rawTaxableValue || 0).toLocaleString()}</div>
                <div>Taxable value after contribution: ${Math.round(fbtBreakdown.taxableValue).toLocaleString()}</div>
                <div>FBT liability: ${Math.round(fbtBreakdown.fbtLiability).toLocaleString()}</div>
                <div className="border-t border-gray-700 pt-1 mt-1">Total running costs (lease + running): ${Math.round(fbtBreakdown.totalRunningCosts || 0).toLocaleString()}</div>
                {(fbtBreakdown.employeePostTaxContrib || 0) > 0 && (
                  <div>Less ECM contribution: −${Math.round(fbtBreakdown.employeePostTaxContrib).toLocaleString()}</div>
                )}
                <div className="text-gray-300">Pre-tax packaging reduction: ${Math.round(fbtBreakdown.pretaxPackageReduction).toLocaleString()}/yr</div>
                <div>Est. income tax saving (@ 45%): ${Math.round(fbtBreakdown.incomeTaxSaving).toLocaleString()}</div>
                {p.packaging.novatedLease.offsetWithECM && (
                  <div className="text-sky-400">FBT offset: contributing ${Math.round(fbtBreakdown.offsetContribution || 0).toLocaleString()}/yr post-tax to eliminate FBT</div>
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

      <div className="flex flex-wrap gap-x-3 gap-y-2 items-start">
        <CurrencyInput
          label="Current balance"
          value={s.currentBalance}
          onChange={v => onUpdate({ currentBalance: v })}
          className="max-w-40"
        />
        <div className="min-w-[23rem]">
          <label className="compact-label">Employer scheme</label>
          <div className="grid grid-cols-[13rem_9rem] gap-2 items-start">
            <select
              className="compact-input w-52"
              value={employerScheme}
              onChange={e => onUpdate({ employerScheme: e.target.value })}
            >
              <option value="sg">Standard SG (auto-stepped)</option>
              <option value="match">Employer match</option>
              <option value="fixed_pct">Fixed employer %</option>
            </select>
            {showEmployerPctSlot && (
              hasEmployerPctInput ? (
                <PctInput
                  label=""
                  value={employerScheme === 'match' ? s.employerMatchCapPct : s.employerFixedPct}
                  onChange={v =>
                    onUpdate(
                      employerScheme === 'match'
                        ? { employerMatchCapPct: v }
                        : { employerFixedPct: v }
                    )
                  }
                  hint={employerScheme === 'match' ? 'Match cap %' : 'Employer %'}
                  className="w-36"
                />
              ) : (
                <div className="w-36" aria-hidden="true">
                  <label className="compact-label">&nbsp;</label>
                  <input type="text" readOnly tabIndex={-1} className="compact-input w-full opacity-0 pointer-events-none" />
                  <p className="text-xs mt-0.5 text-transparent">placeholder</p>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <CurrencyInput
            label="Salary sacrifice"
            value={s.salarySacrificeAmount}
            onChange={v => onUpdate({ salarySacrificeAmount: v })}
            hint={`SG est. $${Math.round(sgEstimate).toLocaleString()} · Cap $${CONCESSIONAL_CAP.toLocaleString()}`}
            className="max-w-40"
          />
          <p className={`text-xs mt-1 min-h-4 ${concessionalBreached ? 'text-amber-400' : 'text-transparent'}`}>
            {concessionalBreached
              ? `Cap exceeded — $${Math.round(totalConcessional).toLocaleString()} vs $${CONCESSIONAL_CAP.toLocaleString()}`
              : 'placeholder'}
          </p>
        </div>
        <CurrencyInput
          label="Extra concessional"
          value={s.voluntaryConcessional}
          onChange={v => onUpdate({ voluntaryConcessional: v })}
          className="max-w-40"
        />
        <div>
          <CurrencyInput
            label="Non-concessional"
            value={s.voluntaryNonConcessional}
            onChange={v => onUpdate({ voluntaryNonConcessional: v })}
            hint={`Cap $${NON_CONCESSIONAL_CAP.toLocaleString()}`}
            max={nccBreached ? NON_CONCESSIONAL_CAP : undefined}
            className="max-w-40"
          />
          <p className={`text-xs mt-1 min-h-4 ${nccBreached ? 'text-amber-400' : 'text-transparent'}`}>
            {nccBreached ? 'Exceeds annual cap' : 'placeholder'}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-800 pt-3 space-y-3">
        <div className="flex items-center gap-2 h-8">
          <input
            type="checkbox"
            id={`ttr-${personLabel}`}
            className="shrink-0"
            checked={!!s.isTTR}
            onChange={e => onUpdate({ isTTR: e.target.checked })}
          />
          <label htmlFor={`ttr-${personLabel}`} className="text-sm leading-5 text-gray-400">
            Transition to Retirement (TTR) income stream active
          </label>
        </div>
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
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`primary-${index}`}
              checked={!!p.isPrimaryResidence}
              onChange={e => onUpdate({ isPrimaryResidence: e.target.checked })}
            />
            <label htmlFor={`primary-${index}`} className="text-sm text-gray-400">
              Primary residence (CGT-exempt, excluded from assets test)
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="w-full">
              <label className="compact-label">State</label>
              <select
                className="compact-input w-full max-w-24"
                value={p.state || ''}
                onChange={e => onUpdate({ state: e.target.value || null })}
              >
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
            <CurrencyInput
              label="Current value"
              value={p.currentValue}
              onChange={v => onUpdate({ currentValue: v })}
              className="max-w-44"
            />
            <CurrencyInput
              label="Purchase price"
              value={p.purchasePrice}
              onChange={v => onUpdate({ purchasePrice: v })}
              className="max-w-44"
            />
            <PctInput
              label="Growth rate"
              value={p.growthRate ?? 0.04}
              onChange={v => onUpdate({ growthRate: v })}
              step={0.1}
              hint="Annual capital growth"
              className="max-w-40"
            />
            {p.isPrimaryResidence && (
              <div className="w-full">
                <label className="compact-label text-transparent">Toggle</label>
                <label className="flex items-center gap-1.5 cursor-pointer min-h-8">
                  <input
                    type="checkbox"
                    checked={!!p.isFirstHomeBuyer}
                    onChange={e => onUpdate({ isFirstHomeBuyer: e.target.checked })}
                    className="accent-brand-500"
                  />
                  <span className="text-xs text-gray-400">First home buyer</span>
                </label>
              </div>
            )}
          </div>

          {p.state && p.purchasePrice > 0 && (() => {
            const duty = calcStampDuty(p.purchasePrice, p.state, !!p.isFirstHomeBuyer, !!p.isPrimaryResidence)
            const landTaxAmt = !p.isPrimaryResidence ? calcLandTax(p.currentValue || p.purchasePrice, p.state) : 0
            return (
              <div className="flex flex-wrap gap-4 text-xs">
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

          <div className="border-t border-gray-800 pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
            <div className="w-full">
              <label className="compact-label">Purchase date</label>
              <input
                className="compact-input w-full max-w-40"
                type="date"
                value={p.purchaseDate || ''}
                onChange={e => onUpdate({ purchaseDate: e.target.value })}
              />
            </div>
            <div className="w-full">
              <label className="compact-label">Purchase method</label>
              <select
                className="compact-input w-full max-w-44"
                value={p.purchasedCash ? 'cash' : 'mortgage'}
                onChange={e => {
                  const isCash = e.target.value === 'cash'
                  onUpdate({
                    purchasedCash: isCash,
                    ...(isCash ? { mortgageBalance: 0, loanTermYearsRemaining: 0, interestRate: 0, offsetBalance: 0 } : {}),
                  })
                }}
              >
                <option value="mortgage">Mortgage</option>
                <option value="cash">Purchased with cash</option>
              </select>
            </div>
            <MonthYearInput
              label="Future purchase date"
              value={p.futurePurchaseYear}
              onChange={v => onUpdate({ futurePurchaseYear: v })}
              placeholder="Year"
            />
          </div>

          {!p.purchasedCash && (
            <div className="border-t border-gray-800 pt-4 space-y-3">
              <div className="flex flex-wrap gap-x-3 gap-y-2 items-start">
                <CurrencyInput
                  label="Outstanding mortgage"
                  value={p.mortgageBalance}
                  onChange={v => {
                    const patch = { mortgageBalance: v }
                    if (!p.originalLoanAmount && v > 0) patch.originalLoanAmount = v
                    onUpdate(patch)
                  }}
                  className="max-w-44"
                />
                <PctInput
                  label="Interest rate"
                  value={p.interestRate}
                  onChange={v => onUpdate({ interestRate: v })}
                  step={0.05}
                  className="w-20"
                />
                <div>
                  <label className="compact-label">Yrs remaining</label>
                  <input
                    className="compact-input w-16"
                    type="number"
                    step="1"
                    value={p.loanTermYearsRemaining || ''}
                    onChange={e => {
                      const yrs = numVal(e.target.value)
                      const patch = { loanTermYearsRemaining: yrs }
                      if (!p.originalLoanTermYears && yrs > 0) patch.originalLoanTermYears = yrs
                      onUpdate(patch)
                    }}
                    onWheel={e => e.target.blur()}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="compact-label">Loan type</label>
                  <select
                    className="compact-input w-44"
                    value={p.loanType || 'pi'}
                    onChange={e => onUpdate({ loanType: e.target.value })}
                  >
                    <option value="pi">Principal & Interest</option>
                    <option value="io">Interest Only</option>
                  </select>
                </div>
              </div>

              {p.loanType === 'io' && (
                <div>
                  <label className="compact-label">IO period ends (year)</label>
                  <input
                    className="compact-input w-24"
                    type="number"
                    step="1"
                    value={p.ioEndYear || ''}
                    onChange={e => onUpdate({ ioEndYear: numVal(e.target.value) })}
                    onWheel={e => e.target.blur()}
                    placeholder="2028"
                  />
                  <p className="text-xs text-amber-400 mt-1">
                    Repayments step up to P&I at IO expiry
                  </p>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={p.hasOffset || false}
                  onChange={e => onUpdate({ hasOffset: e.target.checked })}
                  className="accent-brand-500"
                />
                <span className="text-sm text-gray-300">Mortgage offset account</span>
              </label>
              {p.hasOffset && (
                <p className="text-xs text-gray-500 mb-2">
                  Your cash / savings balance (entered above) will offset this mortgage, reducing the interest charged each year.
                </p>
              )}

              {p.mortgageBalance > 0 && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={p.payOffWhenAble || false}
                    onChange={e => onUpdate({ payOffWhenAble: e.target.checked })}
                    className="accent-brand-500"
                  />
                  <span className="text-sm text-gray-300">Pay off mortgage when liquid assets can cover it</span>
                </label>
              )}
            </div>
          )}

          {!p.isPrimaryResidence && (
            <div className="border-t border-gray-800 pt-4 flex flex-wrap gap-x-3 gap-y-2 items-end">
              <CurrencyInput
                label="Annual rental income"
                value={p.annualRentalIncome}
                onChange={v => onUpdate({ annualRentalIncome: v })}
                className="max-w-44"
              />
              <CurrencyInput
                label="Annual property expenses"
                value={p.annualPropertyExpenses}
                onChange={v => onUpdate({ annualPropertyExpenses: v })}
                hint="Rates, insurance, management fees"
                className="max-w-44"
              />
            </div>
          )}

          <div className="border-t border-gray-800 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="compact-label">CGT ownership — Person A</label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0} max={100} step={5}
                  value={p.ownershipPctA ?? 100}
                  onChange={e => onUpdate({ ownershipPctA: numVal(e.target.value) })}
                  className="flex-1 accent-brand-500"
                />
                <span className="text-sm font-medium text-white w-12 text-right">
                  {p.ownershipPctA ?? 100}% / {100 - (p.ownershipPctA ?? 100)}%
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">How CGT is split between A and B on sale</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Sale event</span>
              {!p.saleEvent ? (
                <button
                  className="btn-ghost text-xs py-1"
                  onClick={() => onUpdate({ saleEvent: { year: new Date().getFullYear() + 10, destination: 'shares' } })}
                >
                  + Add sale
                </button>
              ) : (
                <button
                  className="btn-ghost text-xs py-1 text-red-400 hover:text-red-300"
                  onClick={() => onUpdate({ saleEvent: null })}
                >
                  Remove
                </button>
              )}
            </div>
            {p.saleEvent && (
              <div className="space-y-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex flex-wrap gap-x-3 gap-y-2 items-end">
                  <MonthYearInput
                    label="Sale date"
                    value={p.saleEvent.year}
                    onChange={v => onUpdate({ saleEvent: { ...p.saleEvent, year: v } })}
                    placeholder="Year"
                    nullable={false}
                  />
                  <div>
                    <label className="compact-label">Route proceeds to</label>
                    <select
                      className="compact-input w-44"
                      value={p.saleEvent.destination || 'cash'}
                      onChange={e => onUpdate({ saleEvent: { ...p.saleEvent, destination: e.target.value } })}
                    >
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
                </div>
                <PctInput
                  label="Selling costs (agent, conveyancing, marketing)"
                  value={p.saleEvent.sellingCostsPct ?? DEFAULT_SELLING_COSTS_PCT}
                  onChange={v => onUpdate({ saleEvent: { ...p.saleEvent, sellingCostsPct: v } })}
                  min={0} max={15} step={0.1}
                  hint={`Estimated ${((p.saleEvent.sellingCostsPct ?? DEFAULT_SELLING_COSTS_PCT) * (p.currentValue || 0)).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })} at current value`}
                />
                {(() => {
                  const { fyEndYear } = currentAustralianFY()
                  const saleYearVal = extractYear(p.saleEvent.year)
                  if (!saleYearVal || saleYearVal > fyEndYear) return null
                  return (
                    <CurrencyInput
                      label="Actual sale price (current/past FY)"
                      value={p.saleEvent.actualSalePrice}
                      onChange={v => onUpdate({ saleEvent: { ...p.saleEvent, actualSalePrice: v } })}
                      hint="Used for CGT calculation — overrides projected value"
                    />
                  )
                })()}
              </div>
            )}
          </div>
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
      <div className="flex flex-wrap gap-x-3 gap-y-2 items-end">
        <CurrencyInput
          label="Current portfolio value"
          value={s.currentValue}
          onChange={v => onUpdate({ currentValue: v })}
        />
        <CurrencyInput
          label={mode === 'surplus' ? 'Target annual contribution' : 'Annual contribution'}
          value={s.annualContribution}
          onChange={v => onUpdate({ annualContribution: v })}
          className="max-w-40"
        />
      </div>
      <div>
        <label className="compact-label">Contribution mode</label>
        <div className="flex gap-2 mt-1">
          <button
            className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${
              mode === 'fixed'
                ? 'bg-brand-600/20 border-brand-500 text-brand-500'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => onUpdate({ contributionMode: 'fixed' })}
          >
            Fixed expense
          </button>
          <button
            className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${
              mode === 'surplus'
                ? 'bg-brand-600/20 border-brand-500 text-brand-500'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => onUpdate({ contributionMode: 'surplus' })}
          >
            From surplus
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5">
          {mode === 'fixed'
            ? 'Deducted from cashflow each year like an expense — guaranteed contribution.'
            : 'Funded from surplus only — set priority in Surplus Strategy below. No surplus = no contribution.'}
        </p>
      </div>
      <div className="border-t border-gray-800 pt-4 flex flex-wrap gap-x-3 gap-y-2 items-start">
        <PctInput
          label="Annual increase"
          value={s.annualIncreaseRate || 0}
          onChange={v => onUpdate({ annualIncreaseRate: v })}
          min={0}
          max={50}
          step={1}
          hint="Contribution grows by this % each year"
        />
        <PctInput
          label="Dividend yield"
          value={s.dividendYield}
          onChange={v => onUpdate({ dividendYield: v })}
          hint="Annual cash dividends"
        />
        <PctInput
          label="Franking credit %"
          value={s.frankingPct}
          onChange={v => onUpdate({ frankingPct: v })}
          step={5}
          hint="% fully franked"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="preserve-capital"
          checked={!!s.preserveCapital}
          onChange={e => onUpdate({ preserveCapital: e.target.checked })}
        />
        <label htmlFor="preserve-capital" className="text-sm text-gray-400">
          Preserve capital — no drawdown from share portfolio
        </label>
      </div>
      {s.preserveCapital && (
        <div>
          <label className="compact-label">Preserve capital from age</label>
          <input
            className="compact-input w-14"
            type="number"
            step="1"
            value={s.preserveCapitalFromAge || ''}
            onChange={e => onUpdate({ preserveCapitalFromAge: numVal(e.target.value) })}
            onWheel={e => e.target.blur()}
            placeholder="65"
          />
        </div>
      )}
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
              className="compact-input w-32 text-right text-sm"
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
                  className="compact-input w-32 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
                  className="compact-input w-20 text-right text-sm"
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
                  className="compact-input w-20 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
                    className="compact-input w-20 text-right text-sm"
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
                    className="compact-input w-20 text-right text-sm"
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
                  className="compact-input w-20 text-right text-sm"
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
                  className="compact-input w-20 text-right text-sm"
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
                    className="compact-input w-20 text-right text-sm"
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
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
      <div className="flex flex-wrap gap-x-3 gap-y-2 items-end">
        <CurrencyInput
          label="Current portfolio value"
          value={b.currentValue}
          onChange={v => onUpdate({ currentValue: v })}
        />
        <CurrencyInput
          label={mode === 'surplus' ? 'Target annual contribution' : 'Annual contribution'}
          value={b.annualContribution}
          onChange={v => onUpdate({ annualContribution: v })}
          className="max-w-40"
        />
      </div>
      <div>
        <label className="compact-label">Contribution mode</label>
        <div className="flex gap-2 mt-1">
          <button
            className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${
              mode === 'fixed'
                ? 'bg-brand-600/20 border-brand-500 text-brand-500'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => onUpdate({ contributionMode: 'fixed' })}
          >
            Fixed expense
          </button>
          <button
            className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${
              mode === 'surplus'
                ? 'bg-brand-600/20 border-brand-500 text-brand-500'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => onUpdate({ contributionMode: 'surplus' })}
          >
            From surplus
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5">
          {mode === 'fixed'
            ? 'Deducted from cashflow each year like an expense — guaranteed contribution.'
            : 'Funded from surplus only — set priority in Surplus Strategy below. No surplus = no contribution.'}
        </p>
      </div>
      <div className="border-t border-gray-800 pt-4 flex flex-wrap gap-x-3 gap-y-2 items-start">
        <PctInput
          label="Annual increase"
          value={b.annualIncreaseRate || 0}
          onChange={v => onUpdate({ annualIncreaseRate: v })}
          min={0}
          max={50}
          step={1}
          hint="Grows by this % each year"
        />
        <PctInput
          label="Coupon rate"
          value={b.couponRate}
          onChange={v => onUpdate({ couponRate: v })}
          hint="Taxed as ordinary income"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="tb-preserve-capital"
          checked={!!b.preserveCapital}
          onChange={e => onUpdate({ preserveCapital: e.target.checked })}
        />
        <label htmlFor="tb-preserve-capital" className="text-sm text-gray-400">
          Preserve capital — no drawdown from bond portfolio
        </label>
      </div>
      {b.preserveCapital && (
        <div>
          <label className="compact-label">Preserve capital from age</label>
          <input
            className="compact-input w-14"
            type="number"
            step="1"
            value={b.preserveCapitalFromAge || ''}
            onChange={e => onUpdate({ preserveCapitalFromAge: numVal(e.target.value) })}
            onWheel={e => e.target.blur()}
            placeholder="65"
          />
        </div>
      )}
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
      <div className="flex flex-wrap gap-x-3 gap-y-2 items-end">
        <CurrencyInput
          label="Current portfolio value"
          value={c.currentValue}
          onChange={v => onUpdate({ currentValue: v })}
        />
        <CurrencyInput
          label={mode === 'surplus' ? 'Target annual contribution' : 'Annual contribution'}
          value={c.annualContribution}
          onChange={v => onUpdate({ annualContribution: v })}
          className="max-w-40"
        />
      </div>
      <div>
        <label className="compact-label">Contribution mode</label>
        <div className="flex gap-2 mt-1">
          <button
            className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${
              mode === 'fixed'
                ? 'bg-brand-600/20 border-brand-500 text-brand-500'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => onUpdate({ contributionMode: 'fixed' })}
          >
            Fixed expense
          </button>
          <button
            className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${
              mode === 'surplus'
                ? 'bg-brand-600/20 border-brand-500 text-brand-500'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => onUpdate({ contributionMode: 'surplus' })}
          >
            From surplus
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1.5">
          {mode === 'fixed'
            ? 'Deducted from cashflow each year like an expense — guaranteed contribution.'
            : 'Funded from surplus only — set priority in Surplus Strategy below. No surplus = no contribution.'}
        </p>
      </div>
      <div className="border-t border-gray-800 pt-4 flex flex-wrap gap-x-3 gap-y-2 items-start">
        <PctInput
          label="Annual increase"
          value={c.annualIncreaseRate || 0}
          onChange={v => onUpdate({ annualIncreaseRate: v })}
          min={0}
          max={50}
          step={1}
          hint="Grows by this % each year"
        />
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
              className="compact-input w-32 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
              className="compact-input w-32 text-right text-sm"
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
          <div className="px-4 py-3 space-y-3 bg-gray-800/10" style={{ paddingLeft: `${16 + indentPx}px` }}>
            <div className="flex flex-wrap gap-x-3 gap-y-2 items-start">
              <CurrencyInput
                label={hasChildren ? 'Own amount (excl. children)' : 'Amount'}
                value={item.amount}
                onChange={v => onUpdate({ amount: v })}
                className="max-w-40"
              />
              <div>
                <label className="compact-label">Amount type</label>
                <select
                  className="compact-input w-40"
                  value={item.amountType || 'annual'}
                  onChange={e => {
                    const newType = e.target.value
                    const patch = { amountType: newType }
                    if (newType === 'one_off') patch.activeTo = null
                    if (newType === 'recurring' && !item.recurringEveryYears) patch.recurringEveryYears = 5
                    if (newType !== 'recurring') patch.recurringEveryYears = null
                    onUpdate(patch)
                  }}
                >
                  <option value="annual">Annual</option>
                  <option value="monthly">Monthly (×12)</option>
                  <option value="one_off">One-off</option>
                  <option value="recurring">Recurring (other)</option>
                </select>
              </div>
            </div>

            {item.amountType === 'recurring' && (
              <div className="flex flex-wrap gap-x-3 gap-y-2 items-end">
                <div>
                  <label className="compact-label">Every X years</label>
                  <input
                    className="compact-input w-20"
                    type="number"
                    step="1"
                    value={item.recurringEveryYears || ''}
                    onChange={e => onUpdate({ recurringEveryYears: numVal(e.target.value) || null })}
                    onWheel={e => e.target.blur()}
                    placeholder="10"
                  />
                </div>
                <p className="text-xs text-gray-500 self-end pb-2">
                  Fires in {extractYear(item.activeFrom) || '?'}, then every {item.recurringEveryYears || '?'} years{item.activeTo ? ` until ${extractYear(item.activeTo)}` : ''}
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`disc-${item.id}`}
                checked={!!item.isDiscretionary}
                onChange={e => onUpdate({ isDiscretionary: e.target.checked })}
              />
              <label htmlFor={`disc-${item.id}`} className="text-sm text-gray-400">
                Discretionary
              </label>
            </div>

            <div className="border-t border-gray-800 pt-3">
              {item.amountType === 'one_off' ? (
                <div className="flex flex-wrap gap-x-3 gap-y-2 items-start">
                  <MonthYearInput
                    label="Date"
                    value={item.activeFrom}
                    onChange={v => onUpdate({ activeFrom: v, activeTo: null })}
                    placeholder={planStartYear ? String(planStartYear) : 'Year'}
                  />
                </div>
              ) : (
                <div className="flex flex-wrap gap-x-3 gap-y-2 items-start">
                  <MonthYearInput
                    label="Start"
                    value={item.activeFrom}
                    onChange={v => onUpdate({ activeFrom: v })}
                    placeholder={planStartYear ? String(planStartYear) : 'Year'}
                  />
                  <MonthYearInput
                    label="End"
                    value={item.activeTo}
                    onChange={v => onUpdate({ activeTo: v })}
                    placeholder="Ongoing"
                  />
                </div>
              )}
            </div>
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
              className="compact-input w-32 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
                  className="compact-input w-20 text-right text-sm"
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
                  className="compact-input w-20 text-right text-sm"
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
              className="compact-input w-32 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
                  className="compact-input w-16 text-right text-sm"
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
                  className="compact-input w-20 text-right text-sm"
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
                  className="compact-input w-20 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
              className="compact-input w-32 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
                className="compact-input w-20 text-right text-sm"
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
            const hasSharedSalaryPeriodHint =
              ((personA.salaryPeriod || 'annual') !== 'annual' && (personA.currentSalary || 0) > 0) ||
              ((personB.salaryPeriod || 'annual') !== 'annual' && (personB.currentSalary || 0) > 0)
            const hasSharedEmployerPackaging =
              (personA.employerType || 'standard') !== 'standard' ||
              (personB.employerType || 'standard') !== 'standard'
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
                  alignSalaryPeriodHintSlot={hasSharedSalaryPeriodHint}
                  alignEmployerPackagingSlot={hasSharedEmployerPackaging}
                  alignHecsSlot={hasSharedHecs}
                  alignSalaryChangesCount={maxSalaryChanges}
                />
                <PersonForm
                  person={personB}
                  label="B"
                  onUpdate={updatePersonB}
                  alignSalaryPeriodHintSlot={hasSharedSalaryPeriodHint}
                  alignEmployerPackagingSlot={hasSharedEmployerPackaging}
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
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-3 gap-y-2 items-start">
            <CurrencyInput
              label="Cash / savings balance"
              value={scenario.cashSavings ?? 0}
              onChange={v => updateScenario({ cashSavings: v })}
              hint="If linked to mortgage offset, tick that property's offset checkbox."
            />
            <CurrencyInput
              label="Minimum cash buffer"
              value={scenario.minCashBuffer ?? 0}
              onChange={v => updateScenario({ minCashBuffer: v })}
              hint="Floor — sim won't draw below this level."
              className="max-w-40"
            />
          </div>
          <p className="text-xs text-gray-500">
            Cash earns no return. Surplus accumulates here unless routed elsewhere via the Surplus Strategy.
          </p>
        </div>
      </Section>

      <Section title="Share Portfolio">
        <SharesForm shares={scenario.shares} onUpdate={updateShares} />
        <div className="mt-3 pt-3 border-t border-gray-800">
          <CurrencyInput
            label="Capital losses carried forward (prior FY)"
            value={scenario.capitalLossesCarriedForward ?? 0}
            onChange={v => updateScenario({ capitalLossesCarriedForward: v })}
            hint="Offset this FY's net gains"
            className="max-w-40"
          />
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-start">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-start">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-start">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-start">
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
            <div className="space-y-3">
              {order.map((dest, i) => (
                <div key={dest} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-5 text-right">{i + 1}.</span>
                  <select
                    className="compact-input w-72 max-w-full text-sm py-1.5"
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
                      className="text-gray-600 hover:text-gray-300 text-xs"
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
            <div className="space-y-3">
              {order.map((dest, i) => (
                <div key={dest} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-5 text-right">{i + 1}.</span>
                  <select
                    className="compact-input w-72 max-w-full text-sm py-1.5"
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
                      className="text-gray-600 hover:text-gray-300 text-xs"
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
