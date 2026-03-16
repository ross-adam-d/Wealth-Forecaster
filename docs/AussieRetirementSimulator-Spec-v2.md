# Aussie Retirement Simulator
## Product Specification & Build Plan

**Version 2.0 | March 2026 | Confidential**

---

> **Product Vision**
>
> An Australian-native retirement simulator designed for the FIRE community. Manual-entry, privacy-first, and built around the question every early retiree actually needs answered:
>
> *"Can I make it from retirement to when super kicks in — without running out of money?"*
>
> ProjectionLab shows you where you'll end up. This shows you how you get there — specifically the gap years that will make or break your plan.

---

## Table of Contents

1. [Guiding Principles](#1-guiding-principles)
2. [Regulatory Position](#2-regulatory-position)
3. [Technical Stack](#3-technical-stack)
4. [Core Data Model](#4-core-data-model)
5. [Simulation Engine](#5-simulation-engine)
6. [Module Specifications](#6-module-specifications)
   - 6.1 [Household Profile](#61-household-profile)
   - 6.2 [Tax Engine](#62-tax-engine)
   - 6.3 [Superannuation Module](#63-superannuation-module)
   - 6.4 [Property Module](#64-property-module)
   - 6.5 [Share Portfolio](#65-share-portfolio)
   - 6.6 [Investment Bonds](#66-investment-bonds)
   - 6.7 [Other Assets](#67-other-assets)
   - 6.8 [Expense Hierarchy](#68-expense-hierarchy)
   - 6.9 [Cashflow Engine](#69-cashflow-engine)
   - 6.10 [The Gap — Hero Dashboard](#610-the-gap--hero-dashboard)
   - 6.11 [Impact Analyser](#611-impact-analyser)
   - 6.12 [Scenario Management](#612-scenario-management)
   - 6.13 [Output Views](#613-output-views)
   - 6.14 [Assumptions Panel](#614-assumptions-panel)
7. [Build Plan](#7-build-plan)
8. [Differentiation vs ProjectionLab](#8-differentiation-vs-projectionlab)
9. [Mandatory Disclaimer](#9-mandatory-disclaimer)

---

## 1. Guiding Principles

| Principle | What it means in practice |
|---|---|
| Australian-native | Super lifecycle, franking credits, negative gearing, CGT discount, FBT packaging, investment bonds — modelled correctly by default |
| The Gap is the hero | Pre-preservation bridge years are the primary problem to solve. The entire app is oriented around making that window survivable and visible |
| Impact over projection | Every input change shows its effect on retirement date immediately. The delta is the thing, not just the absolute outcome |
| Manual-entry, privacy-first | No bank feeds, no CDR complexity. Supabase cloud sync with Google OAuth. No data shared or sold |
| Start simple, go granular | A user can run a projection with 10 inputs or 200. The architecture never forces completeness |
| Real and nominal views | All projections shown in today's dollars by default. Toggle to nominal (actual) at any time |
| ASIC safe harbour | Product-agnostic throughout. No fund or product recommendations. Mandatory educational disclaimer on all views |

---

## 2. Regulatory Position

Operating as a manual-entry, product-agnostic calculator allows reliance on ASIC Instrument 2022/603 (superannuation forecasts relief). Exemption from AFSL requirements applies provided:

- Tool does not recommend or promote specific financial products, funds, or platforms
- Assumptions are reasonable and transparently disclosed
- Clear disclaimer on all projection views (see Section 9)
- Default assumptions align with ASIC guidance (inflation 2.5%, wage growth 3.5%)

> **Note:** A brief legal review (~$500) is recommended before public launch to confirm the full feature set — particularly FBT modelling, investment bonds, and property/shares — remains within the factual information safe harbour.

---

## 3. Technical Stack

| Layer | Decision & Rationale |
|---|---|
| Framework | React — consistent with existing Claude Code projects |
| Computation engine | math.js running client-side — sub-100ms simulation updates, no server round-trips |
| Charts | Recharts — lightweight, React-native |
| Styling | Tailwind CSS |
| Auth | Supabase Google OAuth — same pattern as strength app |
| Database | Supabase (separate project from strength app) — financial data fully isolated |
| Data sync | Auto-save with 2-second debounce after last change — prevents excessive writes on slider/lever movement |
| Deployment | Vercel — static frontend, zero backend in Phase 1 |
| FBT module | Self-contained `fbt.js` with unit tests — built and validated in isolation before wiring to main engine |

---

## 4. Core Data Model

All user data stored as structured JSON per scenario in Supabase. Schema is flat enough for simple queries, rich enough for the full household picture.

```
user_id                       → Supabase auth UID
preferences                   → Display mode (real/nominal), simulation end age
scenarios[]
  scenario.id                 → UUID
  scenario.name               → User-defined (e.g. "Base Plan", "Retire at 48")
  scenario.simulation_end_age → Default 90, max 110
  scenario.assumptions        → Inflation, return rates, wage growth
  scenario.household          → Person A + Person B profiles + employer type per person
  scenario.packaging[]        → FBT benefits per person (novated lease, PBI, QLD Health)
  scenario.super[]            → One object per person
  scenario.properties[]       → Up to 3 investment properties + primary residence
  scenario.shares             → Share portfolio with rate period timeline
  scenario.investment_bonds[] → One object per bond
  scenario.other_assets[]     → Freeform entries with rate period timelines
  scenario.expenses           → Expense hierarchy root node
  scenario.events[]           → One-off events (sales, windfalls, large expenses)
```

---

## 5. Simulation Engine

Runs year-by-year from the current year to the simulation end age (default 90, configurable to 110, applied to the older person). Monthly granularity derived by distributing annual figures across 12 months for cashflow and Gap views.

### Simulation end date

- User-configurable per scenario. Default: age 90. Maximum: age 110
- Stored as a target age (not a year) — auto-adjusts if date of birth is edited
- Applies to the older person in the household
- Projections beyond age 100 labelled as illustrative in all views

### Real vs nominal display

- **Default: today's dollars (real)** — all values deflated by cumulative inflation from simulation start
- **Toggle: nominal** — raw projected figures without inflation adjustment
- Formula: `real value = nominal value ÷ (1 + inflation_rate) ^ (projection_year − current_year)`
- Toggle is a display-only transformation — no recalculation required, applies instantly to all charts and tables
- Chart y-axis label updates: `($, today's dollars)` or `($, nominal)`
- Percentage figures and retirement date are unaffected by the toggle
- Persistent per session, stored in user preferences

### Calculation order per year

1. Resolve salaries: apply wage growth, apply FBT packaging benefits, check retirement gate
2. Calculate income tax + Medicare levy per person (post-packaging assessable income)
3. Process super contributions (SG + salary sacrifice + voluntary), apply 15% contributions tax
4. Check concessional / non-concessional cap compliance, flag breaches
5. Grow super balance at applicable rate period rate (accumulation or pension phase)
6. Resolve property income: rental − expenses − interest (net of offset), negative gearing tax offset
7. Resolve share portfolio: apply rate period growth, dividends + franking gross-up, franking offset
8. Resolve investment bonds: apply internal 30% tax on earnings, check 10-year threshold
9. Resolve expense hierarchy: apply inflation per node, honour active year windows, apply lever adjustments if in impact mode
10. Calculate net cashflow. Route surplus to nominated destination. Flag deficit years
11. Process sale events in this year (property CGT, shares partial sale, bond withdrawal)
12. Update all asset balances, record year snapshot for charts

### Time-varying return rates

Each investment asset (shares, super, other assets) supports multiple rate periods instead of a single fixed rate.

- User defines a timeline of contiguous rate periods: `[start year → end year: X%]`
- Any number of periods covering the full simulation horizon — UI enforces no gaps
- Default on asset creation: single period at the default rate covering full simulation
- Engine resolves applicable rate per asset per year by checking which period that year falls within
- Rate changes discretely at period boundary — no interpolation

**Typical rate period configuration:**

```
2026 → 2041:  8.0%  (accumulation, growth-oriented)
2041 → 2051:  6.0%  (transitional, de-risking)
2051 → 2090:  4.0%  (conservative, capital preservation focus)
```

### Preserve capital mode

- Toggle per asset, optionally time-gated from a nominated year (e.g. "preserve capital from age 70")
- When enabled: simulation draws only income (dividends, distributions, interest) — never touches principal
- Drawdown sequencing: preserve capital assets are drawn last, regardless of sequencing order
- If income alone is insufficient to cover expenses: simulator flags as deficit rather than liquidating — user must explicitly disable to resolve
- Useful for estate planning intentions or psychological floor ("I never want to sell the share portfolio")

### Retirement date solver

Finds the earliest year where liquid assets + super (post-preservation) + ongoing income ≥ projected expenses indefinitely. Runs iteratively. This is the basis for the headline impact metric in the diff view.

---

## 6. Module Specifications

### 6.1 Household Profile

- Two people (Person A + Person B) configured independently
- Per person: name, date of birth, current salary, expected wage growth
- Employer type selector per person: `Standard` | `PBI/NFP` | `QLD Health / Hospital and Health Service`
- Retirement age per person — input for projections; also computed as output by retirement date solver
- Preservation age: auto-set to 60 for anyone born after 1 July 1964
- Part-time / consulting income during gap: time-bounded, supports year-by-year tapering

---

### 6.2 Tax Engine

Marginal tax rates + Medicare levy calculated per person per year. All packaging benefits reduce assessable income before tax calculation.

| Input | Treatment |
|---|---|
| Salary (post all packaging) | Marginal rates applied, Medicare levy 2% |
| Salary sacrifice to super | Pre-tax, reduces assessable income, counts toward concessional cap |
| Novated lease packaging | Reduces assessable income by packaged amount; FBT calculated separately (see below) |
| PBI / NFP packaging | Up to $15,900 reduces assessable income FBT-free; + $2,650 meal entertainment |
| QLD Health packaging | Up to $9,000 general cap + $2,650 meal entertainment, FBT-free; independent of lease |
| Rental income / loss | Net added to / deducted from assessable income (negative gearing) |
| Franking credit gross-up | Added to assessable income; offset applied at tax calculation stage |
| Super contributions (concessional) | Taxed at 15% within fund; not included in personal income |
| Investment bond earnings | Taxed at 30% within bond; not included in personal income |
| Capital gains (held >12 months) | 50% discount applied before adding to assessable income in sale year |

#### Novated lease — FBT calculation

**User inputs per lease (time-bounded)**

- Vehicle cost price (for statutory formula base value)
- Annual kilometres travelled: total and business-use split (for ECM)
- Total annual running costs: fuel, rego, insurance, maintenance, tyres
- FBT calculation method: `Statutory Formula` or `Operating Cost (ECM)` — user selects
- EV toggle: electric vehicle (currently FBT-exempt for eligible vehicles — flagged as subject to legislative change)
- Employee post-tax contribution: reduces taxable value dollar-for-dollar

**Statutory Formula Method**

- FBT taxable value = base value × 20% × (days available ÷ 365)
- Base value: vehicle cost price including GST, excluding rego and CTP
- Statutory rate: flat 20% regardless of kilometres (simplified since 2011)
- Grossed-up taxable value (type 1): taxable value × 2.0802
- FBT liability: grossed-up value × 47% — paid by employer, not included in employee assessable income
- Net pre-tax package reduction: taxable value + running costs (all packaged pre-tax)

**Operating Cost Method (ECM)**

- FBT taxable value = total vehicle costs × (1 − business use %) × 20%
- Total vehicle costs: running costs + depreciation (cost ÷ 8 years effective life) + lease payments + finance charges
- Business use %: work kilometres ÷ total kilometres × 100 — simulator calculates from user inputs
- Grossed-up value and FBT liability calculated identically to statutory method
- ECM advantage: high business use % significantly reduces taxable value vs statutory — simulator shows both methods side-by-side

> **Note:** ECM requires a valid logbook. Simulator assumes logbook has been maintained. Disclaimer surfaced in UI.

**Employee Contribution Method (ECM post-tax offset)**

- Employee makes a post-tax contribution equal to the full taxable value — FBT liability = $0
- Post-tax contribution made from after-tax dollars but eliminates the entire grossed-up FBT base
- Toggle: "Make employee contribution to eliminate FBT liability" — engine recalculates take-home pay accordingly
- Most favourable outcome for high-kilometre / high-income earners — surfaced prominently in UI

**Side-by-side method comparison**

```
Statutory Formula:    Taxable value $4,200  →  Tax saving $3,100/yr
Operating Cost (ECM): Taxable value $1,800  →  Tax saving $4,800/yr
Selected method:      Operating Cost (ECM)

Updates live as user adjusts kilometres.
```

#### QLD Health / Hospital and Health Service packaging

Separate benefit type enabled when employer type is set to QLD Health. Independent of and combinable with novated lease.

| Benefit | Details |
|---|---|
| General expenses cap | Up to $9,000/yr FBT-exempt. Covers mortgage/rent, credit card, school fees, general living. Reduces assessable income dollar-for-dollar up to cap |
| Meal entertainment cap | $2,650/yr FBT-exempt. Separate cap, separate exemption |
| Interaction with novated lease | Completely independent — both can be used simultaneously. Lease does not consume the $9,000 cap |
| Combined maximum packaging | $9,000 general + $2,650 meal entertainment + full novated lease value |
| Cap enforcement | Warning if user attempts to package above applicable caps |

**Annual packaging summary (shown per person on income profile screen)**

```
Salary packaging summary — Person A

  Novated lease (ECM, employee contribution method)
    Pre-tax package:        $18,500/yr
    Income tax saving:       $7,585/yr
    FBT liability:               $0

  QLD Health general cap
    Pre-tax package:         $9,000/yr
    Income tax saving:       $3,690/yr

  Meal entertainment cap
    Pre-tax package:         $2,650/yr
    Income tax saving:       $1,087/yr

  Total annual tax saving:  $12,362/yr
  Equivalent salary uplift: +$12,362/yr (tax-free)
```

> **Note:** Total tax saving flows into the cashflow engine as an annual income uplift, increasing surplus and pulling forward the retirement date.

> **Note:** Build FBT calculations as a self-contained `fbt.js` module with unit tests covering all four scenarios: statutory no-contribution, statutory with contribution, ECM no-contribution, ECM with employee contribution to zero. Validate in isolation before wiring to main engine.

---

### 6.3 Superannuation Module

#### Pre-tax mechanisms — three distinct types (UI must distinguish clearly)

| Mechanism | Tax treatment and super cap interaction |
|---|---|
| Salary sacrifice to super | Pre-tax, reduces assessable income, counts toward $30k concessional cap, taxed at 15% within fund. Flows into super. |
| Novated lease packaging | Pre-tax, reduces assessable income, does NOT count toward super cap, separate FBT treatment. Does not flow into super. |
| PBI / QLD Health packaging | Pre-tax up to applicable cap, reduces assessable income, does NOT count toward super cap, no FBT within limits. Does not flow into super. |

#### Employee contribution modes (combinable per person)

- Salary sacrifice: pre-tax, reduces take-home pay, counts toward concessional cap ($30k FY2025)
- Fixed % of salary: user-defined %, nominated as concessional or non-concessional
- Fixed $ per year: absolute amount, user nominates concessional or non-concessional
- After-tax voluntary: non-concessional, counts toward $110k cap, bring-forward rule supported
- Cap breach warning: real-time flag if combined contributions exceed annual limits

#### Employer contribution schemes (select one per person)

- Standard SG: 11.5% now → 12% from 1 July 2025 (auto-stepped)
- Employer match: matches employee contributions up to a user-set cap. Total = SG + match
- Employer fixed %: user sets total employer rate (e.g. 15%). Used instead of standard SG rate
- All employer contributions: concessional, taxed at 15% within fund

#### Lifecycle phases

| Phase | Behaviour |
|---|---|
| Accumulation (pre-preservation) | Grows at applicable rate period rate. Contributions added. Locked — cannot be accessed |
| Transition to Retirement (TTR) | Toggle per person. Income stream drawn while still working. Pension phase tax treatment on earnings |
| Account-Based Pension (ABP) | Converts at retirement or preservation age. Minimum drawdown % applied by age bracket |
| Minimum drawdown rates | Under 65: 4% \| 65–74: 5% \| 75–79: 6% \| 80–84: 7% \| 85–89: 9% \| 90+: 14% |
| Preservation age unlock | Super flows into available assets. Shown as step-change on Gap runway chart |

---

### 6.4 Property Module

Up to 4 properties: primary residence + up to 3 investment properties. Each configured independently.

#### Per-property inputs

- Current value, purchase price, purchase date (for CGT holding period calculation)
- Outstanding mortgage balance, interest rate, loan term remaining
- Loan type: P&I or Interest Only (with IO start year and end year)
- Offset account balance (optional): interest = (loan balance − offset) × rate
- Annual offset top-up: amount added from cashflow surplus or manually set
- Rental income and annual property expenses (investment properties only)
- Sale event: nominated year, net proceeds to nominated destination

#### Interest Only periods

- During IO: repayments = interest only, no principal reduction, offset still applies
- At IO expiry: reverts to P&I on remaining balance over remaining term
- IO step-up: repayment increase at expiry flagged in cashflow view with a label

#### Tax treatment

- Negative gearing: net rental loss applied as tax offset against personal income
- CGT on sale: 50% discount for assets held >12 months, applied in sale year
- Primary residence: CGT-exempt, excluded from Age Pension assets test

---

### 6.5 Share Portfolio

- Current value, annual contribution amount
- Time-varying return rate: multiple rate periods (see Section 5)
- Preserve capital toggle: optional, time-gated (see Section 5)
- Dividend yield with franking percentage (default: 70% franked)
- Franking credit gross-up and refundable offset calculation (refundable in pension phase)
- Partial sales for drawdown: CGT triggered on gains, 50% discount if held >12 months
- Surplus cashflow routing: annual contributions added automatically from positive cashflow

---

### 6.6 Investment Bonds

Separate investment asset type with distinct tax treatment. Particularly valuable for high-income earners in accumulation phase.

| Field | Detail |
|---|---|
| Current balance | Opening value at scenario start |
| Annual contribution | Capped at 125% of prior year contribution (enforced with warning) |
| Return rate | Supports time-varying rate periods (same as shares) |
| Internal tax rate | 30% on earnings within the bond — not included in personal assessable income |
| 10-year threshold | Tracked from bond inception date. Flagged when crossed |
| Withdrawal before 10 years | Earnings included in assessable income with a 30% tax offset to avoid double-taxation. 10-year clock resets on any withdrawal — prominently warned |
| Withdrawal after 10 years | Completely tax-free. No inclusion in assessable income |
| 125% rule breach | Excess treated as a new bond with its own 10-year clock — flagged as warning |

#### Liquidity classification

- Included in liquid assets pool for net worth calculations
- Tagged separately in the liquidity table: "accessible (pre-10yr tax penalty)" or "tax-free" depending on years elapsed
- Prevents over-counting liquid assets during gap years if bond has not matured

---

### 6.7 Other Assets

- Freeform asset entries: name, current value, time-varying return rate periods
- Preserve capital toggle available
- Optional liquidation / sale event in a nominated year
- No complex tax modelling beyond CGT on sale — keeps it tractable

---

### 6.8 Expense Hierarchy

Three-level user-defined hierarchy. Rolls up whatever exists — users can operate with 3 top-level groups or 50 line items.

```
Group  (e.g. "Living")
  └── Category  (e.g. "Food")
        └── Subcategory  (e.g. "Groceries")

Any level can hold an amount directly. Completeness is never required.
```

| Field | Options / Behaviour |
|---|---|
| Label | Free text, user-defined |
| Amount type | Fixed annual \| Fixed monthly (×12) \| One-off in specific year \| Time-bounded (start → end year) |
| Fixed/discretionary tag | Applied at node level, cascades downward. Children can override parent tag |
| Active years | Optional start/end year. Defaults to "always". Auto-zeroed outside window |
| Inflation / growth | Defaults to global inflation. Overridable per node (e.g. medical at 5%/yr) |
| Notes | Free text, user reference only |

#### Default starter structure (fully editable)

- **Living**
  - Housing (fixed): Utilities, Maintenance & repairs
  - Food: Groceries (fixed), Eating out (discretionary)
  - Transport (fixed): Fuel & rego, Public transport
- **Lifestyle** (discretionary)
  - Travel, Entertainment, Health & fitness, Subscriptions
- **Savings & commitments**
  - School fees (time-bounded, fixed), Insurance (fixed), Donations (discretionary)

#### Impact analyser integration

Fixed/discretionary tags power the lever adjustments precisely — each lever adjusts only its tagged nodes. The diff view attributes the change to specific groups (e.g. "Lifestyle: −$8,400/yr, Food (eating out): −$3,200/yr") rather than just showing a total delta. This attribution layer is what ProjectionLab completely lacks.

---

### 6.9 Cashflow Engine

Aggregates all inflows and outflows year-by-year, calculates net position, routes surplus or flags deficit. The connective tissue of the simulator.

| Inflows | Outflows | Notes |
|---|---|---|
| Salaries (net of tax + packaging uplift) | Household living expenses | Packaging uplift = total annual tax saving from FBT benefits |
| Rental income (per property) | Mortgage repayments (P&I or IO) | IO step-up flagged at expiry |
| Dividends + franking credit offsets | Offset account top-ups | If manually set |
| Investment bond distributions (post-30% tax) | Super contributions (salary sacrifice) | Reduces take-home pay |
| Super drawdown (pension phase) | After-tax super contributions | |
| Part-time / consulting income | Income tax + Medicare levy | |
| Property / asset sale proceeds | Property expenses | Rates, insurance, maintenance |
| Cash savings / term deposit interest | School fees | Time-bounded |
| | One-off expense events | Spike in cashflow chart |

#### Surplus routing

- User nominates priority order: e.g. offset account first, then shares, then cash buffer
- Deficit: drawn from nominated source in priority order (cash buffer → shares → flagged critical)
- Preserve capital assets: skipped in drawdown sequencing until all non-preserved assets exhausted
- Investment bond withdrawals before 10-year threshold: flagged with tax penalty warning before executing

---

### 6.10 The Gap — Hero Dashboard

> **The Gap — Core Concept**
>
> The period between earliest retirement date and preservation age (60) unlocking for both people. The highest-risk window in an early retirement plan — no employment income, no super access, living entirely off non-super liquid assets.
>
> First-class screen with equal navigation weight to the main projection view. The feature that differentiates this product for the FIRE community.

#### Gap viability indicator

```
●  GAP VIABLE     —  Current plan bridges the gap with $340k to spare
●  GAP AT RISK    —  Shortfall of $180k projected in Year 7
●  GAP CRITICAL   —  Plan runs out of liquid assets in 2034
```

Colour-coded green / amber / red. Updates live on any input change.

#### Liquidity classification during gap

| Asset type | Gap liquidity status |
|---|---|
| Cash / term deposits | Fully liquid |
| Share portfolio (no preserve capital) | Liquid (CGT on gains noted) |
| Share portfolio (preserve capital enabled) | Income only — principal protected |
| Investment bond (pre-10yr) | Accessible with tax penalty — shown separately |
| Investment bond (post-10yr) | Fully liquid, tax-free |
| Property equity | Illiquid (unless sale event scheduled) |
| Super (pre-preservation) | Locked — not available during gap |
| Super (post-preservation) | Step-change injection shown on runway chart |

#### Gap runway chart

- Stacked area: composition of liquid assets over gap years, by bucket
- Drawdown sequence line: order assets consumed per user sequencing choice
- Buffer floor: user-set minimum comfort level, breach flagged
- Preservation age marker: vertical line per person. Super unlock shown as step-change upward
- Investment bond 10-year threshold: marked on timeline if bond matures during gap

#### Month-by-month cashflow table (gap period only)

| Column | Content | Notes |
|---|---|---|
| Month | Full gap period, monthly rows | |
| Income | All inflow sources combined | |
| Expenses | From expense hierarchy | |
| Net | Income − expenses | Red if negative — normalised, not alarming |
| Cumulative buffer | Running liquid asset total | Buffer floor overlaid on chart |

#### Partner-specific gap view

- **Solo gap phase:** one person retired, one working — one salary still flowing
- **Joint gap phase:** both retired, both pre-preservation — maximum risk window, highlighted
- **Staggered super unlock:** each person's unlock shown as separate step-change event

#### Gap stress test (within dashboard)

- Expenses slider: −20% to +30%
- Portfolio return during gap: 4% to 10%
- Part-time income: toggle on/off, or adjust amount
- Headline: "Gap buffer changes by $X" and viability indicator updates live

---

### 6.11 Impact Analyser

Diff view — Base vs Adjusted — with retirement date delta as the headline metric. The primary "what if" interaction mode.

#### Diff view model

- **Base column:** saved scenario, locked, read-only in this mode
- **Adjusted column:** live scratchpad, temporary until explicitly saved as a new scenario
- Lever state saved with scenario — always visible what was changed to achieve a result

#### Headline metric

```
Base retirement:  Jan 2039   →   Adjusted:  Aug 2037
↑  17 months earlier

Updates in under 100ms. Engine must support incremental recalculation.
```

#### Supporting metrics panel

| Metric | Base | Adjusted / Delta |
|---|---|---|
| Retirement date | Jan 2039 | Aug 2037 (−17 months) |
| Peak net worth | $4.2M | $4.6M (+$380k) |
| Annual retirement income | $142k | $156k (+$14k) |
| Super at retirement (A) | $890k | $940k (+$50k) |
| Super at retirement (B) | $620k | $650k (+$30k) |
| Liquidity runway (gap) | 8.2 yrs | 10.1 yrs (+1.9 yrs) |
| Gap viability | VIABLE +$280k | VIABLE +$460k |

#### Lever panel — six groups

| Lever group | Controls |
|---|---|
| Interest rates | Global rate override (±3%) \| Per-property override (expandable) |
| Expense categories | Discretionary slider (−50% to +50%) \| Fixed slider (−20% to +20%) \| Time-bounded items: toggle on/off |
| Investment returns | Share portfolio (4%–12%) \| Super accumulation (4%–10%) \| Property growth (2%–8%) \| Inflation (1.5%–5%) |
| Salary / income | Person A salary (−30% to +50%) \| Person B salary \| Rental income (±30%) \| Packaging toggles |
| Retirement age | Person A target (slider by year) \| Person B (independent) \| Shows cashflow and income implications |
| Contribution rates | Salary sacrifice % (0% to concessional cap) \| After-tax super ($0 to NCC cap) \| Share contribution (±$50k) |

---

### 6.12 Scenario Management

- Up to 5 named scenarios per user
- Full independent copies of all inputs including rate period timelines and packaging config
- Side-by-side comparison: net worth, retirement income, gap viability, super trajectories
- Scenario card: name, target retirement date, gap viability status, key lever deltas from base
- Duplicate scenario: creates a copy as starting point for a new variant

---

### 6.13 Output Views

All monetary values in output views respect the real/nominal toggle. Percentage figures and dates are unaffected.

| View | Content |
|---|---|
| Net worth over time | Chart per scenario. Stacked: super, property equity, shares, bonds, cash. Real/nominal toggle applied |
| Annual cashflow | Stacked bar: income sources. Line overlay: total expenses. Net cashflow secondary line. Green/red surplus/deficit colouring |
| Liquidity table | Year-by-year liquid vs illiquid assets. Bond pre/post 10yr tagged. Super unlock transition. Liquidity runway indicator |
| Monthly cashflow (gap) | 12-month rolling view for any selected gap year. Running buffer balance |
| Expense breakdown | Stacked area by expense group over time. Toggle groups on/off. Shows school fees expiry, healthcare growth etc. |
| One-off events timeline | Horizontal timeline of all time-bounded and one-off items. Spots cashflow pressure years |
| Retirement readiness | "At current trajectory, household reaches FI in [year]". Updates live |
| Rate period visualisation | Per asset: timeline showing rate periods as coloured bands. Preserve capital periods distinctly marked |

---

### 6.14 Assumptions Panel

| Assumption | Default |
|---|---|
| Inflation | 2.5% per annum (ASIC-aligned) |
| Wage growth | 3.5% per annum (ASIC-aligned) |
| Super return (accumulation) | 7.0% per annum |
| Super return (pension phase) | 6.0% per annum |
| Share portfolio return | 8.0% per annum |
| Property growth | 4.0% per annum |
| Dividend yield | 3.5% per annum |
| Franking credit % | 70% (overridable per portfolio) |
| SG rate | 11.5% (auto-steps to 12% from 1 July 2025) |
| Concessional contribution cap | $30,000 (FY2025) |
| Non-concessional contribution cap | $110,000 (FY2025) |
| Preservation age | 60 (for those born after 1 July 1964) |
| Corporate tax rate (for franking) | 30% |
| Investment bond internal tax rate | 30% |
| FBT rate | 47% |
| Gross-up factor (type 1, GST claimable) | 2.0802 |
| PBI general packaging cap | $15,900 |
| PBI meal entertainment cap | $2,650 |
| QLD Health general packaging cap | $9,000 |
| Simulation end age | 90 (configurable to 110) |
| Display mode | Today's dollars (real) — toggle to nominal |

> **Note:** All assumptions overridable per scenario. Defaults stored in a constants file for easy update when ASIC guidance or legislation changes.

---

## 7. Build Plan

### Phase 1 — Personal MVP

Fully functional simulator for personal use. All core AU-specific modelling including FBT, investment bonds, time-varying rates, and The Gap dashboard. Supabase persistence.

| Step | Deliverable |
|---|---|
| 1 | Supabase project setup, Google OAuth, data schema (including rate period and packaging structures) |
| 2 | Tax engine: marginal rates, Medicare levy, all packaging types (salary sacrifice, PBI, QLD Health) |
| 3 | `fbt.js` module: all four novated lease scenarios unit-tested and validated in isolation |
| 4 | Super module: contributions (all modes), employer schemes, caps, accumulation, pension conversion, TTR, minimum drawdowns |
| 5 | Cashflow engine core: inflows/outflows, surplus/deficit routing, preserve capital logic |
| 6 | Time-varying rate period engine: per-asset rate resolution by year |
| 7 | Property module: P&I/IO toggle, offset account, negative gearing, CGT |
| 8 | Share portfolio + franking credit calculations + preserve capital |
| 9 | Investment bonds: 10-year tracking, 125% rule, pre/post threshold tax treatment |
| 10 | Expense hierarchy: 3-level tree, all amount types, fixed/discretionary tagging |
| 11 | Scenario management: create, name, duplicate, switch, rate period editor UI |
| 12 | The Gap dashboard: viability indicator, runway chart, monthly table, stress test |
| 13 | Impact analyser: diff view, lever panel, attribution breakdown |
| 14 | Output views: net worth, cashflow, liquidity table, expense breakdown, rate period visualisation |
| 15 | Assumptions panel + real/nominal toggle + simulation end age config + mandatory disclaimer |

### Phase 2 — Validation & Polish

Strengthen product for wider use. Launch waitlist. Gauge demand.

- Age Pension means testing (assets test + income test, Centrelink deeming rates)
- Monte Carlo simulation: 500 runs, probability bands on charts
- Optimised drawdown sequencing with CGT minimisation during gap years
- Division 293 tax (super surcharge above $250k income)
- Downsizer contribution rule (post-65 property sale into super)
- PDF export of scenario summary
- Public landing page + waitlist

### Phase 3 — Productisation

Only if demand signals justify it. Estimated 6–10 weeks additional build.

- Multi-user auth, subscription billing via Stripe
- Freemium: 1 scenario free, unlimited on paid tier
- Lifetime access tier ($300–$500 one-time)
- SMSF basic modelling
- ASIC-compliant calculator registration if required at scale

---

## 8. Differentiation vs ProjectionLab

| Dimension | This product vs ProjectionLab |
|---|---|
| Primary question | "Can I bridge the gap?" vs "What will I have?" |
| Interaction model | Dial-up/dial-down impact analyser (delta-first) vs configure-then-view (snapshot) |
| Australian super | Full lifecycle: TTR, ABP, minimum drawdowns, all employer schemes vs generic pension field |
| Salary packaging | Novated lease (statutory + ECM + employee contribution), PBI, QLD Health — full FBT modelling vs not supported |
| Negative gearing | IO periods, offset accounts, correct tax treatment vs not supported |
| Franking credits | Gross-up and refundable offset calculation vs not modelled |
| Investment bonds | 10-year rule, 125% cap, pre/post threshold tax treatment vs not supported |
| Return rate flexibility | Multiple time-varying rate periods per asset + preserve capital mode vs single fixed rate |
| Expense structure | User-defined 3-level hierarchy, tagged, lever-integrated vs flat category list |
| Gap analysis | Dedicated first-class dashboard with viability indicator, runway chart, monthly table vs buried in projection |
| Real vs nominal | Toggle between today's dollars and nominal on all views vs nominal only |
| Simulation horizon | Configurable to age 110 vs fixed |
| Privacy | No bank feeds, Supabase only vs CDR-connected options |

---

## 9. Mandatory Disclaimer

> ⚠️ **Required on all projection views — non-negotiable for ASIC safe harbour**
>
> This tool is for educational modelling only and does not constitute financial advice.
>
> Projections are based on assumptions you have entered and may not reflect actual outcomes.
>
> This tool does not recommend any specific financial product, fund, or investment platform.
>
> Consult a licensed financial adviser before making any financial decisions.

---

*Aussie Retirement Simulator | Product Specification v2.0 | March 2026 | Confidential*
