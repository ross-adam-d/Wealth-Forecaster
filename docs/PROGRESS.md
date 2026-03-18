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

### In Progress 🔄
_(nothing currently in progress)_

### Up Next — Household Profile input forms
The engines are complete but the UI has no way to enter most data yet.
Priority order:

- [ ] **Super section** — salary sacrifice amount, voluntary contributions, employer scheme selector, current balance, TTR toggle
- [ ] **Property section** — add/remove properties, per-property form (value, mortgage, offset, loan type, rental, sale event)
- [ ] **Shares section** — current value, annual contribution, dividend yield, franking %, rate periods UI
- [ ] **Investment bonds section** — balance, annual contribution, inception date
- [ ] **Expenses section** — add/remove expense items, amount type selector, fixed/discretionary tag, time-bounding

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

### Session — 2026-03-18
**What was done:**
- Reviewed full codebase state. All engines and modules confirmed as real implementations (not stubs).
- Created `CLAUDE.md` — session protocol, coding rules, full design system documentation.
- Created `docs/PROGRESS.md` — this file, with full todo list reflecting actual build state.

**State at end of session:**
All Phase 1 infrastructure is complete. The primary remaining work is the Household Profile input forms — without them, users cannot enter data for super, properties, shares, bonds, or expenses, so the simulation runs on defaults only.

**Next session should start with:** Super section of Household Profile.

---
