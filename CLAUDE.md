# Aussie Retirement Simulator — Claude Code Rules

## Session Protocol

Every session must:

1. **Start** by reading `docs/PROGRESS.md` to understand where we left off and what's next.
2. **Work** using the TodoWrite tool to track tasks in-progress and completed.
3. **End** by:
   - Updating `docs/PROGRESS.md` with a dated session summary and the updated todo list.
   - Committing all changes with a clear message.
   - Pushing to the active feature branch (`git push -u origin <branch>`).

Never end a session without a push. If the session produces no code changes, still push any doc updates.

---

## Repository Structure

```
src/
  engine/          # Pure JS computation — no React, no side effects
    simulationEngine.js   # Year-by-year orchestrator
    taxEngine.js          # Income tax, Medicare, franking, packaging
    ratePeriodEngine.js   # Time-varying rate resolution
  modules/         # Asset-class computation modules
    super.js, property.js, shares.js, investmentBonds.js, expenses.js, fbt.js
  views/           # React page components (one per route)
  components/      # Shared UI components
  hooks/           # useScenario, useSimulation
  constants/       # All rates, caps, thresholds — never hardcode inline
  utils/           # supabase.js, schema.js (default data model)
docs/
  AussieRetirementSimulator-Spec-v2.md   # Product spec — source of truth
  PROGRESS.md                             # Session log + running todo list
```

---

## Coding Rules

### General
- **No hardcoded rates or thresholds.** All legislative values live in `src/constants/index.js`.
- **Engine files are pure functions.** No React imports, no Supabase calls, no side effects.
- **Modules are self-contained.** Each asset module handles its own year calculation and returns a result object.
- **Schema changes go through `utils/schema.js`.** Always update `createDefault*` functions when adding new fields.
- Keep functions small and single-purpose. Prefer a named helper over a comment explaining complex logic.
- No `console.log` left in committed code.

### React / UI
- State lives at the `App` level and is passed down via props. No global state library.
- All monetary input fields use `type="number"` with a `$` prefix span.
- Use the existing CSS component classes (`.card`, `.input`, `.label`, `.btn-primary`, `.btn-ghost`). Do not invent new one-off styles.
- All views receive `{ scenario, updateScenario, snapshots, retirementDate }` as standard props.

### Data model
- Scenario data is persisted as a single JSON blob per scenario in Supabase (`scenarios.data`).
- Never mutate scenario state directly — always use `updateScenario(patch)`.
- `createDefaultScenario()` must always produce a valid, runnable scenario with zero values.

---

## Design System

### Colour Palette

| Token | Hex | Usage |
|---|---|---|
| `bg-gray-950` | `#030712` | Page/app background |
| `bg-gray-900` | `#111827` | Cards, header, footer |
| `bg-gray-800` | `#1f2937` | Input backgrounds, hover states |
| `border-gray-800` | `#1f2937` | Card borders |
| `border-gray-700` | `#374151` | Input borders |
| `text-gray-100` | `#f3f4f6` | Primary text |
| `text-gray-400` | `#9ca3af` | Secondary text, labels |
| `text-gray-500` | `#6b7280` | Placeholder, muted |
| `text-gray-600` | `#4b5563` | Disclaimer text |
| `brand-500` | `#0ea5e9` | Focus rings, active accents |
| `brand-600` | `#0284c7` | Primary button background |
| `brand-700` | `#0369a1` | Primary button hover |

**Status colours (never use for anything else):**

| State | Background | Text | Border |
|---|---|---|---|
| Viable / positive | `green-900/50` | `green-400` | `green-800` |
| At risk / warning | `amber-900/50` | `amber-400` | `amber-800` |
| Critical / negative | `red-900/50` | `red-400` | `red-800` |

### Chart Colours (Recharts)

Always use this palette in this order for stacked areas/bars. Never introduce new chart colours.

```
Super A:    #0ea5e9   (brand-500, sky blue)
Super B:    #38bdf8   (sky-400, lighter blue)
Shares:     #a78bfa   (violet-400)
Property:   #34d399   (emerald-400)
Bonds:      #fbbf24   (amber-400)
Cash:       #94a3b8   (slate-400)
Expenses:   #f87171   (red-400)
Net:        #4ade80   (green-400)
```

Reference lines and markers: `stroke="#6b7280"` (gray-500), dashed.

### Typography

- Font: system sans-serif (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- Page heading: `text-lg font-semibold text-white`
- Section heading: `text-sm font-semibold text-gray-300`
- Metric label: `text-xs text-gray-500 uppercase tracking-wide`
- Metric value (large): `text-2xl font-bold text-white`
- Metric value (small): `text-sm font-semibold text-white`
- Body / description: `text-sm text-gray-400`

### Spacing & Layout

- Page padding: `px-6 py-6`
- Between major sections: `space-y-6` or `gap-6`
- Card internal padding: `p-5` (from `.card` class)
- Between form fields: `space-y-4`
- Grid layouts: `grid grid-cols-2 gap-4` (default), `grid-cols-3 gap-4` (wider)
- Inline pill/badge gap: `gap-1.5`

### Component Classes (defined in `index.css`)

```
.card          → bg-gray-900 border border-gray-800 rounded-xl p-5
.btn-primary   → bg-brand-600 hover:bg-brand-700 text-white font-medium px-4 py-2 rounded-lg
.btn-ghost     → text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-2 rounded-lg
.input         → bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white
.label         → text-sm font-medium text-gray-400 mb-1 block
.badge-viable  → green pill (see colours above)
.badge-at-risk → amber pill
.badge-critical → red pill
```

### Dollar Formatting

Use the `fmt$` helper (defined in each view, or extract to a shared util):
```js
if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
if (abs >= 1_000)     return `$${Math.round(n / 1_000)}k`
return `$${Math.round(n)}`
```
Never display raw numbers without formatting in the UI.

### Interaction Patterns

- **Sliders:** always show current value inline next to the slider. Label + value on the same line.
- **Toggles:** use a checkbox + label pair. No custom toggle components.
- **Number inputs:** always include a `$` prefix span for currency fields. Show the label above.
- **Warnings:** display as a `text-amber-400 text-xs` inline below the relevant field. Not as modals.
- **Collapsed sections:** use a disclosure pattern with a caret (`▸` / `▾`) and `text-gray-400` header button.

---

## Regulatory Requirements

- The ASIC disclaimer in `Layout.jsx` footer must never be removed or modified without legal review.
- No fund, product, or platform names anywhere in the UI.
- All projected values are illustrative — label anything beyond age 100 as "Illustrative".
- Assumptions panel must always be accessible from any view.

---

## Spec Reference

The full product specification is at `docs/AussieRetirementSimulator-Spec-v2.md`.
When in doubt about intended behaviour, the spec is the source of truth.
