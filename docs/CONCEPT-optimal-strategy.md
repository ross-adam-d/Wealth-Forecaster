# Optimal Retirement Strategy — Engine Lever Analysis

> **Legal note**: This analysis is based purely on simulation engine mechanics. Before exposing any of this as in-app guidance, it must be evaluated against Australian financial advice laws (Corporations Act 2001, AFSL requirements, general vs personal advice distinction). The tool must remain an illustrative projection tool, not a source of personal financial advice.

---

## The Core Problem: The Gap

The gap is the period between retirement and super preservation age (60). During this time, super is **locked** — you must fund all expenses from liquid assets: cash, shares, bonds, other assets, and any Person B income.

---

## Levers Ranked by Impact

### Lever 1: Person B Continues Working (Highest Impact)

Every year Person B works past Person A's retirement:
- Generates **net take-home pay** that covers expenses directly
- Continues **employer super contributions** (compounding at accumulation rate)
- Person B's salary sacrifice still enters super at 15% contributions tax (vs marginal rate)
- Dramatically reduces the liquid asset pool needed to bridge the gap

**Optimal play**: Person A retires first; Person B works as long as possible (or at least until Person A hits preservation age). Each year of Person B's income is worth more than $100k+ in liquid asset accumulation.

### Lever 2: Surplus Routing Order

**Recommended order for early retirement: Offset → Shares → Cash**

- **Offset first**: Every dollar in offset saves mortgage interest at the loan rate (typically 5-6%). Guaranteed, tax-free return. Once offset equals mortgage balance, repayments become 100% principal — mortgage pays itself off faster.
- **Shares second**: Capital growth at ~7% + dividend yield (~4%) gives ~11% total return. Dividends flow as **assessable income with franking credits** during the gap — critical for liquidity.
- **Cash last**: 0% return in the engine. Cash is a drag on wealth building.

**Key insight**: Shares generate dividends even when you're not selling them. The engine pays dividends as household income (`sharesResult.cashDividend`), which directly reduces or eliminates the net cashflow deficit. A $500k share portfolio at 4% yield = $20k/year passive income during the gap.

### Lever 3: Salary Sacrifice (Pre-Retirement)

- Concessional contributions taxed at 15% instead of marginal rate (32-45%)
- At $150k salary, maxing the $30k concessional cap saves ~$5-9k/year in tax
- The saved tax compounds inside super at the accumulation rate

**Trade-off**: Every dollar salary sacrificed is one less dollar of take-home pay available to build liquid assets.

**Optimal play**: Max salary sacrifice up to the concessional cap **while** building sufficient liquid assets for the gap. If your gap requires $X in liquid assets and you're on track to have that by retirement, keep maxing sacrifice. If not, dial it back to build the bridge.

### Lever 4: Mortgage Strategy

With the fixed-annuity mortgage model, **offset is extremely effective**:
- Offset reduces the interest component of the fixed repayment
- Extra principal reduction → mortgage paid off years early
- Once paid off (or with `payOffWhenAble`), the full repayment amount converts to surplus

**Optimal play**: Enable `payOffWhenAble` if you want the engine to pay off the mortgage the moment liquid assets can cover it. A $40k/year mortgage repayment disappearing from expenses is equivalent to $40k less liquid assets needed per year during the gap.

### Lever 5: Share Portfolio — Dividend Yield + Preserve Capital

During the gap, the share portfolio serves two roles:
1. **Dividend income** — passive cashflow that reduces the deficit
2. **Drawdown reserve** — sell shares if dividends + other income aren't enough

**Optimal play**: Set `preserveCapital: false` (the default). The engine will sell shares to cover deficits as needed. If Person B is working, dividends alone may cover the remaining shortfall, preserving the capital base.

Higher dividend yield → more passive income → smaller drawdown → shares last longer. Franking credits on dividends also reduce the tax bill, boosting effective yield.

### Lever 6: Investment Bonds (10-Year Rule)

Bonds become **tax-free** after 10 years. If you start bonds 10+ years before retirement:
- Tax-free withdrawals during the gap (no assessable income, no tax offset)
- They sit in the deficit waterfall after shares but before super

**Optimal play**: Contribute to investment bonds early so they mature before the gap starts. Net return is ~70% of gross (after 30% internal tax on earnings), so ~4.9% at the default 7% gross rate.

### Lever 7: Simulation End Age

Lower this to focus the model on the realistic planning horizon. Running to 100 requires a much larger pool than running to 90. Each year removed from the end reduces the required terminal super balance.

---

## Example Priority Checklist (Person A ~43, Person B ~38, target retirement 48)

1. **Person B works until at least 53** (Person A hits 58, 2 years from preservation)
2. **Surplus routing: Offset → Shares → Cash**
3. **Enable `payOffWhenAble`** on the mortgage
4. **Max salary sacrifice** for both while working
5. **Start/maintain investment bonds now** — approaching tax-free status by retirement
6. **Build share portfolio to ~$500-800k by retirement** — 4% yield = $20-32k/year passive income
7. **Set simulation end age to 90-95** unless specific longevity concerns

---

## Potential Feature: `solveOptimalStrategy()`

Could build an engine function that tests combinations of these levers and finds the earliest viable retirement date. Needs legal review before exposing to users.
