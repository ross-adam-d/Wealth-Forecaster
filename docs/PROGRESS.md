# Aussie Retirement Simulator — Progress Log

## Current Status

**Phase 1 — Personal MVP** (in progress)
**Branch:** `main`
**Deployed:** Vercel (React + Vite) at production URL
**Auth:** Google OAuth via Supabase ✓

---

## Running Todo List

### Done ✓
- [x] Product spec v2, scoping doc, project scaffold
- [x] **Super pension phase bug** — `inPensionPhase` now requires both retirement AND preservation age (60); early retirees no longer draw super before 60. Regression test added (190 tests).
- [x] **Post-sale rental income leak** — `processPropertyYear` now returns all-zeros for years after `saleEvent.year`; rental income, expenses and mortgage no longer flow after sale. Regression test added.
- [x] **Shares drawdown missing from income** — `sharesDrawdown` now included in `totalIncome`; `isDeficit` only fires when all liquid sources (cash + shares + bonds) are truly exhausted. `sharesDrawdown` added to snapshot and to Cashflow Detail table.
- [x] **Gap Dashboard chart view toggles** — Breakdown / Liquidity / Cashflow views with pill toggle; Cashflow view uses ComposedChart (grouped income/outflow bars + net line).
- [x] **Cashflow Detail table** (Projection page) — collapsible; every income and expense stream year by year; grouped headers; sticky year column + sticky headers; real/nominal toggle; 5-yr step default; auto-hides zero columns; deficit rows red, retirement year blue.
- [x] **Net rental column** — shows signed `netRentalIncomeLoss`; negatively geared years shown in amber with accounting parentheses; visible whenever property is held regardless of gearing direction.
- [x] **Page guides** — collapsible "How this page works" on all 5 main views.
- [x] Supabase auth (Google OAuth), auto-save with debounce
- [x] `constants/index.js`, `utils/schema.js`
- [x] `engine/taxEngine.js`, `engine/ratePeriodEngine.js`, `engine/simulationEngine.js`
- [x] `modules/super.js`, `modules/property.js`, `modules/shares.js`, `modules/investmentBonds.js`, `modules/expenses.js`, `modules/fbt.js`
- [x] All views: Login, HouseholdProfile (full forms), GapDashboard, Projection, ImpactAnalyser, Assumptions
- [x] `components/Layout.jsx`, `hooks/useScenario.js`, `hooks/useSimulation.js`
- [x] 188 unit tests — all passing
- [x] Gap Dashboard: stress test wired to live simulation (expenses + return rate sliders)
- [x] Gap Dashboard: cashflow table with Δ vs base column when stressed
- [x] Gap Dashboard: retirement age sliders for both people
- [x] Projection: cashflow chart shows total outflows (inc. mortgage) + net surplus bar
- [x] Projection: liquidity table annual (was every 5 years)
- [x] Net worth chart: gross property value + mortgage debt as negative area
- [x] Gap runway chart: mortgage debt as negative area
- [x] Bug fix: `sharesResult.frankingRefund` → `taxAFinal.frankingRefund` (was NaN in cashflow table)
- [x] Bug fix: property sale proceeds now added to `totalIncome` (was silently dropped)
- [x] Bug fix: default share capital growth corrected to 4.5% (was 8%, double-counting dividend yield)
- [x] Git: switched from fine-grained PAT to classic PAT for push access
- [x] **Investment bond drawdown bug fix** — deficit waterfall now: cash → shares → bonds (tax-free first, then pre-10yr). Bonds now correctly drawn down during deficit years instead of compounding indefinitely. Two-pass approach: growth-only pass at Step 8, then final pass with actual drawdown amounts after cashflow is known. All 188 tests passing.

### Up Next (prioritised)
- [ ] **Validate model end-to-end with Ross's base plan** — now that core bugs are fixed (super lock, post-sale rental, shares drawdown), confirm Gap viability badge, cashflow detail table, and net worth chart all tell a coherent story
- [ ] Partner-specific gap phase labels — dynamic dates, not placeholder text
- [ ] Add hint in Properties section: "Mortgage repayments are calculated automatically — do not enter them in expenses"
- [ ] Impact Analyser: wire lever values into simulation overrides
- [ ] Impact Analyser: base vs adjusted diff columns with headline metric (retirement date delta)
- [ ] Impact Analyser: supporting metrics panel (net worth, liquidity runway, gap viability)

### Then — Scenario management UI
- [ ] Named scenario cards with viability status
- [ ] Side-by-side comparison view

### Then — Output Views
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

### Session — 2026-03-20 (2)

