import { useState } from 'react'
import {
  CONCESSIONAL_CAP,
  NON_CONCESSIONAL_CAP,
  PBI_GENERAL_CAP,
  PBI_MEAL_ENTERTAINMENT_CAP,
  QLD_HEALTH_GENERAL_CAP,
  QLD_HEALTH_MEAL_ENTERTAINMENT_CAP,
} from '../constants/index.js'

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
          value={value || ''}
          onChange={e => onChange(Number(e.target.value))}
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
          value={value != null ? (value * 100).toFixed(step < 1 ? 1 : 0) : ''}
          onChange={e => onChange(Number(e.target.value) / 100)}
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

  const addLease = () =>
    onUpdate({
      packaging: {
        ...p.packaging,
        novatedLease: {
          vehicleCostPrice: 0,
          annualKmTotal: 0,
          annualKmBusiness: 0,
          annualRunningCosts: 0,
          method: 'statutory',
          isEV: false,
          employeePostTaxContribution: 0,
          activeYears: { from: null, to: null },
        },
      },
    })

  const removeLease = () =>
    onUpdate({ packaging: { ...p.packaging, novatedLease: null } })

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-300">Person {label}</h3>

      <div className="grid grid-cols-2 gap-4">
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

      <div className="grid grid-cols-2 gap-4">
        <CurrencyInput
          label="Current salary (gross)"
          value={p.currentSalary}
          onChange={v => onUpdate({ currentSalary: v })}
        />
        <div>
          <label className="label">Target retirement age</label>
          <input
            className="input w-full"
            type="number"
            min={40}
            max={80}
            value={p.retirementAge || 60}
            onChange={e => onUpdate({ retirementAge: Number(e.target.value) })}
          />
        </div>
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
        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
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
        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
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
            <div className="grid grid-cols-2 gap-4">
              <CurrencyInput
                label="Vehicle cost price"
                value={p.packaging.novatedLease.vehicleCostPrice}
                onChange={v => updateLease({ vehicleCostPrice: v })}
              />
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
                  onChange={e => updateLease({ annualKmTotal: Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label">Business km / year</label>
                <input
                  className="input w-full"
                  type="number"
                  value={p.packaging.novatedLease.annualKmBusiness || ''}
                  onChange={e => updateLease({ annualKmBusiness: Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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

      <div className="grid grid-cols-2 gap-4">
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

      <div className="grid grid-cols-2 gap-4">
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
    </div>
  )
}

// ── Property form ─────────────────────────────────────────────────────────

function PropertyForm({ property, index, onUpdate, onRemove }) {
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

          <div className="grid grid-cols-2 gap-4">
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Purchase date</label>
              <input
                className="input w-full"
                type="date"
                value={p.purchaseDate || ''}
                onChange={e => onUpdate({ purchaseDate: e.target.value })}
              />
            </div>
            <CurrencyInput
              label="Outstanding mortgage"
              value={p.mortgageBalance}
              onChange={v => onUpdate({ mortgageBalance: v })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
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
                onChange={e => onUpdate({ loanTermYearsRemaining: Number(e.target.value) })}
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
                onChange={e => onUpdate({ ioEndYear: Number(e.target.value) })}
                placeholder="e.g. 2028"
              />
              <p className="text-xs text-amber-400 mt-1">
                Repayments step up to P&I at IO expiry
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <CurrencyInput
              label="Offset account balance"
              value={p.offsetBalance}
              onChange={v => onUpdate({ offsetBalance: v })}
              hint="Interest charged on (mortgage − offset)"
            />
            <CurrencyInput
              label="Annual offset top-up"
              value={p.offsetAnnualTopUp}
              onChange={v => onUpdate({ offsetAnnualTopUp: v })}
            />
          </div>

          {!p.isPrimaryResidence && (
            <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-2 gap-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <div>
                  <label className="label">Sale year</label>
                  <input
                    className="input w-full"
                    type="number"
                    min={2024}
                    max={2070}
                    value={p.saleEvent.year || ''}
                    onChange={e => onUpdate({ saleEvent: { ...p.saleEvent, year: Number(e.target.value) } })}
                  />
                </div>
                <div>
                  <label className="label">Route proceeds to</label>
                  <select
                    className="input w-full"
                    value={p.saleEvent.destination || 'shares'}
                    onChange={e => onUpdate({ saleEvent: { ...p.saleEvent, destination: e.target.value } })}
                  >
                    <option value="shares">Share portfolio</option>
                    <option value="offset">Mortgage offset</option>
                    <option value="cash">Cash buffer</option>
                  </select>
                </div>
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
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <CurrencyInput
          label="Current portfolio value"
          value={s.currentValue}
          onChange={v => onUpdate({ currentValue: v })}
        />
        <CurrencyInput
          label="Annual contribution"
          value={s.annualContribution}
          onChange={v => onUpdate({ annualContribution: v })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
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
            onChange={e => onUpdate({ preserveCapitalFromAge: Number(e.target.value) })}
            placeholder="e.g. 65"
          />
        </div>
      )}
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
          <div className="grid grid-cols-2 gap-4">
            <CurrencyInput
              label="Current balance"
              value={b.currentBalance}
              onChange={v => onUpdate({ currentBalance: v })}
            />
            <CurrencyInput
              label="Annual contribution"
              value={b.annualContribution}
              onChange={v => onUpdate({ annualContribution: v })}
              hint="Max 125% of prior year contribution"
            />
          </div>
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
  time_bounded: 'Time-bounded',
}

function ExpenseItem({ item, onUpdate, onRemove }) {
  const [open, setOpen] = useState(false)
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
          value={item.label || ''}
          onChange={e => onUpdate({ label: e.target.value })}
          placeholder="Expense label"
        />
        <span className="text-xs text-gray-500 shrink-0">
          {AMOUNT_TYPE_LABELS[item.amountType] || 'Annual'}
        </span>
        {item.isDiscretionary && (
          <span className="text-xs text-amber-500 shrink-0">discretionary</span>
        )}
        <span className="text-xs text-gray-400 font-mono shrink-0">
          ${Math.round(annualAmt).toLocaleString()}/yr
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
          <div className="grid grid-cols-2 gap-4">
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
                <option value="time_bounded">Time-bounded (date range)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`disc-${item.id}`}
              checked={!!item.isDiscretionary}
              onChange={e => onUpdate({ isDiscretionary: e.target.checked })}
            />
            <label htmlFor={`disc-${item.id}`} className="text-sm text-gray-400">
              Discretionary — can be reduced in Gap stress test
            </label>
          </div>

          {(item.amountType === 'time_bounded' || item.amountType === 'one_off') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Active from (year)</label>
                <input
                  className="input w-full"
                  type="number"
                  min={2024}
                  max={2070}
                  value={item.activeFrom || ''}
                  onChange={e => onUpdate({ activeFrom: Number(e.target.value) || null })}
                  placeholder="e.g. 2026"
                />
              </div>
              {item.amountType === 'time_bounded' && (
                <div>
                  <label className="label">Active to (year)</label>
                  <input
                    className="input w-full"
                    type="number"
                    min={2024}
                    max={2070}
                    value={item.activeTo || ''}
                    onChange={e => onUpdate({ activeTo: Number(e.target.value) || null })}
                    placeholder="e.g. 2032"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────

export default function HouseholdProfile({ scenario, updateScenario }) {
  const [guideOpen, setGuideOpen] = useState(false)
  const { personA, personB } = scenario.household
  const superA = scenario.super.find(s => s.personLabel === 'A') || {}
  const superB = scenario.super.find(s => s.personLabel === 'B') || {}
  const expenseItems = scenario.expenses?.children || []

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

  const addExpense = () =>
    updateScenario({
      expenses: {
        ...scenario.expenses,
        children: [
          ...expenseItems,
          {
            id: crypto.randomUUID(),
            label: '',
            type: 'category',
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
    <div className="px-6 py-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-lg font-semibold text-white">Household Profile</h1>

      <div className="card">
        <button
          className="w-full flex items-center gap-1.5 text-left text-sm text-gray-500 hover:text-gray-300"
          onClick={() => setGuideOpen(o => !o)}
        >
          <span className="text-xs">{guideOpen ? '▾' : '▸'}</span>
          How this page works
        </button>
        {guideOpen && (
          <p className="mt-3 text-sm text-gray-400 leading-relaxed">
            Enter your household details here — this is the foundation for every projection in the tool. Start with People (dates of birth and planned retirement ages), then work through Super, Property, Shares, Investment Bonds, and Expenses in order. The more accurately you fill in each section, the more meaningful the projections will be. Salary packaging and novated lease details feed directly into the tax calculations.
          </p>
        )}
      </div>

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

      <Section title="Share Portfolio">
        <SharesForm shares={scenario.shares} onUpdate={updateShares} />
      </Section>

      <Section title={`Investment Bonds (${scenario.investmentBonds.length})`} defaultOpen={false}>
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
            + Add investment bond
          </button>
          {scenario.investmentBonds.length === 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Investment bonds offer tax-free withdrawals after 10 years — useful for high-income earners.
            </p>
          )}
        </div>
      </Section>

      <Section title={`Expenses (${expenseItems.length} items)`} defaultOpen={false}>
        <div className="space-y-2">
          {expenseItems.length === 0 && (
            <p className="text-sm text-gray-500 py-1">
              No expenses added — simulation uses zero living costs.
            </p>
          )}
          {expenseItems.map((item, i) => (
            <ExpenseItem
              key={item.id}
              item={item}
              onUpdate={patch => updateExpense(i, patch)}
              onRemove={() => removeExpense(i)}
            />
          ))}
          <button
            className="btn-ghost w-full py-2.5 border border-dashed border-gray-700 rounded-lg text-sm mt-2"
            onClick={addExpense}
          >
            + Add expense
          </button>
        </div>
      </Section>
    </div>
  )
}
