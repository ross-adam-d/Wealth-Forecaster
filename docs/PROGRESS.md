# Aussie Retirement Simulator — Progress Log

## Current Status

**Phase 1 — Personal MVP** (in progress)
**Branch:** `claude/add-scoping-doc-ilNDB`
**Deployed:** Vercel (React + Vite)
**Auth:** Google OAuth via Supabase ✓

---

## Running Todo List

### Done ✓
- [x] Product spec v2 (`docs/AussieRetirementSimulator-Spec-v2.md`)
- [x] Scoping doc (`docs/scoping.md`)
- [x] Project scaffold — Vite, React, Tailwind, React Router
- [x] Supabase auth (Google OAuth), auto-save with debounce
- [x] `constants/index.js` — all rates, caps, thresholds
- [x] `utils/schema.js` — full default scenario data model
- [x] `engine/taxEngine.js` — marginal rates, Medicare levy, franking credits, all packaging types
- [x] `engine/ratePeriodEngine.js` — time-varying rate resolution per asset
- [x] `engine/simulationEngine.js` — 12-step year-by-year loop + retirement date solver
- [x] `modules/super.js` — contributions, SG schedule, caps, accumulation, pension, TTR, drawdowns
- [x] `modules/property.js` — P&I/IO, offset, negative gearing, CGT, sale events
- [x] `modules/shares.js` — growth, dividends, franking, preserve capital, CGT on drawdown
- [x] `modules/investmentBonds.js` — 10-year tracking, 125% rule, pre/post threshold tax
- [x] `modules/expenses.js` — 3-level tree, all amount types, inflation scaling
- [x] `modules/fbt.js` — ECM and statutory method novated lease calculations
- [x] `views/Login.jsx` — Google OAuth login screen
- [x] `views/HouseholdProfile.jsx` — person A/B basic details + packaging (PBI, QLD Health, novated lease)
- [x] `views/GapDashboard.jsx` — viability badge, runway chart, preservation age markers
- [x] `views/Projection.jsx` — net worth + cashflow charts, real/nominal toggle
- [x] `views/ImpactAnalyser.jsx` — lever panel (all 6 groups scaffolded)
- [x] `views/Assumptions.jsx` — full defaults panel
- [x] `components/Layout.jsx` — nav, scenario switcher, ASIC disclaimer footer
- [x] `hooks/useScenario.js` — scenario state, Supabase load/save
- [x] `hooks/useSimulation.js` — simulation runner, retirement date
- [x] `CLAUDE.md` — session rules, design system
- [x] `docs/PROGRESS.md` — this file
- [x] `views/HouseholdProfile.jsx` — full input forms: super (both people), properties (add/remove, P&I/IO/offset/rental/sale), shares, investment bonds (10yr clock badge), expenses (flat list with amount type, discretionary, time-bounding)
- [x] `src/__tests__/` — 188 unit tests across all engines and modules (100% passing)

### In Progress 🔄
_(nothing currently in progress)_

### Up Next — Gap Dashboard completion
- [ ] Inline stress test (expenses slider, return slider, part-time income toggle)
- [ ] Month-by-month cashflow table for gap period
- [ ] Partner-specific gap phase labels (solo gap / joint gap)

### Then — Gap Dashboard completion
- [ ] Inline stress test (expenses slider, return slider, part-time income toggle)
- [ ] Month-by-month cashflow table for gap period
- [ ] Partner-specific gap phase labels (solo gap / joint gap)

### Then — Impact Analyser completion
- [ ] Wire lever values into simulation overrides
- [ ] Base vs adjusted diff columns with headline metric (retirement date delta)
- [ ] Supporting metrics panel (net worth, liquidity runway, gap viability)

### Then — Scenario management UI
- [ ] Named scenario cards with viability status
- [ ] Side-by-side comparison view

### Then — Output Views
- [ ] Liquidity table (year-by-year, bond pre/post 10yr tagged)
- [ ] Expense breakdown stacked area chart
- [ ] One-off events timeline
- [ ] Rate period visualisation per asset