**What was done:**
- **Gap Dashboard chart toggles**: three views (Breakdown / Liquidity / Cashflow) with pill-style toggle; Cashflow view added using ComposedChart (grouped bars for income vs outflows, net cashflow line)
- **Page guides**: collapsible "How this page works" guide added to all 5 main views (Gap, Projection, Impact Analyser, Household Profile, Assumptions)
- **Cashflow Detail table** added to Projection page — collapsible section, all income and expense streams year by year, grouped two-row sticky headers, sticky year column, real/nominal toggle, 5-yr step default with "show all" checkbox, deficit rows red, retirement year blue, auto-hides zero columns
- **Super pension phase bug** — `inPensionPhase` was triggered at retirement regardless of age; early retirees had super drawn down before preservation age (60). Fixed to require both `year >= retirementYear` AND `hasReachedPreservationAge(personAge)`. Regression test added.
- **Post-sale rental income leak** — `processPropertyYear` kept producing rental income and expenses in years after a sale because the property profile still had `annualRentalIncome`. Fixed with early return of all-zeros when `saleEvent.year < year`. Regression test added.
- **Shares drawdown missing from income** — `sharesAdjustment` was reducing share balances silently without contributing to `totalIncome`, making `netCashflow` look negative and `isDeficit` fire every year shares were drawn. `sharesDrawdown` now included in `totalIncome`; `isDeficit` now only fires when all sources exhausted. `sharesDrawdown` added to snapshot and Cashflow Detail table.
- **Net rental column** — renamed from `rentalIncome`; filter changed to `Math.abs > 500` so negatively geared properties show; negative values displayed in amber with accounting parentheses.
- **Sticky headers** — cashflow detail table container changed to `overflow-auto max-h-[480px]`; group headers `sticky top-0`, column headers `sticky top:33px`, year corner cell pins both axes.
- 190 unit tests passing throughout.

**State at end of session:** Core simulation accuracy issues resolved. Model now correctly locks super before 60, stops rental income after property sale, and accounts for shares drawdown as income. Cashflow Detail table provides the transparency needed to validate and explore the plan.

**Next session should start with:** End-to-end validation of Ross's base plan using the Cashflow Detail table, then partner gap phase labels.

---

### Session — 2026-03-20

**What was done:**
- **Investment bond drawdown bug fixed** — `simulationEngine.js` now uses a two-pass approach for bonds: growth-only pass at Step 8, deficit waterfall (cash → shares → tax-free bonds → pre-10yr bonds) at Step 10, then final bond pass with actual drawdown amounts. Bonds no longer compound indefinitely when the household is running a deficit.
- 188 unit tests still passing. Build clean.

**State at end of session:** Bond drawdown bug resolved. All previously identified critical issues now fixed.

**Next session should start with:** Partner-specific gap phase labels, then Impact Analyser wiring.

---

### Session — 2026-03-19

**What was done:**
- Set up classic PAT for git push (fine-grained PAT blocked git smart HTTP despite correct API permissions)
- **Gap Dashboard stress test wired**: expenses and return rate sliders now re-run simulation via `runSimulation` directly; viability badge, chart, table all reflect stressed scenario; Δ vs base column in table; reset link
- **Retirement age sliders** added to Gap Dashboard beneath runway chart — live simulation update
- **Bug fix**: `sharesResult.frankingRefund` was `undefined` (field doesn't exist on shares module) — was producing NaN across all cashflow fields; fixed to `taxAFinal.frankingRefund`
- **Bug fix**: property sale proceeds (`propertySaleProceeds`) were calculated but never added to `totalIncome` — sale windfall was silently dropped
- **Bug fix**: default share capital growth corrected from 8% to 4.5% — was double-counting the 3.5% dividend yield (total return was 11.5%, should be ~8%)
- **Charts improved**: cashflow chart now shows `totalOutflows` (inc. mortgage) not just living expenses; net surplus/deficit bar added
- **Liquidity table**: now annual (was every 5 years)
- **Net worth + Gap runway charts**: property shown as gross value; mortgage debt shown as negative red area below axis
- **Known critical bug identified**: investment bonds never draw down during deficits — always called with `drawdownNeeded: 0`; materially overstates liquid assets

**State at end of session:**
Several simulation bugs fixed. Charts now accurately represent income, outflows, and liabilities. Bond drawdown bug is critical and must be fixed first next session before any further feature work.

**Next session should start with:** Fix investment bond drawdown waterfall in `simulationEngine.js`.

---

### Session — 2026-03-18 (3)

**What was done:**
- Wrote 188 unit tests across all engines and modules. All passing.

**Next session should start with:** Gap Dashboard — inline stress test sliders + monthly cashflow table.

---

### Session — 2026-03-18 (2)

**What was done:**
- Built full `HouseholdProfile.jsx` — all input sections functional.

---

### Session — 2026-03-18

**What was done:**
- Reviewed full codebase state. Created `CLAUDE.md` and `docs/PROGRESS.md`.

---
