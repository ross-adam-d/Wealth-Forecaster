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
- [x] **Mortgage re-amortisation fix** — repayment now calculated from original loan amount and term (fixed annuity), not recalculated each year. Offset accounts now correctly accelerate payoff (reduced interest → more to principal → early payoff). `originalLoanAmount` and `originalLoanTermYears` added to schema; auto-populated on first entry. Falls back to current-balance calc for legacy data.
- [x] **Deficit break removed** — simulation no longer stops on first deficit year. Runs to end-of-life with cumulative deficit tracking (`cumulativeDeficit`, `firstDeficitYear`, `deficitYears`). Cash buffer goes negative to represent unfunded shortfall.
- [x] **Liquidity exhaustion warnings** — prominent red UI warnings when plan has deficit years: (1) persistent global banner in Layout on every page, (2) large red warning card at top of Gap Dashboard and Projection, (3) deficit rows highlighted red with "!!" markers, (4) viability badge shows deficit year count, (5) liquidity table shows "!!!" next to negative values.
- [x] **Birth year calculation fix** — only persons with valid DOB considered for sim end year; graceful fallback when one/both persons have no DOB.
- [x] **Super initialisation guard** — `superAccounts.find()` guarded against returning `undefined`.
- [x] 195 unit tests passing (5 new mortgage tests).
- [x] **Investment bond contribution modes** — bonds now properly deducted from cashflow. Two modes: Fixed (guaranteed expense-like outflow) and Surplus (funded from surplus waterfall at user-set priority). Maximise toggle auto-ratchets at 125%/yr. Bond contributions column in cashflow detail table. Surplus Strategy UI includes bonds when surplus-mode bonds exist. 211 tests passing (16 new).
- [x] **Unified contribution model** — all non-property investments (shares, bonds, other assets) now support fixed/surplus contribution modes + annual increase rate. Shares no longer absorb all surplus — gets up to target contribution only. Surplus routing handles all asset types. Cashflow table shows per-asset contribution columns. 225 tests passing.
- [x] **Shares surplus routing fix** — legacy scenarios with annualContribution=0 now absorb all remaining surplus (old behavior preserved). Explicit target: caps at that amount. Fixes retirement 52→53 discontinuity bug.
- [x] **Other income sources** — new module for non-salary income (consulting, gifts, pensions, etc). Annual/monthly/one-off amounts, % or $ annual adjustment, tax attribution per person, taxable/non-taxable. Integrated into tax engine and cashflow. 14 new tests.
- [x] **3-level expense nesting** — recursive ExpenseNode UI supports group → category → subcategory hierarchy. Engine already supported it; UI now exposes full tree with add/remove at each level.
- [x] **Debts** — personal loans (P&I amortisation), leases (upfront interest + residual), credit cards (payoff or revolving). Repayments in totalOutflows, balances deducted from net worth. New column in liquidity table and net worth chart. 13 new tests.
- [x] **Novated lease UX** — auto-expand on add, ECM offset checkbox with auto-calc, FBT breakdown panel, start/end year wired into simulation. 255 tests passing.

### Up Next (prioritised)
- [ ] **Validate model end-to-end with Ross's base plan** — confirm mortgage offset works correctly, deficit warnings fire when expected, and projection runs to end-of-life
- [ ] **Projection chart view toggle** — main graph switchable between: net worth (current default), liquidity, liquidity breakdown (stacked columns)
- [ ] **Investment breakdown view** — year-by-year table or chart showing each investment asset growing/depleting over time
- [ ] **Cashflow chart overhaul** — replace current annual cashflow chart with toggle for: income, income breakdown, expenses, expense breakdown (stacked column), surplus/deficit (+/- over/under x-axis)
- [ ] **Cashflow chart real/nominal fix** — cashflow chart doesn't respond to today's vs real dollars toggle
- [ ] Partner-specific gap phase labels — dynamic dates, not placeholder text
- [ ] Add hint in Properties section: "Mortgage repayments are calculated automatically — do not enter them in expenses"
- [ ] Impact Analyser: wire lever values into simulation overrides
- [ ] Impact Analyser: base vs adjusted diff columns with headline metric (retirement date delta)
- [ ] Impact Analyser: supporting metrics panel (net worth, liquidity runway, gap viability)

### Then — Scenario management UI
- [ ] Named scenario cards with viability status
- [ ] Side-by-side comparison view

### Then — Output Views
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

### Session — 2026-03-21 (2)

