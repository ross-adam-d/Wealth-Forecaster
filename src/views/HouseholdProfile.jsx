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
import {
  createDefaultShareHolding,
  createDefaultSuperHolding,
  createDefaultTreasuryBondHolding,
  createDefaultCommodityHolding,
} from '../utils/schema.js'

// ── Shared primitives ─────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card">
      <button
        className="w-full flex items-center justify-between text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-sm font-semibold text-gray-300">{title}</span>
        <span className="text-gray-500 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="mt-5">{children}</div>}
    </div>
  )
}

/** Parse a numeric input value — returns '' when field is empty (allows clearing) */
function numVal(raw) {
  if (raw === '' || raw == null) return ''
  const n = Number(raw)
  return isNaN(n) ? '' : n
}

function CurrencyInput({ label, value, onChange, hint, max }) {
  const over = max != null && Number(value) > max
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
        <input
          className="input w-full pl-7"
          type="number"
          min={0}
          value={value ?? ''}
          onChange={e => onChange(numVal(e.target.value))}
          placeholder="0"
        />
      </div>
      {hint && !over && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      {over && <p className="text-xs text-amber-400 mt-1">Exceeds cap of ${max.toLocaleString()}</p>}
    </div>
  )
}

function PctInput({ label, value, onChange, min = 0, max = 100, step = 0.1, hint }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input
          className="input w-full pr-8"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value != null && value !== '' ? (value * 100).toFixed(step < 1 ? 1 : 0) : ''}
          onChange={e => {
            const v = numVal(e.target.value)
            onChange(v === '' ? '' : v / 100)
          }}
          placeholder="0"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
      </div>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

// ── Person form ───────────────────────────────────────────────────────────

