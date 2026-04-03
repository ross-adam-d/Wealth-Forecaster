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
- [x] **Investment holdings + new asset categories** — individual holdings (shares, super, TB, commodities) with weighted-average aggregation. Treasury/corporate bonds and commodities as new asset categories. Investment pie chart. 521 tests.
- [x] **End-to-end model validation** — 25-test suite covering: mortgage offset waterfall, surplus routing priority, shares/bonds contributions, super pension phase transition, salary retirement cutoff, debt payoff, other income windows, novated lease FBT pro-rating, deficit detection, retirement age proportionality, NaN/Infinity guards, cashflow reconciliation, net worth consistency, custom drawdown order, post-retirement income routing, accumulation cessation.
- [x] **Novated lease in charts** — lease reduction stored in snapshot; shown as expense in Sankey ("Novated lease (net)") and included in cashflow chart outflows. Detail table has "Novated lease" column.
- [x] **Other income in Sankey** — `totalOtherIncome` now appears as income node in cashflow flow diagram.
- [x] **Cashflow chart real/nominal fix** — Y-axis subtitle shows "today's dollars" vs "nominal (projected)" matching net worth chart. Sankey also receives `transform` function and adjusts all values for real/nominal toggle.
- [x] **One-off income as real dollars** — one-off future income inflated to nominal in engine (user enters today's money; $1M in 2046 = $1M today, inflated to ~$1.6M nominal).
- [x] **Post-retirement accumulation stop** — all fixed/surplus contributions to shares, bonds, and other assets cease when all persons retire. Balances continue to compound but no new money flows in.
- [x] **Drawdown strategy** — configurable priority order for deficit asset drawdowns: cash, shares, bonds, other assets, super. UI section in Household Profile mirrors surplus strategy pattern.
- [x] **Post-retirement income routing** — other income sources can be directed to specific vehicles (shares, bonds, other assets, cash) after retirement instead of flowing through general cashflow. New `routeTo` field on each income source.
- [x] **Contribution capping** — fixed contributions no longer force asset drawdowns. Capped at available cashflow (income minus essential outflows). If income drops below expenses + mortgage + debts, contributions scale down proportionally.
- [x] **Routed income duplication fix** — income routed to a vehicle is now subtracted from general cashflow so it only goes to one destination (was double-counted: vehicle + cash).
- [x] **Dynamic liabilities in cashflow detail table** — new LIABILITIES column group (amber) between ASSETS and NET. Dynamically built from scenario properties (mortgage balances) and debts (loans, leases, credit cards). Each liability gets its own named column plus a "Total liabilities" summary. Auto-hides when no liabilities exist. Removed redundant `debtsBal` from ASSET_COLS.
- [x] **Projection chart view toggle** — main graph switchable between: net worth (current default), liquidity, liquidity breakdown (stacked columns)
- [x] **Investment breakdown view** — year-by-year chart showing each investment asset growing/depleting over time
- [x] **Cashflow chart overhaul** — replace current annual cashflow chart with toggle for: summary, income breakdown, expense breakdown (stacked column), surplus/deficit (+/- over/under x-axis)
- [x] **Timeline label fix** — added `z-20` to label container so labels render above dots (`z-10`)
- [x] **Compare deficit visibility** — red Xs for losing metrics, red text for losers, red-highlighted deficit rows with warning icon
- [x] **Compare chart x-axis fix** — "Full plan" range now caps at plan end year; `XAxis type="number" domain` prevents padding
- [x] **Recurring expense frequency** — new `recurring` amountType with configurable `recurringEveryYears` (e.g. buy car every 10 years from 2026 to 2070). Engine fires expense only in matching years within active window. UI: dropdown option + frequency input + summary hint. 7 new tests.
- [x] **Month precision across app** — `yearFraction()` and `extractYear()` utilities support "YYYY-MM" strings. Expenses and other income modules pro-rate amounts for partial years. 19 new format utility tests.
- [ ] Partner-specific gap phase labels — dynamic dates, not placeholder text
- [ ] Add hint in Properties section: "Mortgage repayments are calculated automatically — do not enter them in expenses"
- [x] Impact Analyser: wire lever values into simulation overrides
- [x] Impact Analyser: base vs adjusted diff columns with headline metric (retirement date delta)
- [x] Impact Analyser: supporting metrics panel (net worth, liquidity runway, gap viability)
- [x] **Retirement Goal Planner** — reverse engine: set target retirement age, manipulate expense/income/return sliders to make it viable. $/% toggle, baseline scenario selector, hero age with viability badge, supporting metrics grid.
- [x] **Per-page tutorials** — shared Tutorial component with step-through overlay, localStorage persistence, "?" re-open button. Tutorials on all 7 views + global welcome tutorial (fires first, pages wait).
- [x] **Scenario cards pin/hide** — replaced scroll-based auto-hide with manual toggle button in header.
- [x] **Engine pre/post-retirement lever splits** — `leverAdjustments.expenses` and `leverAdjustments.returns` support `{ preRetirement, postRetirement }` with per-year resolution based on retirement state.

### Backlog (prioritised)
0. [ ] **Month picker UI** — add "YYYY-MM" inputs for expense activeFrom/activeTo, other income date fields, property sale event date. Engine already supports month precision.
1. [ ] **HECS/HELP debt** — repayment thresholds, compulsory repayment from taxable income, indexation (CPI), voluntary repayment option. Integrated into tax engine so net take-home reflects HELP repayment.
2. [ ] **Light mode** — theme toggle (dark/light). CSS variables or Tailwind dark: prefix strategy. Persist preference in localStorage.
3. [ ] **Mobile optimisation** — responsive layout for phone screens. Collapsible sections, stacked grids, touch-friendly inputs, chart sizing.
4. [ ] **Income time periods** — salary input with period selector (annual/monthly/fortnightly/weekly). Store as annual internally, convert on display.
5. [x] **Property selling costs** — `sellingCostsPct` on sale event (default 2.5%). Deducted from gross proceeds, reduces CGT gain. UI shows estimated $ amount.
6. [ ] **Temporary income reduction** — model career breaks, parental leave, sabbaticals. Year range + reduced salary amount or % reduction.
7. [ ] **Enlarge investment pie chart** — bigger donut, better label readability, possibly full-width on its own row.
8. [x] **Stamp duty on property purchase** — state/territory selector, FHB exemption toggle. Progressive brackets for all 8 states. Displayed as info below purchase price.
9. [x] **Land tax** — annual land tax via progressive brackets per state. Integrated into net rental income (deductible). PPOR exempt.
10. [x] **Property purchase as outflow** — future property purchase with `futurePurchaseYear`. Property returns zeros before purchase year; stamp duty + deposit computed as cash outflow in purchase year. Wired into engine `essentialOutflows`. Timeline shows "Buy" events. 5 new tests.
11. [x] **One-off/large expenses and windfalls on timeline** — expenses >= $10k and windfall income now show on life events timeline. Fixed windfall detection bug (`frequency` → `amountType`).

### Previously completed
- [x] Named scenario cards with viability status
- [x] Side-by-side comparison view
- [x] One-off events timeline
- [ ] Rate period visualisation per asset

### Phase 2 (future)
- [x] Age Pension means testing
- [ ] Monte Carlo simulation (500 runs)
- [x] Division 293 tax
- [x] Downsizer contribution rule
- [ ] PDF export
- [ ] Public landing page + waitlist

---

## Session Log

### Session 17 — 2026-04-04

**What was done:**
- **Clearable number inputs** — all `type="number"` fields now allow full deletion via `numVal()` helper. No more stuck values or rapid escalation from spinner arrows on empty fields.
- **Validation warnings** — amber banner at top of Household Profile when critical fields missing (DOB, retirement age).
- **Property: purchased with cash** — "Purchase method" dropdown. Selecting cash hides mortgage/offset fields.
- **Sale proceeds routing** — expanded destination to all 8 investment types (was 3). Engine now respects the destination field — directed proceeds bypass surplus waterfall and land directly in the target asset. Fallback to cash if target asset type doesn't exist.
- **Backlog written** — 9 items: HECS/HELP, light mode, mobile, income periods, selling costs, temp income reduction, pie chart size, stamp duty, land tax.
- 2 new scenario tests for sale proceeds routing. **523 tests passing.**

**Property features (same session):**
- **Selling costs** — `sellingCostsPct` on sale event (default 2.5%). Deducted from gross sale price before CGT and proceeds routing. UI shows % input + estimated $ hint.
- **Stamp duty** — state/territory selector on property, FHB exemption toggle. Progressive bracket calculation for all 8 states. Info line below purchase price.
- **Land tax** — annual land tax for investment properties via progressive state brackets. Deducted from net rental income (tax deductible). PPOR exempt.
- **Timeline events** — one-off expenses >= $10k, large recurring expenses, and windfall income now appear on life events timeline.
- Engine: `totalLandTax`, `totalSellingCosts` in snapshot. 20 new property tests. **543 tests passing.**

### Session 16 — 2026-04-01

**What was done:**
- **Scenario card stale values fix** — `useMemo` dependency changed from `[scenario]` (reference equality) to `[JSON.stringify(scenario)]` for content-based comparison. End values now update dynamically when scenario data changes.
- **Treasury/Corporate Bonds** — new asset category. Capital growth + coupon income (taxed as ordinary income, no franking). CGT discount on drawdown. Preserve capital mode with age gating. Module: `src/modules/treasuryBonds.js`, tests: `src/__tests__/treasuryBonds.test.js` (9 tests).
- **Commodities** — new asset category for forex, metals, oil. Pure capital growth, no income. CGT on drawdown. Module: `src/modules/commodities.js`, tests: `src/__tests__/commodities.test.js` (7 tests).
- **Individual holdings** — shares, treasury bonds, commodities, and super now support individual holdings (e.g. VAS, VGS, BHP). Holdings aggregate to weighted-average rates at category level. Surplus/drawdown distributed proportionally. New utility: `src/utils/holdings.js` with `aggregateHoldings()`, `distributeProportionally()`, `projectHoldings()` (16 tests).
- **Super holdings** — separate accumulation (`returnRate`, default 7%) and pension phase (`pensionReturnRate`, default 6%) return rates per holding. Weighted average replaces flat rate.
- **Investment Bonds renamed** — "Investment Bonds" → "Tax-Deferred Bonds — 10yr" throughout UI.
- **Engine integration** — full integration of treasury bonds and commodities into simulation engine: growth, tax, contributions, surplus waterfall, drawdown waterfall, balance updates, holdings redistribution, snapshots.
- **Age pension update** — `treasuryBondsValue` and `commoditiesValue` added to asset test and deeming calculations.
- **UI forms** — HouseholdProfile: new Treasury/Corporate Bonds and Commodities sections, HoldingsSubForm component (reusable across shares/super/TB/commodities), surplus/drawdown strategy updated with new categories, other income `routeTo` updated.
- **Assumptions panel** — new sections for treasury bonds (growth + coupon) and commodities return rate.
- **Charts updated** — Projection, GapDashboard, Compare all include treasury bonds (#22d3ee) and commodities (#f472b6) in stacked area/bar charts. Detailed table has new columns.
- **Investment pie chart** — new `InvestmentPieChart` component with year slider. Donut chart showing distribution across all asset classes. Integrated into Projection page.
- **Scenario tests** — new "Diversified Portfolio" archetype (shares with holdings, treasury bonds, commodities, surplus routing) + backward compatibility test. 521 tests passing (up from 513).
- Constants: `TREASURY_BONDS_RETURN_RATE=0.04`, `TREASURY_BONDS_COUPON_RATE=0.03`, `COMMODITIES_RETURN_RATE=0.05`. Updated surplus destinations, drawdown sources, default drawdown order.
- Schema: new `createDefaultTreasuryBonds()`, `createDefaultCommodities()`, `createDefaultShareHolding()`, `createDefaultSuperHolding()`, `createDefaultTreasuryBondHolding()`, `createDefaultCommodityHolding()`.
- Backward compat: `useScenario` hydration merges defaults for missing fields. Legacy scenarios work unchanged.
- **Net worth figure alignment fix** — three issues causing discrepancies between screens:
  1. Net worth chart used gross property value + separate mortgage debt instead of property equity; also missing other assets. Now uses `propertyEquity` and includes all asset classes.
  2. ScenarioCards, ImpactAnalyser, RetirementGoal showed raw nominal values while Projection/GapDashboard applied real/nominal transform. All views now respect the global `displayReal` toggle.
  3. Chart label updated: "Property (gross)" → "Property (equity)".

**State at end of session:** Full investment holdings + two new asset categories + net worth consistency fix. 521 tests passing, build clean. Deployed.

---

### Session — 2026-03-28

**What was done:**
- **Retirement Goal Planner** (`/goal` route, `RetirementGoal.jsx`) — reverse engine tool. User sets target retirement age (hero number, +/- buttons, slider 40-70), then adjusts lever sliders to make it viable. Levers: pre/post-retirement expenses, pre-retirement income, pre/post-retirement returns. Expenses and income support $/% toggle. Baseline scenario selector dropdown. Supporting metrics: liquid assets at retirement, net worth, min liquidity, deficit years, peak net worth. Real-time simulation via `useMemo`. Viability badge (green/red). Baseline retirement age comparison text.
- **Engine pre/post-retirement lever splits** — `simulationEngine.js` extended: `leverAdjustments.expenses` and `leverAdjustments.returns` now support `{ preRetirement: {}, postRetirement: {} }` structure. Per-year resolution inside simulation loop based on whether all persons have retired. Backward-compatible — falls back to original behavior when no split provided. All 481 tests passing.
- **Income lever fix** — dollar-mode income now adds flat amount to Person A's salary only (was converting to % applied to both, causing non-monotonic viability from tax bracket distortion).
- **Per-page tutorials** — extracted shared `Tutorial.jsx` component (step-through overlay, progress bar, Back/Next/Skip, localStorage persistence, `useTutorial` hook, `TutorialButton` component). Added tutorials to all 7 views: Assumptions (4 steps), Household (5), The Gap (4), Projection (4), Impact (4), Compare (3), Goal (5). Each page has "?" button to re-open.
- **Global welcome tutorial** — 4-step onboarding in Layout. Fires once on first visit. Directs users to start with Assumptions then Household. Page tutorials wait until welcome is dismissed (`waitFor` option on `useTutorial`).
- **Scenario cards pin/hide** — replaced scroll-based auto-hide with manual toggle button in header. Blue-tinted when pinned, grey when collapsed.
- **Old GuideBox components removed** — all inline collapsible guide boxes replaced by the tutorial system.
- 481 tests passing. Build clean. Deployed to Vercel.

**State at end of session:** Goal Planner feature complete, full tutorial system across all pages, scenario cards UX improved. Deployed.

---

### Session — 2026-03-24

**What was done:**
- **Timeline label z-index fix** — label container now `z-20` so level-0 labels render above dots (`z-10`) instead of behind them.
- **Compare table deficit visibility** — `WinIndicator` now shows red X (`✗`) for losing scenario alongside green checkmark for winner. Losing values colored red. Deficit-related rows (`deficitCount`, `firstDeficitYear`, `cumulativeDeficit`) get `bg-red-900/20` highlight and `⚠` warning icon when either scenario has deficits.
- **Compare chart x-axis fix** — "Full plan" range filter now caps data at `planEndYear` (max of both scenarios' last snap year). All `XAxis` elements use `type="number" domain={['dataMin', 'dataMax']}` to prevent Recharts adding padding beyond data range.
- **Timeline label spacing** — increased label-to-dot gap (bottom 22px → 30px) for clearer separation.
- **Compare chart → line charts** — switched from AreaChart to LineChart (no fill, strokeWidth 2.5). Removed breakdown view (too busy for comparison).
- **Compare table toned down** — removed green/red win/lose coloring from all metrics. Only non-viable data points (deficit years > 0, first deficit year, cumulative shortfall) shown in red with ✗ indicator.
- **Recurring expense frequency** — new `recurring` amountType with configurable `recurringEveryYears`. Engine fires expense only when `(year - activeFrom) % every === 0` within active window, with inflation applied to firing year. UI: "Recurring (other)" dropdown option, "Every X years" input (defaults to 5), summary hint showing schedule. Schema: `recurringEveryYears` field added to expense nodes. 7 new tests.
- **Scenario validation suite** — 12 archetype scenarios × 10 universal invariants + 35 behavioural assertions + 12 golden metric snapshots = 158 new tests. Archetypes: young single renter, dual income family, late career maximiser, single parent (Age Pension), high earner (Div293), retiree couple, property investor (neg gearing + sale), novated lease PBI, downsizer, aggressive saver, debt-heavy, recurring expenses. Universal invariants: cashflow reconciliation, no NaN/Infinity, salary-at-retirement, super pension phase timing, debt non-negative, expense non-negative, accumulation stop, warnings present.
- 481 tests passing. Build clean.

**State at end of session:** Compare page polish, recurring expenses, comprehensive scenario validation suite shipped.

---

### Session — 2026-03-23

**What was done:**
- **Scenario cards with viability status** — replaced `<select>` dropdown in Layout with visual scenario cards strip. Each card shows: scenario name (double-click to rename), viability badge (Viable/At Risk/Not Viable based on deficit years), retirement year/age, end net worth, deficit year count. Active card highlighted with brand border/ring. Duplicate and delete actions on active card. Dashed "+ New Scenario" card. Each card runs its own simulation via `useScenarioSummary` hook (memoised). `deleteScenario` and `renameScenario` added to `useScenario` hook with Supabase sync.
- **Side-by-side scenario comparison** — new `/compare` route and `Compare.jsx` view. Two scenario selectors, viability badges, 10-metric comparison table with green checkmark winners (retirement year, net worth at retirement/end, liquid assets, peak net worth, deficit years, first deficit, cumulative shortfall). Delta summary card (end net worth, liquid at retirement, deficit years — A vs B). Guide box. Graceful fallback when <2 scenarios exist.
- **Life events timeline** — `LifeEventsTimeline` component on Projection page between controls and net worth chart. Extracts events from scenario config + simulation snapshots: retirement (A/B/both), super unlock, property sales, mortgage payoffs, debt payoffs, Age Pension start, novated lease end, downsizer contributions, first deficit year. Horizontal timeline with color-coded dots. Month-precision sorting (lease "2029-08" → sortKey 2029.58, displays "Aug 2029"). Staggered callout lines for dense events (within 2 years). Auto-hides when no events detected.
- **Scenario cards auto-hide** — cards strip slides up with fade on scroll down (40px threshold), reappears on scroll to top.
- **Compare overlay chart** — overlay AreaChart on Compare page with pill toggle: Net Worth (two overlapping areas), Liquidity (same), Breakdown (stacked areas per asset class — solid A, dashed B). Timeline range selector, retirement reference lines per scenario. Colour A = brand blue, B = emerald.
- **Nav update** — "Compare" link added to top navigation bar.
- 316 tests passing. Build clean.

**State at end of session:** UI/UX features shipped — scenario cards, comparison view with overlay chart, life events timeline. All existing tests pass.

**Known issues for next session:**
1. Timeline: level-0 labels sit behind dot row — need above/below alternation
2. Compare: deficit years not visually prominent — needs red Xs (losing metric), red row highlights for deficit/viability
3. Month precision needed app-wide — expenses start/end, one-off dates, property sale, other income activeFrom/activeTo, asset acquisition. Engine pro-rating for fractional years. Schema: year fields → "YYYY-MM" strings with backward compat.

---

### Session — 2026-03-22

**What was done:**
- **Division 293 tax** — `calcDiv293()` in `super.js`: additional 15% on concessional super contributions when income + contributions > $250k, taxed on lesser of contributions or excess above threshold. Integrated into `processContributions()` — returns `div293Tax`, `div293Income`, `div293Subject` fields with warning message. Constants: `DIV293_THRESHOLD = 250,000`, `DIV293_RATE = 0.15`. 6 tests.
- **Age Pension means testing** — new `agePension.js` module with 4 functions: `calcDeemedIncome()` (lower/upper rate deeming), `calcAssetTestPension()` (taper per $1,000 above threshold), `calcIncomeTestPension()` (50c/$1 taper above free area), `calcAgePension()` (integration — eligibility, assessable assets, deemed income, min of both tests, couple splitting). Primary residence exempt, accumulation-phase super exempt. 18 new constants. 21 tests.
- **Downsizer contribution** — `calcDownsizerContribution()` in `super.js`: up to $300k per person from property sale proceeds into super, outside normal caps, no contributions tax, age 55+ eligible. Ownership percentage support. 8 tests.
- **Engine integration** — `simulationEngine.js` updated: downsizer contributions added to super balances after property sales (tax-free, outside caps); Age Pension calculated and added to income (tax-free); Division 293 added as essential outflow. All three features added to year snapshot and warnings.
- **316 tests passing** (35 new).

- **Projection chart view toggle** — pill toggle on net worth chart switches between: Net Worth (stacked areas with property/super/shares/bonds/cash minus debts), Liquidity (single green area of total liquid assets), Breakdown (stacked areas of liquid asset components — cash, shares, bonds, other assets, unlocked super A/B). Uses same pattern as Gap Dashboard toggle.
- **Investment breakdown chart** — new stacked column chart between cashflow and liquidity table. Shows full portfolio: liquid assets (solid bars — cash, shares, bonds, other, unlocked super) and illiquid assets (faded bars — property equity, locked super, pre-10yr bonds). Own timeline dropdown (10/20/40/full).
- **Cashflow chart overhaul** — pill toggle with 4 views: Summary (grouped bars: income/outflows/net), Income (stacked bars: salary A/B, super drawdown, Age Pension, dividends, rental, other, property sale), Expenses (stacked bars: living expenses, tax, mortgage, debt, invest contrib, lease), Surplus (ComposedChart: green surplus bars + red deficit bars below zero line + net cashflow line).

- **Novated lease expense fix** — lease column in cashflow detail table was double-counting: pre-tax reduction (already embedded in reduced salary) was shown alongside post-tax employee contribution. Fixed to show only post-tax costs (`totalLeasePostTaxCost`). Residual/balloon now attributed to correct year (uses `activeYears.to` not `fromYear + term - 1`). Sankey diagram updated to use `totalLeasePostTaxCost`.
- **Mortgage after sale fix** — mortgage column was using `totalOutflows - totalExpenses` which caught debts, div293, lease costs etc. Fixed to use actual `propertyResults.annualRepayment` — correctly shows zero after property sale.
- **Expense UI restructure** — removed `time_bounded` as amountType (redundant — annual/monthly with start/end dates achieves the same thing). All expenses now show start/end year fields (defaulting to plan start/end year). One-off expenses show a single "Date (year)" field instead. Starter expenses updated (`school_fees` now `annual`).

**State at end of session:** Engine features, chart improvements, lease/mortgage fixes, and expense UI all implemented. 316 tests passing.

---

### Session — 2026-03-21 (6)

**What was done:**
- **Dynamic liabilities in cashflow detail table**: New LIABILITIES column group (amber-colored header) between ASSETS and NET. Columns built dynamically from `scenario.properties` (mortgage balances via `propertyResults[i].mortgageBalance`) and `scenario.debts` (closing balances via `debtResult.results[i].closingBalance`). Each liability uses its name from the scenario. Includes "Total liabilities" summary column. Auto-hides empty columns and entire group when no liabilities exist. Removed redundant `debtsBal` from ASSET_COLS since liabilities now have their own section. Real/nominal transform applied.

**State at end of session:** Cashflow detail table now shows full balance sheet — assets AND liabilities tracked year-by-year. 281 tests passing. Deployed to production.

---

### Session — 2026-03-21 (5)

**What was done:**
- **Novated lease in charts**: `leaseReductionA`/`leaseReductionB` stored in snapshot. Sankey shows "Novated lease (net)" as expense node. Cashflow chart outflows bar includes lease. Detail table has "Novated lease" expense column.
- **Other income in Sankey**: `totalOtherIncome` added as purple income node on left side of Sankey diagram.
- **Cashflow chart real/nominal**: Y-axis subtitle added to cashflow chart matching net worth chart. Sankey now receives `transform` function — all dollar amounts respond to real/nominal toggle.
- **One-off income as real dollars**: `resolveOtherIncomeAmount()` inflates one-off amounts by `inflationRate^yearsFromNow`. User enters today's money; engine converts to nominal.
- **Post-retirement accumulation stop**: `allRetired` check at Step 8 — `resolveTargetContribution()` returns 0 when all persons retired. No more bond contributions in the 80s from super.
- **Drawdown strategy**: New `drawdownOrder` on scenario (default: cash → shares → bonds → otherAssets → super). Engine deficit waterfall uses configurable order. UI section in Household Profile with reorderable dropdowns.
- **Post-retirement income routing**: New `routeTo` field on other income sources (cashflow/shares/bonds/otherAssets/cash). When all retired, routed income bypasses general cashflow and goes directly to target vehicle. Still taxed normally.
- **Contribution capping fix**: Fixed contributions capped at available cashflow (income − essential outflows). Prevents selling shares to fund bond contributions when income drops.
- **Routed income duplication fix**: `totalRoutedContributions` subtracted from `prelimNetCashflow` — income now goes to ONE destination only.
- **281 tests passing** (3 new: drawdown order, income routing, accumulation cessation).

**State at end of session:** Major engine improvements — retirement phase properly modeled with configurable drawdown strategy, income routing to vehicles, and contribution capping. All chart/display issues fixed. Deployed to production.

---

### Session — 2026-03-21 (2)

**What was done:**
- **Shares surplus routing fix** — retirement 52→53 discontinuity root cause identified and fixed. Legacy shares (annualContribution=0, surplus mode) now absorb all remaining surplus as before. Only caps at target when explicit annualContribution > 0. Surplus Strategy UI also fixed to show shares regardless of target amount.
- **Other income sources** — full end-to-end feature. New `otherIncome.js` module, schema, tax engine integration (`otherIncome` param on `calcPersonTax`), simulation engine integration. Supports annual/monthly/one-off, % or $ annual adjustment (increase or decrease), tax attribution (Person A/B/joint 50-50), taxable/non-taxable flag. UI with collapsible items in HouseholdProfile. "Other income" column in cashflow detail table.
- **3-level expense nesting** — rebuilt expense UI with recursive `ExpenseNode` component. Group → Category → Subcategory with add/remove at each level. Each level can hold own amount + children (totals roll up). Engine already supported this hierarchy.
- **Debts** — new `debts.js` module with three types: personal loans (standard P&I amortisation), leases (interest calculated upfront, flat repayments, residual/balloon at end), credit cards (payoff mode with min 2% or revolving/interest-only). Engine integration: repayments in `totalOutflows`, balances deducted from `totalNetWorth`. Liquidity table "Debts" column, net worth chart negative area, cashflow detail "Debt repay" column.
- **Novated lease UX overhaul** — auto-expand on add; "Offset FBT with ECM" checkbox auto-calculates employee contribution to eliminate FBT; FBT breakdown panel (taxable value, liability, packaging reduction, tax saving, net benefit); lease start/end year fields wired into simulation engine (`activeYears` now functional).
- **255 tests passing** (30 new: 14 other income, 13 debts, 3 retirement discontinuity diagnostic).

**State at end of session:** Major feature additions deployed. Other income, debts, nested expenses, and lease UX all live. Shares surplus routing regression fixed.

### Session — 2026-03-21 (3)

**What was done:**
- **Bonds surplus routing fix** — surplus-mode assets (bonds, shares, other assets) are now auto-added to the engine's routing order if they're not already present. Previously, the UI auto-added them for display but didn't persist to `surplusRoutingOrder`, so the engine would skip them. This caused surplus to fall through to cash instead of funding bonds. Engine now mirrors UI's auto-add logic before the waterfall loop.
- **Cashflow detail table restructure** — asset drawdowns (super, shares, bonds, cash) removed from INCOME columns. New ASSETS section added between EXPENSES and NET showing per-asset balances year-by-year: Super A, Super B, Shares, Bonds, Other Assets, Cash, Debts, and Liquid Assets total. NET section trimmed to just Net Cashflow and Asset Drawdowns on the far right. Dynamic column visibility (only shows assets with non-trivial balances). Emerald green header for ASSETS group.
- 255 tests passing.

**State at end of session:** Both engine and UI issues resolved. Surplus now correctly routes to bonds when they're in surplus mode. Cashflow table clearly separates income/expenses/asset balances/net.

### Session — 2026-03-21 (4)

**What was done:**
- **Novated lease overhaul**: Added balloon/residual value, term years, and interest rate fields. Annual lease payment auto-calculated (upfront interest model). Lease payment breakdown panel shows financed amount, interest, and balloon due.
- **Pre-tax calc fix**: `pretaxPackageReduction` now correctly = `totalRunningCosts (lease payment + running costs) - ECM contribution`. Previously used `rawTaxableValue + runningCosts` which was wrong.
- **Month/year dates**: Lease start/end changed from year-only to month/year (`type="month"` input). Engine calculates `daysAvailable` per simulation year and pro-rates FBT taxable value for partial years. Backward compatible with legacy year-only data.
- **Other income auto-expand**: New income sources auto-expand on add, making once-off/dates/person attribution fields immediately visible.
- **Critical engine fix: shares absorb-all bug**: Shares with `annualContribution=0` in surplus mode were absorbing ALL remaining surplus, starving downstream destinations (bonds, other assets, cash). This caused: (a) bonds never receiving surplus despite being in routing order, (b) wild retirement age sensitivity (52→54 = -700k to +20M). Fix: shares with no target now pass through without absorbing. Retirement 52 vs 53 net worth difference now $368k (was millions).
- **Undefined guard**: `surplusRoutingOrder` fallback for legacy scenarios.
- **Full engine audit**: Comprehensive review of surplus routing, deficit path, balance updates, net worth calculation. All flows verified correct.
- 256 tests passing.

- **End-to-end model validation** — 22-test suite exercising a realistic dual-income household scenario through full lifecycle. Covers: mortgage offset waterfall, surplus routing priority, shares/bonds surplus/fixed contributions, super accumulation→pension phase transition, salary retirement cutoff, debt payoff timeline, other income active windows (consulting + one-off gift), novated lease FBT pro-rating for partial years, deficit detection with forced high expenses, retirement age proportionality (55 vs 57 net worth diff < 50%), NaN/Infinity guards across all snapshot fields, netCashflow = totalIncome − totalOutflows reconciliation, liquid assets consistency check. 278 total tests passing.

**State at end of session:** Engine surplus routing fundamentally fixed. Novated lease has full financial fields (balloon, term, rate). FBT pre-tax and pro-rating corrected. Full end-to-end test suite validates the model. Deployed to production.

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