**What was done:**
- **Shares surplus routing fix** — retirement 52→53 discontinuity root cause identified and fixed. Legacy shares (annualContribution=0, surplus mode) now absorb all remaining surplus as before. Only caps at target when explicit annualContribution > 0. Surplus Strategy UI also fixed to show shares regardless of target amount.
- **Other income sources** — full end-to-end feature. New `otherIncome.js` module, schema, tax engine integration (`otherIncome` param on `calcPersonTax`), simulation engine integration. Supports annual/monthly/one-off, % or $ annual adjustment (increase or decrease), tax attribution (Person A/B/joint 50-50), taxable/non-taxable flag. UI with collapsible items in HouseholdProfile. "Other income" column in cashflow detail table.
- **3-level expense nesting** — rebuilt expense UI with recursive `ExpenseNode` component. Group → Category → Subcategory with add/remove at each level. Each level can hold own amount + children (totals roll up). Engine already supported this hierarchy.
- **Debts** — new `debts.js` module with three types: personal loans (standard P&I amortisation), leases (interest calculated upfront, flat repayments, residual/balloon at end), credit cards (payoff mode with min 2% or revolving/interest-only). Engine integration: repayments in `totalOutflows`, balances deducted from `totalNetWorth`. Liquidity table "Debts" column, net worth chart negative area, cashflow detail "Debt repay" column.
- **Novated lease UX overhaul** — auto-expand on add; "Offset FBT with ECM" checkbox auto-calculates employee contribution to eliminate FBT; FBT breakdown panel (taxable value, liability, packaging reduction, tax saving, net benefit); lease start/end year fields wired into simulation engine (`activeYears` now functional).
- **255 tests passing** (30 new: 14 other income, 13 debts, 3 retirement discontinuity diagnostic).

**State at end of session:** Major feature additions deployed. Other income, debts, nested expenses, and lease UX all live. Shares surplus routing regression fixed.

**Next session should start with:** Test all new features in live app. Validate debts appear in liquidity table and net worth chart. Test lease with residual, credit card revolving mode. Test other income tax attribution.

---

### Session — 2026-03-21

**What was done:**
- **Investment bond contribution modes** — critical bug fix + feature. Bond annual contributions were previously applied internally without deducting from cashflow (free money). Now two modes:
  - **Fixed expense**: contribution deducted from cashflow as outflow each year, guaranteed regardless of surplus. Can create deficit if income insufficient.
  - **From surplus**: contribution funded from surplus waterfall; user sets priority alongside offset/shares/cash. No surplus = no contribution. Capped at 125% of prior year.
- **Maximise contribution toggle**: auto-ratchets at 125% of prior year's actual contribution each year. Warning shown in UI about cashflow erosion.
- **Engine changes**: `processBondYear` accepts `resolvedContribution` parameter; `simulationEngine.js` resolves contributions per mode before cashflow calc; fixed contributions in `totalOutflows`; surplus contributions in waterfall; `priorYearContribution` now tracks actual effective contribution (not configured amount).
- **UI**: BondForm has Fixed/Surplus toggle + Maximise checkbox. Surplus Strategy section auto-includes bonds when surplus-mode bonds exist.
- **Cashflow detail table**: new "Bond contrib" expense column.
- **211 tests passing** (16 new: 4 unit, 12 integration).
- **Unified contribution model** — generalized fixed/surplus + annual increase to ALL non-property investments (shares, bonds, other assets). Bond `maximiseContribution` replaced with generic `annualIncreaseRate` (capped at 25% for bonds). Shares surplus routing changed from "absorb all" to "up to target contribution". `OTHER_ASSETS` added to surplus destinations. Cashflow detail table shows shares/bonds/other contributions separately. Surplus Strategy UI auto-shows destinations for assets in surplus mode.
- **225 tests passing** (14 new unified contribution integration tests).

**State at end of session:** All non-property investment contributions properly accounted for in cashflow. Consistent model: user picks fixed (expense) or surplus (waterfall) per asset, sets an annual increase rate, and arranges surplus priority.

**Next session should start with:** Test unified contribution model in the live app. Verify shares/bonds/other assets all show correctly in cashflow table and surplus routing.

---

### Session — 2026-03-20 (3)

**What was done:**
- **Full codebase review** — identified critical bugs, code quality issues, and improvement opportunities across all engine, module, view, and utility files
- **Mortgage re-amortisation fix** — P&I repayment now uses fixed annuity from original loan terms instead of recalculating each year. Offset accounts now correctly accelerate mortgage payoff. Added `originalLoanAmount` and `originalLoanTermYears` to property schema with auto-population in HouseholdProfile. 5 new property tests.
- **Deficit break removed** — `if (isDeficit) break` removed from simulation engine. Simulation now runs to end-of-life through deficit years. Tracks `cumulativeDeficit`, `firstDeficitYear`, and `deficitYears` array. Cash buffer goes negative to represent unfunded shortfall.
- **Liquidity exhaustion warnings** — 3-tier alert system: (1) persistent red banner in Layout header on every page ("PLAN NOT VIABLE"), (2) large red warning card at top of Gap Dashboard and Projection with deficit details, (3) deficit rows red-highlighted with "!!" markers in all tables.
- **Birth year calculation fix** — sim end year now only considers persons with valid DOBs; graceful fallback when one/both are missing.
- **Super initialisation guard** — `superAccounts.find()` guarded against `undefined` to prevent silent crash.
- 195 unit tests passing (was 190). Build clean.

**State at end of session:** Four critical engine bugs fixed, prominent deficit UI warnings added. Model now runs full lifespan even through deficit years, mortgage offset works correctly, and users cannot miss a non-viable plan.

**Next session should start with:** End-to-end validation of Ross's base plan — confirm mortgage offset accelerates payoff, deficit warnings fire when expected, and charts tell a coherent story through to end-of-life.

---

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
