# Aussie Retirement Simulator — Claude Context File

## What this project is

An Australian-native retirement simulator for the FIRE community. The core problem it solves is the **Gap** — the period between early retirement and preservation age (60) when super is locked and the household lives entirely off non-super liquid assets.

Full product spec: `/docs/AussieRetirementSimulator-Spec-v2.md`

Read the spec before starting any task. It contains the authoritative data model, calculation logic, tax rules, and module specifications.

---

## Tech stack

- **Framework:** React
- **Computation:** math.js (client-side, sub-100ms updates)
- **Charts:** Recharts
- **Styling:** Tailwind CSS
- **Auth:** Supabase Google OAuth
- **Database:** Supabase (isolated from any other projects)
- **Deployment:** Vercel (static frontend, no backend in Phase 1)

---

## Project structure conventions

```
/src
  /engine         # Simulation engine, tax engine, cashflow logic
  /modules        # Feature modules (super, property, shares, bonds, expenses, fbt)
  /components     # React UI components
  /views          # Top-level view screens
  /hooks          # Custom React hooks
  /constants      # All default assumptions (inflation, caps, rates etc.)
  /utils          # Shared helpers
/docs             # Product spec and reference material
/tests            # Unit tests — especially fbt.js and engine modules
```

---

## Key architectural rules

- **Client-side only in Phase 1.** No backend API calls. All simulation runs in the browser via math.js.
- **FBT is a self-contained module.** Build and unit-test `fbt.js` in isolation before wiring to the main engine. It must cover all four scenarios: statutory no-contribution, statutory with employee contribution, ECM no-contribution, ECM with employee contribution to zero FBT.
- **All assumptions live in `/src/constants`.** Never hardcode rates, caps, or thresholds inline. This file must be easy to update when ASIC guidance or legislation changes.
- **Real vs nominal is display-only.** The toggle applies a post-calculation transformation — it does not trigger recalculation. Formula: `real = nominal ÷ (1 + inflation_rate) ^ (projection_year − current_year)`.
- **Auto-save with 2-second debounce** after last user change. Prevents excessive Supabase writes during slider/lever interaction.
- **Simulation runs year-by-year** from current year to simulation end age (default 90, max 110), applied to the older person in the household. Follow the exact 12-step calculation order in the spec (Section 5).

---

## Calculation order (per year — do not deviate)

1. Resolve salaries: wage growth, FBT packaging, retirement gate
2. Income tax + Medicare levy per person (post-packaging assessable income)
3. Super contributions: SG + salary sacrifice + voluntary; apply 15% contributions tax
4. Check concessional / non-concessional cap compliance; flag breaches
5. Grow super balance at applicable rate period rate
6. Property income: rental − expenses − interest (net of offset), negative gearing offset
7. Share portfolio: rate period growth, dividends + franking gross-up, franking offset
8. Investment bonds: 30% internal tax, check 10-year threshold
9. Expense hierarchy: apply inflation per node, honour active year windows, lever adjustments
10. Net cashflow: route surplus to nominated destination; flag deficits
11. Process sale events (property CGT, partial share sales, bond withdrawals)
12. Update all asset balances; record year snapshot for charts

---

## Australian-specific rules to get right

- **Preservation age:** 60 for anyone born after 1 July 1964 — hardcoded, not user-editable
- **SG rate:** 11.5% auto-stepping to 12% from 1 July 2025
- **Concessional cap:** $30,000 (FY2025)
- **Non-concessional cap:** $110,000 (FY2025) — bring-forward rule supported
- **CGT discount:** 50% for assets held >12 months — applied in sale year only
- **Franking credits:** gross-up added to assessable income; offset applied at tax stage; refundable in pension phase
- **Investment bond 10-year rule:** withdrawals before 10 years reset the clock and trigger income inclusion with 30% offset. Warn prominently.
- **PBI packaging cap:** $15,900 general + $2,650 meal entertainment — FBT-free
- **QLD Health packaging cap:** $9,000 general + $2,650 meal entertainment — independent of novated lease, combinable
- **FBT rate:** 47% | **Gross-up factor (type 1):** 2.0802
- **Negative gearing:** net rental loss deducted from assessable income in the same year

---

## The Gap — primary differentiator

The Gap dashboard is a **first-class screen** with equal navigation weight to the main projection view. It is the feature that differentiates this product for the FIRE community.

Key Gap UI elements:
- Viability indicator: `GAP VIABLE` / `GAP AT RISK` / `GAP CRITICAL`
- Runway chart: stacked area by asset bucket, preservation age markers per person
- Month-by-month cashflow table for the gap period
- Stress test sliders: expenses (−20% to +30%), portfolio return (4%–10%), part-time income toggle

Liquidity classification during the gap must be strictly enforced — super is locked, investment bonds pre-10yr are accessible with penalty, preserve-capital assets draw income only.

---

## Impact Analyser

- Diff view: Base (locked) vs Adjusted (live scratchpad)
- Headline metric: retirement date delta in months — must update in under 100ms
- Six lever groups: interest rates, expense categories, investment returns, salary/income, retirement age, contribution rates
- Attribution breakdown must identify which expense groups drove the change — not just a total delta

---

## Regulatory / ASIC requirements (non-negotiable)

- The tool is **product-agnostic throughout**. No fund, platform, or product recommendations anywhere in the UI.
- The following disclaimer must appear on **all projection views** — it is not optional:

> *This tool is for educational modelling only and does not constitute financial advice. Projections are based on assumptions you have entered and may not reflect actual outcomes. This tool does not recommend any specific financial product, fund, or investment platform. Consult a licensed financial adviser before making any financial decisions.*

---

## Build sequence (Phase 1)

Follow this order — later modules depend on earlier ones:

1. Supabase setup, Google OAuth, data schema
2. Tax engine: marginal rates, Medicare levy, all packaging types
3. `fbt.js` module: all four novated lease scenarios, unit-tested in isolation
4. Super module: contributions, employer schemes, caps, accumulation, pension, TTR, minimum drawdowns
5. Cashflow engine core: inflows/outflows, surplus/deficit routing, preserve capital logic
6. Time-varying rate period engine
7. Property module: P&I/IO toggle, offset account, negative gearing, CGT
8. Share portfolio + franking credit calculations + preserve capital
9. Investment bonds: 10-year tracking, 125% rule, pre/post threshold tax treatment
10. Expense hierarchy: 3-level tree, all amount types, fixed/discretionary tagging
11. Scenario management: create, name, duplicate, switch, rate period editor UI
12. The Gap dashboard
13. Impact analyser: diff view, lever panel, attribution breakdown
14. Output views: net worth, cashflow, liquidity table, expense breakdown, rate period visualisation
15. Assumptions panel + real/nominal toggle + simulation end age config + mandatory disclaimer

---

## What Phase 1 does NOT include

Do not build these until Phase 2 is explicitly started:
- Age Pension means testing
- Monte Carlo simulation
- Division 293 tax
- Downsizer contribution rule
- PDF export
- Multi-user auth or Stripe billing
