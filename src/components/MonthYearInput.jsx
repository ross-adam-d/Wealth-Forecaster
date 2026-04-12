/**
 * Month/Year input pair.
 *
 * Stores value as "YYYY-MM" string (e.g. "2030-06") or plain year number.
 * When month is cleared, stores just the year number for backward compat.
 *
 * Props:
 *  - label: field label
 *  - value: current value (number like 2030, or string like "2030-06", or null)
 *  - onChange: (value) => void — receives "YYYY-MM" string, year number, or null
 *  - placeholder: placeholder for the year input (default "Year")
 *  - nullable: if true, empty year clears to null (default true)
 *  - minYear / maxYear: bounds for the year input
 */

const MONTHS = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function parseValue(value) {
  if (value == null) return { year: '', month: '' }
  if (typeof value === 'number') return { year: value, month: '' }
  if (typeof value === 'string') {
    const parts = value.split('-')
    const year = parseInt(parts[0], 10)
    if (isNaN(year)) return { year: '', month: '' }
    const month = parts.length >= 2 ? parseInt(parts[1], 10) : ''
    return { year, month: (month >= 1 && month <= 12) ? month : '' }
  }
  return { year: '', month: '' }
}

export default function MonthYearInput({
  label,
  value,
  onChange,
  placeholder = 'Year',
  nullable = true,
  minYear = 2020,
  maxYear = 2080,
}) {
  const { year, month } = parseValue(value)

  function emit(newYear, newMonth) {
    if (newYear === '' || newYear == null) {
      onChange(nullable ? null : value)
      return
    }
    const yr = Number(newYear)
    if (isNaN(yr)) return
    if (newMonth && newMonth !== '') {
      const m = String(newMonth).padStart(2, '0')
      onChange(`${yr}-${m}`)
    } else {
      onChange(yr)
    }
  }

  return (
    <div>
      {label && <label className="compact-label">{label}</label>}
      <div className="flex gap-1">
        <select
          className="compact-input w-20 flex-shrink-0"
          value={month}
          onChange={e => emit(year, e.target.value)}
        >
          <option value="">Mon</option>
          {MONTHS.slice(1).map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <input
          className="compact-input w-20"
          type="number"
          step="1"
          placeholder={placeholder}
          value={year}
          onChange={e => {
            const raw = e.target.value
            emit(raw === '' ? '' : raw, month)
          }}
          onWheel={e => e.target.blur()}
        />
      </div>
    </div>
  )
}