function PersonForm({ person, label, onUpdate }) {
  const p = person || {}
  const [leaseOpen, setLeaseOpen] = useState(false)
  const hasLease = !!p.packaging?.novatedLease

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
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-300">Person {label}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Name</label>
          <input
            className="input w-full"
            value={p.name || ''}
            onChange={e => onUpdate({ name: e.target.value })}
            placeholder="e.g. Alex"
          />
        </div>
        <div>
          <label className="label">Date of birth</label>
          <input
            className="input w-full"
            type="date"
            value={p.dateOfBirth || ''}
            onChange={e => onUpdate({ dateOfBirth: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="label">Current salary (gross)</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                className="input w-full pl-7"
                type="number"
                min={0}
                value={p.currentSalary ?? ''}
                onChange={e => onUpdate({ currentSalary: numVal(e.target.value) })}
                placeholder="0"
              />
            </div>
            <select
              className="input w-28 flex-shrink-0"
              value={p.salaryPeriod || 'annual'}
              onChange={e => onUpdate({ salaryPeriod: e.target.value })}
            >
              <option value="annual">Annual</option>
              <option value="monthly">Monthly</option>
              <option value="fortnightly">F/nightly</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          {p.salaryPeriod && p.salaryPeriod !== 'annual' && p.currentSalary > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              = ${(p.salaryPeriod === 'weekly' ? p.currentSalary * 52
                : p.salaryPeriod === 'fortnightly' ? p.currentSalary * 26
                : p.currentSalary * 12).toLocaleString()}/yr
            </p>
          )}
        </div>
        <div>
          <label className="label">Retirement age</label>
          <input
            className="input w-full"
            type="number"
            min={40}
            max={80}
            value={p.retirementAge ?? ''}
            onChange={e => onUpdate({ retirementAge: numVal(e.target.value) })}
            placeholder="60"
          />
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
                className="input flex-1 text-xs mr-2"
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
                <label className="label">From</label>
                <input
                  className="input w-full"
                  type="number"
                  min={2020}
                  max={2080}
                  value={change.fromYear ?? ''}
                  onChange={e => {
                    const changes = [...(p.salaryChanges || [])]
                    changes[ci] = { ...changes[ci], fromYear: numVal(e.target.value) }
                    onUpdate({ salaryChanges: changes })
                  }}
                  placeholder="Year"
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  className="input w-full"
                  type="number"
                  min={2020}
                  max={2080}
                  value={change.toYear ?? ''}
                  onChange={e => {
                    const changes = [...(p.salaryChanges || [])]
                    changes[ci] = { ...changes[ci], toYear: numVal(e.target.value) || null }
                    onUpdate({ salaryChanges: changes })
                  }}
                  placeholder="Ongoing"
                />
              </div>
              <div>
                <label className="label">Salary</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    className="input w-full pl-7"
                    type="number"
                    min={0}
                    value={change.salary ?? ''}
                    onChange={e => {
                      const changes = [...(p.salaryChanges || [])]
                      changes[ci] = { ...changes[ci], salary: numVal(e.target.value) }
                      onUpdate({ salaryChanges: changes })
                    }}
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="label">Period</label>
                <select
                  className="input w-full"
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
      </div>

      <div>
        <label className="label">Employer type</label>
        <select
          className="input w-full"
          value={p.employerType || 'standard'}
          onChange={e => onUpdate({ employerType: e.target.value })}
        >
          <option value="standard">Standard</option>
          <option value="pbi_nfp">PBI / Not-for-profit</option>
          <option value="qld_health">QLD Health / Hospital and Health Service</option>
        </select>
      </div>

      {p.employerType === 'pbi_nfp' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
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
        </div>
      )}

      {p.employerType === 'qld_health' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
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
        </div>
      )}

      {/* Novated lease */}
      <div>
        <div className="flex items-center justify-between">
          <span className="label mb-0">Novated lease</span>
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
          <div className="mt-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CurrencyInput
                label="Vehicle cost price"
                value={p.packaging.novatedLease.vehicleCostPrice}
                onChange={v => updateLease({ vehicleCostPrice: v })}
              />
              <CurrencyInput
                label="Residual / balloon value"
                value={p.packaging.novatedLease.residualValue}
                onChange={v => updateLease({ residualValue: v })}
              />
              <div>
                <label className="label">Term (years)</label>
                <input
                  className="input w-full"
                  type="number"
                  min={1}
                  max={10}
                  value={p.packaging.novatedLease.termYears || ''}
                  onChange={e => updateLease({ termYears: numVal(e.target.value) || null })}
                  placeholder="5"
                />
              </div>
              <PctInput
                label="Interest rate"
                value={p.packaging.novatedLease.interestRate}
                onChange={v => updateLease({ interestRate: v })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CurrencyInput
                label="Annual running costs"
                value={p.packaging.novatedLease.annualRunningCosts}
                onChange={v => updateLease({ annualRunningCosts: v })}
              />
              <div>
                <label className="label">Total km / year</label>
                <input
                  className="input w-full"
                  type="number"
                  value={p.packaging.novatedLease.annualKmTotal || ''}
                  onChange={e => updateLease({ annualKmTotal: numVal(e.target.value) })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label">Business km / year</label>
                <input
                  className="input w-full"
                  type="number"
                  value={p.packaging.novatedLease.annualKmBusiness || ''}
                  onChange={e => updateLease({ annualKmBusiness: numVal(e.target.value) })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Lease start (month/year)</label>
                <input
                  className="input w-full"
                  type="month"
                  value={p.packaging.novatedLease.activeYears?.from || ''}
                  onChange={e => updateLease({ activeYears: { ...p.packaging.novatedLease.activeYears, from: e.target.value || null } })}
                />
              </div>
              <div>
                <label className="label">Lease end (month/year)</label>
                <input
                  className="input w-full"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">FBT method</label>
                  <select
                    className="input w-full"
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
  )
}

// ── Super form ────────────────────────────────────────────────────────────

function SuperForm({ superProfile, personLabel, grossSalary, onUpdate }) {
  const s = superProfile || {}
  // Use FY2026 SG rate (12%) for the estimate shown to user
  const sgEstimate = (grossSalary || 0) * 0.12
  const totalConcessional =
    sgEstimate + (s.salarySacrificeAmount || 0) + (s.voluntaryConcessional || 0)
  const concessionalBreached = totalConcessional > CONCESSIONAL_CAP
  const nccBreached = (s.voluntaryNonConcessional || 0) > NON_CONCESSIONAL_CAP

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-300">Person {personLabel}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CurrencyInput
          label="Current balance"
          value={s.currentBalance}
          onChange={v => onUpdate({ currentBalance: v })}
        />
        <div>
          <label className="label">Employer scheme</label>
          <select
            className="input w-full"
            value={s.employerScheme || 'sg'}
            onChange={e => onUpdate({ employerScheme: e.target.value })}
          >
            <option value="sg">Standard SG (auto-stepped)</option>
            <option value="match">Employer match</option>
            <option value="fixed_pct">Fixed employer %</option>
          </select>
        </div>
      </div>

      {s.employerScheme === 'match' && (
        <PctInput
          label="Employer match cap (% of salary)"
          value={s.employerMatchCapPct}
          onChange={v => onUpdate({ employerMatchCapPct: v })}
          hint="Total contribution = SG + match up to this cap"
        />
      )}

      {s.employerScheme === 'fixed_pct' && (
        <PctInput
          label="Total employer contribution rate"
          value={s.employerFixedPct}
          onChange={v => onUpdate({ employerFixedPct: v })}
          hint="Replaces standard SG rate"
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <CurrencyInput
            label="Salary sacrifice (annual)"
            value={s.salarySacrificeAmount}
            onChange={v => onUpdate({ salarySacrificeAmount: v })}
            hint={`SG est. $${Math.round(sgEstimate).toLocaleString()} · Cap $${CONCESSIONAL_CAP.toLocaleString()}`}
          />
          {concessionalBreached && (
            <p className="text-xs text-amber-400 mt-1">
              Concessional cap exceeded — ${Math.round(totalConcessional).toLocaleString()} vs ${CONCESSIONAL_CAP.toLocaleString()} limit. Excess taxed at marginal rate.
            </p>
          )}
        </div>
        <CurrencyInput
          label="Additional concessional (voluntary)"
          value={s.voluntaryConcessional}
          onChange={v => onUpdate({ voluntaryConcessional: v })}
        />
      </div>

      <div>
        <CurrencyInput
          label="After-tax (non-concessional) contributions"
          value={s.voluntaryNonConcessional}
          onChange={v => onUpdate({ voluntaryNonConcessional: v })}
          hint={`Cap $${NON_CONCESSIONAL_CAP.toLocaleString()} · Bring-forward: $330k over 3 years`}
          max={nccBreached ? NON_CONCESSIONAL_CAP : undefined}
        />
        {nccBreached && (
          <p className="text-xs text-amber-400 mt-1">
            Exceeds annual non-concessional cap of ${NON_CONCESSIONAL_CAP.toLocaleString()}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`ttr-${personLabel}`}
          checked={!!s.isTTR}
          onChange={e => onUpdate({ isTTR: e.target.checked })}
        />
        <label htmlFor={`ttr-${personLabel}`} className="text-sm text-gray-400">
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
  )
}

// ── Property form ─────────────────────────────────────────────────────────

function PropertyForm({ property, index, allProperties, onUpdate, onRemove }) {
  const p = property || {}
  const [open, setOpen] = useState(true)
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">State / Territory</label>
              <select
                className="input w-full"
                value={p.state || ''}
                onChange={e => onUpdate({ state: e.target.value || null })}
              >
                <option value="">Select state</option>
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
            {p.isPrimaryResidence && (
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!p.isFirstHomeBuyer}
                    onChange={e => onUpdate({ isFirstHomeBuyer: e.target.checked })}
                    className="accent-brand-500"
                  />
                  <span className="text-sm text-gray-400">First home buyer</span>
                </label>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CurrencyInput
              label="Current value"
              value={p.currentValue}
              onChange={v => onUpdate({ currentValue: v })}
            />
            <CurrencyInput
              label="Purchase price"
              value={p.purchasePrice}
              onChange={v => onUpdate({ purchasePrice: v })}
            />
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="label">Purchase date</label>
              <input
                className="input w-full"
                type="date"
                value={p.purchaseDate || ''}
                onChange={e => onUpdate({ purchaseDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Purchase method</label>
              <select
                className="input w-full"
                value={p.purchasedCash ? 'cash' : 'mortgage'}
                onChange={e => {
                  const isCash = e.target.value === 'cash'
                  onUpdate({
                    purchasedCash: isCash,
                    ...(isCash ? { mortgageBalance: 0, loanTermYearsRemaining: 0, interestRate: 0, offsetBalance: 0, offsetAnnualTopUp: 0 } : {}),
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
              placeholder="Already owned"
            />
          </div>

          {!p.purchasedCash && (
            <>
              <CurrencyInput
                label="Outstanding mortgage"
                value={p.mortgageBalance}
                onChange={v => {
                  const patch = { mortgageBalance: v }
                  // Auto-set original loan amount if not yet stored (first time entering mortgage)
                  if (!p.originalLoanAmount && v > 0) patch.originalLoanAmount = v
                  onUpdate(patch)
                }}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <PctInput
                  label="Interest rate"
                  value={p.interestRate}
                  onChange={v => onUpdate({ interestRate: v })}
                  step={0.05}
                />
                <div>
                  <label className="label">Loan term remaining (yrs)</label>
                  <input
                    className="input w-full"
                    type="number"
                    min={0}
                    max={30}
                    value={p.loanTermYearsRemaining || ''}
                    onChange={e => {
                      const yrs = numVal(e.target.value)
                      const patch = { loanTermYearsRemaining: yrs }
                      // Auto-set original loan term if not yet stored
                      if (!p.originalLoanTermYears && yrs > 0) patch.originalLoanTermYears = yrs
                      onUpdate(patch)
                    }}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="label">Loan type</label>
                  <select
                    className="input w-full"
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
                  <label className="label">IO period ends (year)</label>
                  <input
                    className="input w-full"
                    type="number"
                    min={2024}
                    max={2060}
                    value={p.ioEndYear || ''}
                    onChange={e => onUpdate({ ioEndYear: numVal(e.target.value) })}
                    placeholder="e.g. 2028"
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
            </>
          )}

          {!p.isPrimaryResidence && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CurrencyInput
                label="Annual rental income"
                value={p.annualRentalIncome}
                onChange={v => onUpdate({ annualRentalIncome: v })}
              />
              <CurrencyInput
                label="Annual property expenses"
                value={p.annualPropertyExpenses}
                onChange={v => onUpdate({ annualPropertyExpenses: v })}
                hint="Rates, insurance, management fees"
              />
            </div>
          )}

          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">CGT ownership — Person A</label>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <MonthYearInput
                    label="Sale date"
                    value={p.saleEvent.year}
                    onChange={v => onUpdate({ saleEvent: { ...p.saleEvent, year: v } })}
                    placeholder="Year"
                    nullable={false}
                  />
                  <div>
                    <label className="label">Route proceeds to</label>
                    <select
                      className="input w-full"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CurrencyInput
          label="Current portfolio value"
          value={s.currentValue}
          onChange={v => onUpdate({ currentValue: v })}
        />
        <CurrencyInput
          label={mode === 'surplus' ? 'Target annual contribution' : 'Annual contribution'}
          value={s.annualContribution}
          onChange={v => onUpdate({ annualContribution: v })}
        />
      </div>
      <div>
        <label className="label">Contribution mode</label>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PctInput
          label="Annual increase"
          value={s.annualIncreaseRate || 0}
          onChange={v => onUpdate({ annualIncreaseRate: v })}
          min={0}
          max={50}
          step={1}
          hint="Contribution grows by this % each year"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PctInput
          label="Dividend yield"
          value={s.dividendYield}
          onChange={v => onUpdate({ dividendYield: v })}
          hint="Used to calculate annual cash dividends"
        />
        <PctInput
          label="Franking credit %"
          value={s.frankingPct}
          onChange={v => onUpdate({ frankingPct: v })}
          step={5}
          hint="% of dividends that are fully franked"
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
          <label className="label">Preserve capital from age</label>
          <input
            className="input w-48"
            type="number"
            min={40}
            max={100}
            value={s.preserveCapitalFromAge || ''}
            onChange={e => onUpdate({ preserveCapitalFromAge: numVal(e.target.value) })}
            placeholder="e.g. 65"
          />
        </div>
      )}
      <HoldingsSubForm
        holdings={s.holdings}
        fields={['dividendYield']}
        createDefault={createDefaultShareHolding}
        label="share holding"
        onUpdate={holdings => onUpdate({ holdings })}
      />
    </div>
  )
}

// ── Holdings sub-form (reusable for shares, treasury bonds, commodities, super) ──

function HoldingCard({ holding, fields, onUpdate, onRemove }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-800/40 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-sm text-gray-300">
          {holding.name || 'Unnamed holding'}
        </span>
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
        <div className="p-4 space-y-3">
          <div>
            <label className="label">Name</label>
            <input
              className="input w-full"
              value={holding.name || ''}
              onChange={e => onUpdate({ name: e.target.value })}
              placeholder="e.g. VAS, BHP, Gold ETF"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CurrencyInput
              label="Current value"
              value={holding.currentValue}
              onChange={v => onUpdate({ currentValue: v })}
            />
            <PctInput
              label="Return rate"
              value={holding.returnRate}
              onChange={v => onUpdate({ returnRate: v })}
              min={-20}
              max={50}
              step={0.5}
            />
          </div>
          {fields.includes('dividendYield') && (
            <div className="grid grid-cols-2 gap-3">
              <PctInput
                label="Dividend yield"
                value={holding.dividendYield}
                onChange={v => onUpdate({ dividendYield: v })}
              />
              <PctInput
                label="Franking %"
                value={holding.frankingPct}
                onChange={v => onUpdate({ frankingPct: v })}
                step={5}
              />
            </div>
          )}
          {fields.includes('couponRate') && (
            <PctInput
              label="Coupon rate"
              value={holding.couponRate}
              onChange={v => onUpdate({ couponRate: v })}
              hint="Annual coupon payment as % of face value"
            />
          )}
          {fields.includes('pensionReturnRate') && (
            <PctInput
              label="Pension phase return"
              value={holding.pensionReturnRate}
              onChange={v => onUpdate({ pensionReturnRate: v })}
              min={-10}
              max={30}
              step={0.5}
              hint="Rate used once in pension phase"
            />
          )}
        </div>
      )}
    </div>
  )
}

function HoldingsSubForm({ holdings, fields, createDefault, label, onUpdate }) {
  const totalValue = (holdings || []).reduce((s, h) => s + (h.currentValue || 0), 0)
  const [expanded, setExpanded] = useState((holdings || []).length > 0)

  return (
    <div className="border border-gray-700/50 rounded-lg p-3 mt-3">
      <button
        className="w-full flex items-center justify-between text-left"
        onClick={() => setExpanded(o => !o)}
      >
        <span className="text-xs font-medium text-gray-400">
          Individual Holdings ({(holdings || []).length})
          {totalValue > 0 && ` — $${Math.round(totalValue).toLocaleString()}`}
        </span>
        <span className="text-gray-500 text-xs">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
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
            className="btn-ghost w-full py-2 border border-dashed border-gray-700 rounded-lg text-xs"
            onClick={() => onUpdate([...(holdings || []), createDefault()])}
          >
            + Add {label}
          </button>
          {(holdings || []).length > 0 && (
            <p className="text-xs text-gray-600">
              When holdings exist, the category uses weighted-average rates from holdings.
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CurrencyInput
          label="Current portfolio value"
          value={b.currentValue}
          onChange={v => onUpdate({ currentValue: v })}
        />
        <CurrencyInput
          label={mode === 'surplus' ? 'Target annual contribution' : 'Annual contribution'}
          value={b.annualContribution}
          onChange={v => onUpdate({ annualContribution: v })}
        />
      </div>
      <div>
        <label className="label">Contribution mode</label>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PctInput
          label="Annual increase"
          value={b.annualIncreaseRate || 0}
          onChange={v => onUpdate({ annualIncreaseRate: v })}
          min={0}
          max={50}
          step={1}
          hint="Contribution grows by this % each year"
        />
        <PctInput
          label="Coupon rate"
          value={b.couponRate}
          onChange={v => onUpdate({ couponRate: v })}
          hint="Annual coupon income — taxed as ordinary income"
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
          <label className="label">Preserve capital from age</label>
          <input
            className="input w-48"
            type="number"
            min={40}
            max={100}
            value={b.preserveCapitalFromAge || ''}
            onChange={e => onUpdate({ preserveCapitalFromAge: numVal(e.target.value) })}
            placeholder="e.g. 65"
          />
        </div>
      )}
      <HoldingsSubForm
        holdings={b.holdings}
        fields={['couponRate']}
        createDefault={createDefaultTreasuryBondHolding}
        label="bond holding"
        onUpdate={holdings => onUpdate({ holdings })}
      />
    </div>
  )
}

// ── Commodities form ─────────────────────────────────────────────────────

function CommoditiesForm({ commodities, onUpdate }) {
  const c = commodities || {}
  const mode = c.contributionMode || 'fixed'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CurrencyInput
          label="Current portfolio value"
          value={c.currentValue}
          onChange={v => onUpdate({ currentValue: v })}
        />
        <CurrencyInput
          label={mode === 'surplus' ? 'Target annual contribution' : 'Annual contribution'}
          value={c.annualContribution}
          onChange={v => onUpdate({ annualContribution: v })}
        />
      </div>
      <div>
        <label className="label">Contribution mode</label>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PctInput
          label="Annual increase"
          value={c.annualIncreaseRate || 0}
          onChange={v => onUpdate({ annualIncreaseRate: v })}
          min={0}
          max={50}
          step={1}
          hint="Contribution grows by this % each year"
        />
      </div>
      <p className="text-xs text-gray-500">
        Pure capital growth — no income component. Includes forex, metals, oil, and other commodity investments.
      </p>
      <HoldingsSubForm
        holdings={c.holdings}
        fields={[]}
        createDefault={createDefaultCommodityHolding}
        label="commodity holding"
        onUpdate={holdings => onUpdate({ holdings })}
      />
    </div>
  )
}

// ── Investment bond form ──────────────────────────────────────────────────

function BondForm({ bond, onUpdate, onRemove }) {
  const b = bond || {}
  const [open, setOpen] = useState(true)
  const currentYear = new Date().getFullYear()
  const inceptionYear = b.inceptionDate ? new Date(b.inceptionDate).getFullYear() : null
  const yearsElapsed = inceptionYear != null ? currentYear - inceptionYear : null
  const isTaxFree = yearsElapsed != null && yearsElapsed >= 10

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/40 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-300">
            {b.name || 'Unnamed bond'}
          </span>
          {yearsElapsed != null && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              isTaxFree
                ? 'bg-green-900/50 text-green-400 border-green-800'
                : 'bg-amber-900/50 text-amber-400 border-amber-800'
            }`}>
              {isTaxFree ? 'Tax-free' : `Year ${yearsElapsed} of 10`}
            </span>
          )}
        </div>
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
          <div>
            <label className="label">Bond name / label</label>
            <input
              className="input w-full"
              value={b.name || ''}
              onChange={e => onUpdate({ name: e.target.value })}
              placeholder="e.g. Education fund"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CurrencyInput
              label="Current balance"
              value={b.currentBalance}
              onChange={v => onUpdate({ currentBalance: v })}
            />
            <CurrencyInput
              label={b.contributionMode === 'surplus' ? 'Target annual contribution' : 'Annual contribution'}
              value={b.annualContribution}
              onChange={v => onUpdate({ annualContribution: v })}
              hint="Max 125% of prior year contribution"
            />
          </div>
          <div>
            <label className="label">Contribution mode</label>
            <div className="flex gap-2 mt-1">
              <button
                className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${
                  (b.contributionMode || 'fixed') === 'fixed'
                    ? 'bg-brand-600/20 border-brand-500 text-brand-500'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
                }`}
                onClick={() => onUpdate({ contributionMode: 'fixed' })}
              >
                Fixed expense
              </button>
              <button
                className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${
                  b.contributionMode === 'surplus'
                    ? 'bg-brand-600/20 border-brand-500 text-brand-500'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
                }`}
                onClick={() => onUpdate({ contributionMode: 'surplus' })}
              >
                From surplus
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1.5">
              {(b.contributionMode || 'fixed') === 'fixed'
                ? 'Deducted from cashflow each year like an expense — guaranteed contribution.'
                : 'Funded from surplus only — set priority in Surplus Strategy below. No surplus = no contribution.'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PctInput
              label="Annual increase"
              value={b.annualIncreaseRate || 0}
              onChange={v => onUpdate({ annualIncreaseRate: v })}
              min={0}
              max={25}
              step={1}
              hint="Capped at 25% (125% rule)"
            />
          </div>
          {(b.annualIncreaseRate || 0) > 0 && (
            <p className="text-xs text-amber-400">
              Contribution will increase by {Math.round((b.annualIncreaseRate || 0) * 100)}% each year (capped at 25% for bonds). This can significantly erode cashflow over time.
            </p>
          )}
          <div>
            <label className="label">Bond inception date</label>
            <input
              className="input w-full"
              type="date"
              value={b.inceptionDate || ''}
              onChange={e => onUpdate({ inceptionDate: e.target.value })}
            />
            {yearsElapsed != null && !isTaxFree && (
              <p className="text-xs text-amber-400 mt-1">
                {10 - yearsElapsed} year{10 - yearsElapsed !== 1 ? 's' : ''} until tax-free
                withdrawals. Any withdrawal before then resets the 10-year clock.
              </p>
            )}
            {isTaxFree && (
              <p className="text-xs text-green-400 mt-1">
                10-year threshold passed — withdrawals are fully tax-free.
              </p>
            )}
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
  const [open, setOpen] = useState(depth < 2)
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CurrencyInput
                label={hasChildren ? 'Own amount (excl. children)' : 'Amount'}
                value={item.amount}
                onChange={v => onUpdate({ amount: v })}
              />
              <div>
                <label className="label">Amount type</label>
                <select
                  className="input w-full"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Every X years</label>
                  <input
                    className="input w-full"
                    type="number"
                    min={1}
                    max={50}
                    value={item.recurringEveryYears || ''}
                    onChange={e => onUpdate({ recurringEveryYears: numVal(e.target.value) || null })}
                    placeholder="e.g. 10"
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

            {item.amountType === 'one_off' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <MonthYearInput
                  label="Date"
                  value={item.activeFrom}
                  onChange={v => onUpdate({ activeFrom: v, activeTo: null })}
                  placeholder={planStartYear ? String(planStartYear) : 'Year'}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

function OtherIncomeItem({ item, personAName, personBName, onUpdate, onRemove, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const annualAmt = item.amountType === 'monthly'
    ? (item.amount || 0) * 12
    : (item.amount || 0)

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-800/30">
        <button
          className="text-gray-500 text-xs w-4 shrink-0"
          onClick={() => setOpen(o => !o)}
        >
          {open ? '▾' : '▸'}
        </button>
        <input
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder-gray-600 min-w-0"
          value={item.name || ''}
          onChange={e => onUpdate({ name: e.target.value })}
          placeholder="Income source name"
        />
        <span className="text-xs text-gray-500 shrink-0">
          {item.person === 'household' ? 'Joint' : item.person === 'B' ? personBName : personAName}
        </span>
        {!item.isTaxable && (
          <span className="text-xs text-green-500 shrink-0">tax-free</span>
        )}
        <span className="text-xs text-gray-400 font-mono shrink-0">
          ${Math.round(annualAmt).toLocaleString()}{item.amountType !== 'one_off' ? '/yr' : ''}
        </span>
        <button
          className="text-gray-600 hover:text-red-400 text-sm shrink-0 ml-1"
          onClick={onRemove}
        >
          ×
        </button>
      </div>

      {open && (
        <div className="p-4 space-y-3 bg-gray-800/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CurrencyInput
              label="Amount"
              value={item.amount}
              onChange={v => onUpdate({ amount: v })}
            />
            <div>
              <label className="label">Amount type</label>
              <select
                className="input w-full"
                value={item.amountType || 'annual'}
                onChange={e => onUpdate({ amountType: e.target.value })}
              >
                <option value="annual">Annual</option>
                <option value="monthly">Monthly (×12)</option>
                <option value="one_off">One-off</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Attributed to</label>
              <select
                className="input w-full"
                value={item.person || 'A'}
                onChange={e => onUpdate({ person: e.target.value })}
              >
                <option value="A">{personAName}</option>
                <option value="B">{personBName}</option>
                <option value="household">Joint (50/50)</option>
              </select>
            </div>
            <div className="flex items-end pb-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`taxable-${item.id}`}
                  checked={item.isTaxable !== false}
                  onChange={e => onUpdate({ isTaxable: e.target.checked })}
                />
                <label htmlFor={`taxable-${item.id}`} className="text-sm text-gray-400">
                  Taxable income
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MonthYearInput
              label={item.amountType === 'one_off' ? 'Date' : 'Starts'}
              value={item.activeFrom}
              onChange={v => onUpdate({ activeFrom: v })}
              placeholder="Year"
            />
            {item.amountType !== 'one_off' && (
              <MonthYearInput
                label="Ends"
                value={item.activeTo}
                onChange={v => onUpdate({ activeTo: v })}
                placeholder="Indefinite"
              />
            )}
          </div>

          {item.amountType !== 'one_off' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Annual adjustment</label>
                <select
                  className="input w-full"
                  value={item.adjustmentType || 'none'}
                  onChange={e => onUpdate({ adjustmentType: e.target.value, adjustmentRate: 0 })}
                >
                  <option value="none">None (flat)</option>
                  <option value="percent">By % per year</option>
                  <option value="dollar">By $ per year</option>
                </select>
              </div>
              {item.adjustmentType === 'percent' && (
                <PctInput
                  label="Rate (% per year)"
                  value={item.adjustmentRate}
                  onChange={v => onUpdate({ adjustmentRate: v })}
                  min={-50}
                  hint="Negative to decrease"
                />
              )}
              {item.adjustmentType === 'dollar' && (
                <div>
                  <label className="label">$ per year</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      className="input w-full pl-7"
                      type="number"
                      value={item.adjustmentRate || ''}
                      onChange={e => onUpdate({ adjustmentRate: numVal(e.target.value) })}
                      placeholder="0"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Negative to decrease</p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="label">Post-retirement routing</label>
            <select
              className="input w-full"
              value={item.routeTo || 'cashflow'}
              onChange={e => onUpdate({ routeTo: e.target.value })}
            >
              <option value="cashflow">General cashflow</option>
              <option value="shares">Direct to shares</option>
              <option value="treasuryBonds">Direct to treasury bonds</option>
              <option value="commodities">Direct to commodities</option>
              <option value="bonds">Direct to tax-deferred bonds</option>
              <option value="otherAssets">Direct to other assets</option>
              <option value="cash">Direct to cash buffer</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              After retirement, route this income directly to a specific vehicle instead of general cashflow
            </p>
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

function DebtItem({ item, defaultOpen, onUpdate, onRemove }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const annualRepay = (item.monthlyRepayment || 0) * 12

  // For leases: auto-calc repayment if not manually set
  let displayRepay = annualRepay
  if (item.type === 'lease' && !item.monthlyRepayment && item.currentBalance > 0 && item.termYears > 0) {
    const financed = item.currentBalance - (item.residualValue || 0)
    const totalInterest = financed * (item.interestRate || 0) * item.termYears
    displayRepay = (financed + totalInterest) / item.termYears
  }

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-800/30">
        <button
          className="text-gray-500 text-xs w-4 shrink-0"
          onClick={() => setOpen(o => !o)}
        >
          {open ? '▾' : '▸'}
        </button>
        <input
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder-gray-600 min-w-0"
          value={item.name || ''}
          onChange={e => onUpdate({ name: e.target.value })}
          placeholder={`${DEBT_TYPE_LABELS[item.type] || 'Debt'} name`}
        />
        <span className="text-xs text-gray-500 shrink-0">{DEBT_TYPE_LABELS[item.type]}</span>
        {item.currentBalance > 0 && (
          <span className="text-xs text-red-400 font-mono shrink-0">
            ${Math.round(item.currentBalance).toLocaleString()}
          </span>
        )}
        {displayRepay > 0 && (
          <span className="text-xs text-gray-400 font-mono shrink-0">
            ${Math.round(displayRepay).toLocaleString()}/yr
          </span>
        )}
        <button
          className="text-gray-600 hover:text-red-400 text-sm shrink-0 ml-1"
          onClick={onRemove}
        >
          ×
        </button>
      </div>

      {open && (
        <div className="p-4 space-y-3 bg-gray-800/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CurrencyInput
              label="Current balance"
              value={item.currentBalance}
              onChange={v => onUpdate({ currentBalance: v })}
            />
            <PctInput
              label="Interest rate"
              value={item.interestRate}
              onChange={v => onUpdate({ interestRate: v })}
            />
          </div>

          {item.type !== 'credit_card' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Term (years)</label>
                <input
                  className="input w-full"
                  type="number"
                  min={1}
                  max={30}
                  value={item.termYears || ''}
                  onChange={e => onUpdate({ termYears: numVal(e.target.value) || null })}
                  placeholder="5"
                />
              </div>
              <div>
                <label className="label">Start year</label>
                <input
                  className="input w-full"
                  type="number"
                  min={2020}
                  max={2070}
                  value={item.startYear || ''}
                  onChange={e => onUpdate({ startYear: numVal(e.target.value) || null })}
                  placeholder="Already held"
                />
              </div>
            </div>
          )}

          {item.type === 'lease' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CurrencyInput
                label="Residual / balloon value"
                value={item.residualValue}
                onChange={v => onUpdate({ residualValue: v })}
              />
              <CurrencyInput
                label="Monthly repayment (0 = auto-calc)"
                value={item.monthlyRepayment}
                onChange={v => onUpdate({ monthlyRepayment: v })}
              />
            </div>
          )}

          {item.type === 'lease' && item.currentBalance > 0 && item.termYears > 0 && (
            <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400 space-y-1">
              {(() => {
                const financed = item.currentBalance - (item.residualValue || 0)
                const totalInterest = financed * (item.interestRate || 0) * item.termYears
                const totalCost = financed + totalInterest
                const annualPay = totalCost / item.termYears
                return (
                  <>
                    <div>Financed: ${Math.round(financed).toLocaleString()} (balance − residual)</div>
                    <div>Total interest: ${Math.round(totalInterest).toLocaleString()} (calculated upfront)</div>
                    <div>Total cost: ${Math.round(totalCost).toLocaleString()}</div>
                    <div className="text-gray-300 font-medium">Annual repayment: ${Math.round(annualPay).toLocaleString()}/yr (${Math.round(annualPay / 12).toLocaleString()}/mo)</div>
                    {(item.residualValue || 0) > 0 && (
                      <div className="text-amber-400">Residual of ${Math.round(item.residualValue).toLocaleString()} due in final year</div>
                    )}
                  </>
                )
              })()}
            </div>
          )}

          {item.type === 'personal_loan' && (
            <CurrencyInput
              label="Monthly repayment"
              value={item.monthlyRepayment}
              onChange={v => onUpdate({ monthlyRepayment: v })}
            />
          )}

          {item.type === 'credit_card' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CurrencyInput
                  label="Monthly repayment (0 = min 2%)"
                  value={item.monthlyRepayment}
                  onChange={v => onUpdate({ monthlyRepayment: v })}
                />
                <div>
                  <label className="label">Mode</label>
                  <select
                    className="input w-full"
                    value={item.repaymentMode || 'payoff'}
                    onChange={e => onUpdate({ repaymentMode: e.target.value })}
                  >
                    <option value="payoff">Pay off (balance reduces)</option>
                    <option value="revolving">Revolving (balance steady)</option>
                  </select>
                </div>
              </div>
              {item.repaymentMode === 'revolving' && (
                <p className="text-xs text-amber-400">
                  Revolving mode assumes the balance stays constant — interest is paid each year but principal is not reduced.
                </p>
              )}
            </>
          )}
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
  const [lastAddedIncomeId, setLastAddedIncomeId] = useState(null)
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
          offsetAnnualTopUp: 0,
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
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-6">
      {showTutorial && <Tutorial steps={HOUSEHOLD_TUTORIAL} onClose={closeTutorial} />}
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-white">Household Profile</h1>
        <TutorialButton onClick={() => setShowTutorial(true)} />
      </div>

      {validationWarnings.length > 0 && (
        <div className="bg-amber-900/50 border border-amber-800 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1">Missing required fields</p>
          <ul className="text-sm text-amber-400 space-y-0.5">
            {validationWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <Section title="People">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <PersonForm person={personA} label="A" onUpdate={updatePersonA} />
          <PersonForm person={personB} label="B" onUpdate={updatePersonB} />
        </div>
        <p className="text-xs text-gray-600 mt-4">
          Preservation age is auto-set to 60 for anyone born after 1 July 1964.
        </p>
      </Section>

      <Section title="Superannuation">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <SuperForm
            superProfile={superA}
            personLabel="A"
            grossSalary={personA.currentSalary}
            onUpdate={updateSuperA}
          />
          <SuperForm
            superProfile={superB}
            personLabel="B"
            grossSalary={personB.currentSalary}
            onUpdate={updateSuperB}
          />
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
        <div className="space-y-3">
          <CurrencyInput
            label="Current cash / savings balance"
            value={scenario.cashSavings ?? 0}
            onChange={v => updateScenario({ cashSavings: v })}
            hint="Included in liquidity and net worth. If linked to a mortgage offset account, mark that property's offset checkbox — this balance will reduce interest on that loan."
          />
          <p className="text-xs text-gray-500">
            Cash earns no return in the model. Surplus cashflow accumulates here unless routed elsewhere via the Surplus Strategy.
          </p>
        </div>
      </Section>

      <Section title="Share Portfolio">
        <SharesForm shares={scenario.shares} onUpdate={updateShares} />
      </Section>

      <Section title="Treasury / Corporate Bonds" defaultOpen={false}>
        <TreasuryBondsForm bonds={scenario.treasuryBonds} onUpdate={updateTreasuryBonds} />
      </Section>

      <Section title="Commodities" defaultOpen={false}>
        <CommoditiesForm commodities={scenario.commodities} onUpdate={updateCommodities} />
      </Section>

      <Section title={`Tax-Deferred Bonds — 10yr (${scenario.investmentBonds.length})`} defaultOpen={false}>
        <div className="space-y-3">
          {scenario.investmentBonds.map((b, i) => (
            <BondForm
              key={b.id}
              bond={b}
              onUpdate={patch => updateBond(i, patch)}
              onRemove={() => removeBond(i)}
            />
          ))}
          <button
            className="btn-ghost w-full py-2.5 border border-dashed border-gray-700 rounded-lg text-sm"
            onClick={addBond}
          >
            + Add tax-deferred bond
          </button>
          {scenario.investmentBonds.length === 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Tax-deferred bonds offer tax-free withdrawals after 10 years — useful for high-income earners.
            </p>
          )}
        </div>
      </Section>

      <Section title={`Expenses (${expenseItems.length} groups)`} defaultOpen={false}>
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

      <Section title={`Other Income (${(scenario.otherIncome || []).length})`} defaultOpen={false}>
        <p className="text-sm text-gray-500 mb-3">
          Consulting, part-time work, gifts, pensions, trust distributions, or any non-salary income.
        </p>
        <div className="space-y-3">
          {(scenario.otherIncome || []).map((src, i) => (
            <OtherIncomeItem
              key={src.id}
              item={src}
              defaultOpen={src.id === lastAddedIncomeId}
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
            className="btn-ghost w-full py-2.5 border border-dashed border-gray-700 rounded-lg text-sm mt-2"
            onClick={() => {
              const newId = crypto.randomUUID()
              setLastAddedIncomeId(newId)
              updateScenario({
                otherIncome: [
                  ...(scenario.otherIncome || []),
                  {
                    id: newId,
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
            + Add income source
          </button>
        </div>
      </Section>

      <Section title={`Other Assets (${(scenario.otherAssets || []).length})`} defaultOpen={false}>
        <p className="text-sm text-gray-500 mb-3">
          Private equity, business interests, collectibles, or any asset not covered above.
        </p>
        <div className="space-y-3">
          {(scenario.otherAssets || []).map((asset, i) => (
            <div key={asset.id} className="bg-gray-800/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <input
                  className="input flex-1 text-sm py-1.5 mr-3"
                  placeholder="Asset name (e.g. Private Equity Fund)"
                  value={asset.name}
                  onChange={e => {
                    const updated = [...scenario.otherAssets]
                    updated[i] = { ...asset, name: e.target.value }
                    updateScenario({ otherAssets: updated })
                  }}
                />
                <button
                  className="text-gray-600 hover:text-red-400 text-xs"
                  onClick={() => {
                    const updated = scenario.otherAssets.filter((_, j) => j !== i)
                    updateScenario({ otherAssets: updated })
                  }}
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <CurrencyInput
                  label="Current value"
                  value={asset.currentValue}
                  onChange={v => {
                    const updated = [...scenario.otherAssets]
                    updated[i] = { ...asset, currentValue: v }
                    updateScenario({ otherAssets: updated })
                  }}
                />
                <CurrencyInput
                  label={(asset.contributionMode || 'fixed') === 'surplus' ? 'Target annual contribution' : 'Annual contribution'}
                  value={asset.annualContribution}
                  onChange={v => {
                    const updated = [...scenario.otherAssets]
                    updated[i] = { ...asset, annualContribution: v }
                    updateScenario({ otherAssets: updated })
                  }}
                />
                <PctInput
                  label="Return rate"
                  value={asset.returnRate}
                  onChange={v => {
                    const updated = [...scenario.otherAssets]
                    updated[i] = { ...asset, returnRate: v }
                    updateScenario({ otherAssets: updated })
                  }}
                  min={0}
                  max={30}
                  step={0.5}
                  hint="Gross annual return"
                />
              </div>
              <div>
                <label className="label">Contribution mode</label>
                <div className="flex gap-2 mt-1">
                  <button
                    className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${
                      (asset.contributionMode || 'fixed') === 'fixed'
                        ? 'bg-brand-600/20 border-brand-500 text-brand-500'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
                    }`}
                    onClick={() => {
                      const updated = [...scenario.otherAssets]
                      updated[i] = { ...asset, contributionMode: 'fixed' }
                      updateScenario({ otherAssets: updated })
                    }}
                  >
                    Fixed expense
                  </button>
                  <button
                    className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-colors ${
                      asset.contributionMode === 'surplus'
                        ? 'bg-brand-600/20 border-brand-500 text-brand-500'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300'
                    }`}
                    onClick={() => {
                      const updated = [...scenario.otherAssets]
                      updated[i] = { ...asset, contributionMode: 'surplus' }
                      updateScenario({ otherAssets: updated })
                    }}
                  >
                    From surplus
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1.5">
                  {(asset.contributionMode || 'fixed') === 'fixed'
                    ? 'Deducted from cashflow each year like an expense.'
                    : 'Funded from surplus only — set priority in Surplus Strategy below.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PctInput
                  label="Annual increase"
                  value={asset.annualIncreaseRate || 0}
                  onChange={v => {
                    const updated = [...scenario.otherAssets]
                    updated[i] = { ...asset, annualIncreaseRate: v }
                    updateScenario({ otherAssets: updated })
                  }}
                  min={0}
                  max={50}
                  step={1}
                  hint="Contribution grows by this % each year"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={asset.canDrawdown ?? true}
                  onChange={e => {
                    const updated = [...scenario.otherAssets]
                    updated[i] = { ...asset, canDrawdown: e.target.checked }
                    updateScenario({ otherAssets: updated })
                  }}
                  className="accent-brand-500"
                />
                <span className="text-sm text-gray-300">Available for drawdown in deficit years</span>
              </label>
            </div>
          ))}
          <button
            className="btn-ghost w-full py-2.5 border border-dashed border-gray-700 rounded-lg text-sm"
            onClick={() => {
              const newAsset = {
                id: crypto.randomUUID(),
                name: '',
                currentValue: 0,
                annualContribution: 0,
                returnRate: 0.07,
                canDrawdown: true,
              }
              updateScenario({ otherAssets: [...(scenario.otherAssets || []), newAsset] })
            }}
          >
            + Add other asset
          </button>
          {(scenario.otherAssets || []).length === 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Add private equity, business interests, collectibles, or any other asset class with a custom return rate.
            </p>
          )}
        </div>
      </Section>

      <Section title={`Debts (${(scenario.debts || []).length})`} defaultOpen={false}>
        <p className="text-sm text-gray-500 mb-3">
          Personal loans, car leases, credit cards — any non-mortgage liabilities. Repayments are deducted from cashflow.
        </p>
        <div className="space-y-3">
          {(scenario.debts || []).map((debt, i) => (
            <DebtItem
              key={debt.id}
              item={debt}
              defaultOpen={debt._autoOpen}
              onUpdate={patch => {
                const updated = [...(scenario.debts || [])]
                const { _autoOpen, ...clean } = { ...updated[i], ...patch }
                updated[i] = clean
                updateScenario({ debts: updated })
              }}
              onRemove={() => {
                updateScenario({ debts: (scenario.debts || []).filter((_, idx) => idx !== i) })
              }}
            />
          ))}
          <div className="flex gap-2">
            <button
              className="btn-ghost flex-1 py-2 border border-dashed border-gray-700 rounded-lg text-sm"
              onClick={() => updateScenario({
                debts: [...(scenario.debts || []), { ...createDebtDefaults('personal_loan'), _autoOpen: true }],
              })}
            >
              + Personal loan
            </button>
            <button
              className="btn-ghost flex-1 py-2 border border-dashed border-gray-700 rounded-lg text-sm"
              onClick={() => updateScenario({
                debts: [...(scenario.debts || []), { ...createDebtDefaults('lease'), _autoOpen: true }],
              })}
            >
              + Lease
            </button>
            <button
              className="btn-ghost flex-1 py-2 border border-dashed border-gray-700 rounded-lg text-sm"
              onClick={() => updateScenario({
                debts: [...(scenario.debts || []), { ...createDebtDefaults('credit_card'), _autoOpen: true }],
              })}
            >
              + Credit card
            </button>
          </div>
        </div>
      </Section>

      <Section title="Surplus Strategy" defaultOpen={false}>
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
                    className="input flex-1 text-sm py-1.5"
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

      <Section title="Drawdown Strategy" defaultOpen={false}>
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
                    className="input flex-1 text-sm py-1.5"
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
    </div>
  )
}