### Phase 2 (future)
- [ ] Age Pension means testing
- [ ] Monte Carlo simulation (500 runs)
- [ ] Division 293 tax
- [ ] Downsizer contribution rule
- [ ] PDF export
- [ ] Public landing page + waitlist

---

## Session Log

### Session — 2026-03-18 (3)

**What was done:**
- Wrote 188 unit tests across 9 test files covering all engines and modules:
  - `taxEngine`: calcIncomeTax (all 5 brackets), Medicare levy, franking credits (refundable in pension phase), calcPersonTax (salary sacrifice, negative gearing, packaging), getMarginalRate, resolvePackagingReductions (PBI/QLD Health caps)
  - `ratePeriodEngine`: single and multi-period resolution, boundary years, beyond-period fallback, gap validation
  - `super`: SG rate schedule (FY2025/26 step), all 6 drawdown age brackets, preservation age, contributions cap warnings, growSuperBalance (accumulation vs pension phase, correct rates, drawdowns, locking)
  - `property`: P&I vs IO repayment formulas, offset interest reduction, negative gearing, IO→P&I step-up, sale CGT with 50% discount, primary residence CGT-exempt
  - `shares`: growth, dividends, franking credits, drawdown, preserve capital (with age gating), CGT on drawdown
  - `investmentBonds`: 10-year threshold, 125% rule breach, pre/post threshold withdrawal tax treatment, clock reset, liquidity tagging
  - `fbt`: statutory and ECM methods, EV exemption, employee contribution offset, days proration, compareMethodsSideBySide
  - `expenses`: inflation compounding, one-off, time-bounded, monthly→annual, discretionary/fixed lever adjustments, tree rollup, tag cascading
- All 188 tests pass. No bugs found in engines — calculation logic is correct.

**State at end of session:**
Engines validated. Safe to build on. Next priority is Gap Dashboard stress test and month-by-month cashflow table — the hero feature.

**Next session should start with:** Gap Dashboard — inline stress test sliders + monthly cashflow table.

---

### Session — 2026-03-18 (2)

**What was done:**
- Built full `HouseholdProfile.jsx` — all input sections now functional:
  - **People** — name, DOB, salary, retirement age, employer type, PBI/QLD Health packaging, novated lease (collapsible, ECM/statutory, EV toggle)
  - **Superannuation** — current balance, employer scheme (SG/match/fixed%), salary sacrifice + concessional cap warning, voluntary concessional & non-concessional + cap warnings, TTR toggle
  - **Properties** — add/remove up to 4; per-property: P&I/IO loan type, offset account, IO expiry warning, rental income/expenses (investment only), sale event with proceeds routing
  - **Share portfolio** — value, annual contribution, dividend yield, franking %, preserve capital toggle
  - **Investment bonds** — add/remove; per-bond: balance, contributions, inception date, 10-year clock badge (tax-free / year X of 10)
  - **Expenses** — flat list with add/remove; per-item: label, amount, annual/monthly/one-off/time-bounded, discretionary flag, date range
- All sections collapsible with `▸`/`▾`. Consistent `CurrencyInput` / `PctInput` primitives.
- Build confirmed clean.

**State at end of session:**
Users can now enter all core data. Simulation will run with real numbers. Next priority is Gap Dashboard stress test and cashflow table — this is the product's hero feature.

**Next session should start with:** Gap Dashboard — inline stress test sliders + month-by-month cashflow table.

---

### Session — 2026-03-18
**What was done:**
- Reviewed full codebase state. All engines and modules confirmed as real implementations (not stubs).
- Created `CLAUDE.md` — session protocol, coding rules, full design system documentation.
- Created `docs/PROGRESS.md` — this file, with full todo list reflecting actual build state.

**State at end of session:**
All Phase 1 infrastructure is complete. The primary remaining work is the Household Profile input forms — without them, users cannot enter data for super, properties, shares, bonds, or expenses, so the simulation runs on defaults only.

**Next session should start with:** Super section of Household Profile.

---
