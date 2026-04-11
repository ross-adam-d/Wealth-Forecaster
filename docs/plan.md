# Wealth-Forecaster — Enhancement Build Plan

**Scoped:** 2026-04-11  
**Status:** Ready to build — Phase 1 next

---

## Overview

Three major enhancements across four build phases:

| Phase | Feature | Deps | Status |
|---|---|---|---|
| 1 | Tax forecasts in Projection tab | None | ⏳ Next |
| 2 | Actuals dashboard (current net worth, history) | None | ⏳ Queued |
| 3 | Ticker-based holdings + live prices | None | ⏳ Queued |
| 4 | CGT calculator (shares + property) | Phase 3 data model | ⏳ Queued |

Phases 1–3 are independent. Phase 4 requires Phase 3 complete first.

---

## Technical Decisions (Locked)

| Decision | Choice | Rationale |
|---|---|---|
| Live price API | Yahoo Finance v7 (unofficial, free) | No key needed, excellent ASX support (.AX suffix), stable for daily EOD fetch, proxied via Vercel fn |
| Vercel fn proxy endpoint | `GET /api/stock-price?tickers=CBA.AX,VAS.AX` | Avoids CORS + key exposure; returns price map |
| Actuals history storage | Inline `actualsHistory[]` array in scenario JSON blob | No new Supabase table; append-only, capped at ~100 entries |
| Snapshot trigger | Auto on save — if last snapshot >7 days old OR net worth shifted >2% | Zero friction |
| Tax display location | Collapsible section within Projection tab | Keeps tax data in context with projections |
| CGT scope | Shares/ETFs (from Phase 3) + property (actual sales only) | Property future sales are calculated, not user-entered |
| Property sale price | `saleEvent.actualSalePrice` field — only shown when `saleEvent.year ≤ currentFY` | Future sales use engine-projected value; actual sales use real price |
| Bond tickers | ETF tickers only (VAF.AX, VBND.AX etc.) — not individual govt bonds | ETFs price identically to shares; individual bonds need yield-to-price conversion (out of scope) |
| Australian FY | 1 July – 30 June | Standard ATO convention |
| CGT discount | 50% for individuals if held >12 months | ATO standard |

---

## Phase 1 — Tax Forecasts in Projection Tab

**Goal:** Surface tax data the engine already computes year-by-year. No engine logic changes except exposing 2 new snapshot fields.

### Engine change (`src/engine/simulationEngine.js`)
Add to year snapshot:
```js
superContribTaxA: (employerContribA + salarySacrificeA) * 0.15,
superContribTaxB: (employerContribB + salarySacrificeB) * 0.15,
```
(Concessional contributions taxed at 15% within super fund.)

### New UI section in `src/views/Projection.jsx`

Collapsible "Tax" section, positioned after cashflow chart.

**Chart 1 — Stacked bar (annual tax composition):**
- Income tax A: `taxA.netTax`
- Income tax B: `taxB.netTax`
- Medicare A+B: `taxA.medicareLevy + taxB.medicareLevy`
- HECS A+B: `hecsRepaymentA + hecsRepaymentB`
- Div 293: `div293TaxA + div293TaxB`
- Super contributions tax: `superContribTaxA + superContribTaxB`

**Chart 2 — Line (effective tax rate):**
- `(total tax) / (taxA.assessableIncome + taxB.assessableIncome)` per year

**Cashflow table additions:**
- New rows: Income Tax, Medicare Levy, HECS Repayments, Super Contributions Tax

### Files changed
- `src/engine/simulationEngine.js` — add 2 snapshot fields
- `src/views/Projection.jsx` — new collapsible Tax section + table rows

---

## Phase 2 — Actuals Dashboard

**Goal:** New "Actuals" nav item showing current financial position and historical trend.

### Schema change (`src/utils/schema.js`)
Add to `createDefaultScenario()`:
```js
actualsHistory: [],  // [{ date: 'YYYY-MM-DD', netWorth, liquidAssets, totalDebt }]
```

### Snapshot logic (`src/hooks/useScenario.js`)
Inside `triggerAutoSave`, before upserting:
1. Compute today's metrics from current scenario JSON (pure function, no engine run needed)
2. Check last entry in `actualsHistory`: skip if <7 days old AND net worth within 2% of last snapshot
3. If stale: append `{ date: today, netWorth, liquidAssets, totalDebt }`
4. Cap array at 100 entries (drop oldest)

