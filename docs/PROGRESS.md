# Aussie Retirement Simulator — Progress Log

## Current Status

**Phase 1 — Personal MVP** (in progress)
**Branch:** `main`
**Deployed:** Vercel (React + Vite) at production URL
**Auth:** Google OAuth via Supabase ✓

---

## Running Todo List

### ⚠️ CRITICAL — Fix First Next Session

- [ ] **Investment bond drawdown bug** — bonds are called with `drawdownNeeded: 0` always. They never draw down to cover deficits. The deficit waterfall only covers cash → shares. Bonds compound indefinitely regardless of cashflow. This materially overstates liquid assets during the gap period. Fix: restructure the deficit section of `simulationEngine.js` to include bonds in the drawdown waterfall after cash and shares, accounting for the 10-year tax penalty flag.

---

### Done ✓
- [x] Product spec v2, scoping doc, project scaffold
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

### Up Next (after bond fix)
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
