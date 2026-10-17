# Decision Wizard — "Should I…?" guided comparisons (spec)

Status: **proposal, not built.** For review before any app code.

## Goal
Bring the two landing-page calculators — *pay down mortgage vs invest* and
*pay down mortgage vs salary sacrifice to super* — into the full WealthSpan app
**without duplicating the math**. The landing calcs run a self-contained
closed-form engine (`wf-landing/lib/comparison.js`). Inside the app we already
have a far more accurate year-by-year engine and a `Compare` view. So the app
version should be a **thin wizard that generates two scenarios and hands them to
`Compare.jsx`** — the engine does the rest.

## Why this is low-risk
The scenario schema already carries every lever these decisions turn
(`src/utils/schema.js`):

| Lever | Field | Where |
|---|---|---|
| Surplus routing priority | `surplusRoutingOrder: ['offset','shares','treasuryBonds','commodities','cash']` | scenario root |
| Salary sacrifice | `salarySacrificeAmount` (+ `voluntaryConcessional`) | per super account, per person |
| Offset | `hasOffset`, `offsetBalance` | per property |
| Auto mortgage payoff | `payOffWhenAble` | per property |
| Deficit order | `drawdownOrder` | scenario root |

So "route the surplus to the mortgage" vs "route it to shares/super" is a **data
change on an existing field**, not new engine code. Div 293, the concessional
cap, CGT reform, offset interaction, and preservation-age access are *already*
modelled correctly by the engine — which is exactly why the app answer will beat
the landing calc's approximation.

## UX
New nav item **"Decisions"** (or a card on the dashboard). Flow:

1. **Pick a question** — two cards: *Pay down the mortgage or invest?* /
   *Pay down the mortgage or add to super?*
2. **Start from a scenario** — dropdown of the user's saved scenarios (defaults
   to active). We clone it twice so their real data (salary, super, property,
   ages) pre-fills everything. Only ask for the *surplus* if it's not already
   implied by their cashflow.
3. **One or two extra inputs** — the spare amount to deploy (and, for super, the
   sacrifice amount, pre-validated against live concessional headroom from the
   engine's own cap logic).
4. **Generate & compare** — build scenario A and B (below), run both, route to
   `Compare.jsx` with a plain-English verdict banner on top ("Investing is ahead
   by \$X at age 60 — but super stays locked until 60", etc.).

## Scenario generation

### Mortgage vs invest
Clone base scenario → A and B, inject the spare cash as an ongoing surplus
(raise the relevant income/expense delta so the engine sees free cashflow), then:

- **A – Repay:** `surplusRoutingOrder = ['offset', …]` and `payOffWhenAble = true`
  on the primary property. Surplus flows to offset / extra principal first.
- **B – Invest:** `surplusRoutingOrder = ['shares', 'offset', …]`, `payOffWhenAble
  = false`. Surplus buys shares; mortgage stays on schedule.

Everything else identical → the Compare delta is purely the routing decision,
now with real amortisation, real dividend/franking tax, and real CGT reform
treatment on sale.

### Mortgage vs super
- **A – Sacrifice:** set `salarySacrificeAmount` on the higher-marginal person's
  super (spilling to the partner past their cap), `surplusRoutingOrder` leaves
  the rest as-is.
- **B – Repay:** `salarySacrificeAmount = 0`; the equivalent take-home surplus
  routes to offset / principal (`payOffWhenAble = true`).

The engine already applies 15%/Div 293 contributions tax and preservation-age
gating, so the "super is locked until 60" caveat shows up naturally in the
year-by-year liquid-assets line — no special-casing needed.

## Verdict banner
Small helper reads both result sets at `retirementAge`: net worth delta, plus a
liquidity check (does A or B leave a pre-60 shortfall?). Mirrors the landing
calc's plain-English summary but sourced from the real engine.

## Build estimate
- `src/views/Decisions.jsx` — question picker + input step (~1 form).
- `src/utils/decisionScenarios.js` — pure `buildPair(base, question, inputs)`
  returning `[scenarioA, scenarioB]`. Unit-testable against the engine.
- Reuse `Compare.jsx` unchanged (or add an optional verdict-banner prop).
- No engine changes expected.

## Open questions for review
1. Nav placement — top-level "Decisions" item, or a section inside `Compare`?
2. Do we persist generated scenarios (clutters the saved list) or keep them
   ephemeral / auto-named "Decision: …" and easy to discard?
3. Surplus input — infer from existing cashflow, or always ask explicitly?