### Today's metrics computation (pure function, new `src/utils/actuals.js`)
```
netWorth = totalAssets - totalLiabilities

totalAssets =
  cashSavings
  + shares.currentValue (or Σ units × livePrice if ticker present)
  + shares.holdings.reduce(...)
  + Σ properties.currentValue
  + Σ super.currentBalance
  + treasuryBonds.currentValue
  + commodities.currentValue
  + Σ investmentBonds.currentBalance
  + Σ otherAssets.currentValue

totalLiabilities =
  Σ properties.mortgageBalance
  + Σ debts.currentBalance
  + Σ person.hecs?.balance

liquidAssets =
  cashSavings
  + shares.currentValue
  + treasuryBonds.currentValue
  + commodities.currentValue
  + Σ otherAssets where canDrawdown=true

totalDebt = totalLiabilities (same as above)

annualIncome =
  toAnnual(personA.currentSalary) + toAnnual(personB.currentSalary)
  + Σ properties.annualRentalIncome
  + Σ active otherIncome (activeFrom ≤ currentYear ≤ activeTo)

annualExpenses = resolveExpenseTree(scenario.expenses, currentYear)  [reuse existing fn]

monthlyCashflow = (annualIncome - annualExpenses) / 12  [rough, pre-tax]
```

### New view (`src/views/Actuals.jsx`)
Layout:
- **Top row** — 3 metric cards: Net Worth, Liquid Assets, Total Debt
- **Second row** — 3 metric cards: Annual Income, Annual Expenses, Monthly Cashflow
- **Asset breakdown** — horizontal bar or small pie: super / property equity / shares / cash / other
- **Debt breakdown** — mortgage / personal debts / HECS
- **History chart** — LineChart with 3 lines (net worth, liquid assets, debt) vs date; only shown when `actualsHistory.length >= 2`; placeholder message otherwise: "Snapshot history builds automatically as you update your scenario"

### Navigation (`src/components/Layout.jsx`)
Add "Actuals" nav item (between Household and Projection, or at start).

### Files changed
- `src/utils/schema.js`
- `src/hooks/useScenario.js`
- new `src/utils/actuals.js`
- new `src/views/Actuals.jsx`
- `src/components/Layout.jsx`

---

## Phase 3 — Ticker-Based Holdings + Live Prices

**Goal:** Each share/bond ETF holding can have a ticker symbol + units. App fetches live price daily via Vercel serverless fn. Current portfolio value = units × live price. Projection uses live price as starting value.

### Schema changes (`src/utils/schema.js`)

`createDefaultShareHolding()` additions:
```js
ticker: '',              // e.g. 'CBA.AX', 'VAS.AX', 'AAPL' — empty = manual value
units: 0,                // number of units/shares held
purchaseDate: null,      // 'YYYY-MM' string (MonthYearInput) — for CGT
purchasePrice: 0,        // per-unit cost base (AUD)
saleDate: null,          // 'YYYY-MM' — null = still held
salePrice: 0,            // per-unit sale price (AUD)
livePrice: null,         // cached from API (number)
livePriceFetchedAt: null,// ISO timestamp string
```

Same additions to `createDefaultTreasuryBondHolding()`.

### Engine changes

`src/modules/shares.js` — when computing holding `currentValue`:
```js
const effectiveValue = (h.ticker && h.livePrice && h.units)
  ? h.units * h.livePrice
  : h.currentValue
```

Same pattern in `src/modules/treasuryBonds.js`.

Top-level `shares.currentValue` is already derived as `Σ holding.currentValue` — no orchestrator change needed.

### Vercel serverless function (`api/stock-price.js`)
```
GET /api/stock-price?tickers=CBA.AX,VAS.AX,AAPL

Fetches: https://query1.finance.yahoo.com/v7/finance/quote?symbols={tickers}
Headers: User-Agent: Mozilla/5.0 ...  (required — Yahoo blocks without it)

Response: {
  "CBA.AX": { price: 145.20, currency: "AUD", name: "Commonwealth Bank", fetchedAt: "..." },
  "VAS.AX": { price: 98.15, currency: "AUD", name: "Vanguard Australian Shares", fetchedAt: "..." },
  "AAPL":   null  // on error / not found
}
```

Error handling: per-ticker null on failure; never throws. Caller falls back to `currentValue`.

### Live price hook (`src/hooks/useLivePrices.js`)
- Called once in `App.jsx` after scenario loads
- Collects all tickers where `!livePrice || (now - livePriceFetchedAt) > 24h`
- Calls `/api/stock-price` with batched tickers (single request)
- On success: calls `updateScenario` to patch `livePrice` + `livePriceFetchedAt` on each matching holding
- Silent — no loading state exposed to UI (price badge updates when ready)

### HouseholdProfile UI changes (`src/views/HouseholdProfile.jsx`)
Each share holding (existing accordion row) gains new fields below name:
- `Ticker` — text input, placeholder "e.g. CBA.AX", optional
- `Units` — number input (shown only if ticker entered)
- `Purchase Date` — MonthYearInput (shown if ticker entered)
- `Purchase Price/unit` — $ number input (shown if ticker entered)
- `Sold?` — checkbox; when checked reveals: Sale Date (MonthYearInput), Sale Price/unit
- Live price badge (shown when `livePrice` exists): `$145.20 AUD · live` in green-400

Same pattern for treasury bond holdings (ETF mode).

### Files changed
- `src/utils/schema.js`
- `src/modules/shares.js`
- `src/modules/treasuryBonds.js`
- new `api/stock-price.js`
- new `src/hooks/useLivePrices.js`
- `src/views/HouseholdProfile.jsx`
- `src/App.jsx` (call `useLivePrices`)

---

## Phase 4 — CGT Calculator

**Goal:** Collapsible "Capital Gains" section in Projection tab showing current Australian FY disposals and estimated tax. Depends on Phase 3 data model.

### Schema changes (`src/utils/schema.js`)
Add to `createDefaultScenario()`:
```js
capitalLossesCarriedForward: 0,
```

Add to `createDefaultProperty()` (within `saleEvent`):
```js
// saleEvent gains new field:
actualSalePrice: null,   // gross sale price — user enters for past sales only
```
`actualSalePrice` is only shown in HouseholdProfile when `saleEvent.year ≤ currentFY`.

### CGT utility (`src/utils/cgt.js`)
Pure function: `computeCGTSummary(scenario, snapshots)` — returns disposal list + aggregates.

```
Australian FY boundaries:
  fyStart = year >= July ? new Date(year, 6, 1) : new Date(year - 1, 6, 1)
  fyEnd   = new Date(fyStart.getFullYear() + 1, 5, 30)

For each share holding where saleDate in current FY and not already held:
  costBase = purchasePrice × units
  proceeds = salePrice × units
  grossGain = proceeds - costBase
  held12m = monthDiff(purchaseDate, saleDate) >= 12
  discountApplied = held12m && grossGain > 0
  netGain = discountApplied ? grossGain * 0.5 : grossGain

For each property where saleEvent.year === currentFY:
  costBase = property.purchasePrice
  proceeds = actualSalePrice ?? (use snapshot saleProceeds — mark as "estimated")
  grossGain = proceeds - costBase - (sellingCosts if deductible)
  ownershipSplit via ownershipPctA
  held12m = yearDiff(purchaseDate, saleYear) >= 1
  discount applied per person share

Aggregates:
  totalGains = Σ max(0, netGain)
  totalLosses = Σ abs(min(0, netGain))  (no discount on losses)
  netCapitalGain = max(0, totalGains - totalLosses - capitalLossesCarriedForward)
  unusedLosses = max(0, totalLosses + capitalLossesCarriedForward - totalGains)
  estimatedTax = netCapitalGain × marginalRate  (derived from taxA/B assessable income in current year snapshot)
```

### UI in `src/views/Projection.jsx`

Collapsible "Capital Gains — Current FY" section, after Tax section.

**Disposal table:**

| Asset | Type | Purchase | Sale | Cost Base | Proceeds | Gross Gain | Discount | Net Gain |
|---|---|---|---|---|---|---|---|---|
| CBA.AX | Shares | Mar 2021 | Aug 2025 | $14,580 | $21,780 | $7,200 | 50% | $3,600 |
| 12 Oak St | Property | Jun 2018 | Nov 2025 | $450,000 | $810,000 ⚠️ est | $360,000 | 50% | $180,000 |

⚠️ = estimated (no `actualSalePrice` entered)

**Summary row:** Total Gains / Total Losses / Net Capital Gain / Est. Tax @ marginal rate

**Carried-forward losses input:** `$ Losses carried forward from prior FY` — editable, feeds `capitalLossesCarriedForward`

### Files changed
- `src/utils/schema.js`
- new `src/utils/cgt.js`
- `src/views/Projection.jsx` (new Capital Gains section)
- `src/views/HouseholdProfile.jsx` (add `actualSalePrice` to property sale form)

---

## Test Strategy

After each phase:
1. Run full vitest suite: `npx vitest run` — must stay green (568 tests)
2. For engine changes: run scenario suite: `npx vitest run src/__tests__/scenarios.test.js --reporter=verbose`
3. Update snapshots only for intentional engine output changes: `npx vitest run -u`

No new test files required unless new pure utility functions are added (cgt.js, actuals.js warrant unit tests).
