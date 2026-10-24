# WealthSpan — Release Notes

User-facing changelog. Newest first. Add an entry **every deploy** (even small
ones). Keep it plain-English — this is what a user would want to know changed,
not an internal diff. Date format: `YYYY-MM-DD`.

> Going forward: on each production deploy, prepend a dated entry here and
> commit it alongside the change. (No in-app "What's new" surface yet — see
> backlog if we decide to add one.)

---

## 2026-10-24

- **Mortgages now pay off on time** — interest is now worked out month by
  month, the way banks do it. Before, a 30-year loan took about 31 years to
  clear in the forecast. Loans now finish on schedule, and forecasts with a
  mortgage come out slightly better.

- **HECS/HELP repayments corrected** — repayments now use the ATO's
  "repayment income": negative gearing losses, salary sacrifice to super and
  salary packaging are added back, so they no longer lower your HECS
  repayments. Income above $125,000 is now repaid at 17c per dollar (was
  15c). If you have HECS, your debt may now clear sooner.

- **Jointly owned investment properties** — rental income and negative
  gearing losses are now split between you and your partner using the
  property's ownership slider (renamed "Ownership — Person A"). Before, all of
  it was counted against Person A's tax. Previously the slider only affected
  capital gains tax on sale.

- **Today's dollars note** — when showing today's dollars, the cashflow chart
  and table now explain that a fixed mortgage repayment looks smaller each
  year because of inflation. Switch to nominal to see the actual amount, which
  stays the same.

## 2026-10-18

- **Super above the transfer balance cap** — only up to the transfer balance
  cap ($2.0M, rising to $2.1M from 1 July 2026) can move into tax-free pension
  phase. Super above that now stays in an accumulation account where earnings
  are taxed at 15%, and the minimum pension drawdown applies only to the
  pension part. Forecasts with large super balances will now be a little lower
  (and more accurate); balances under the cap are unchanged.

- **New: Simulations** — a new section on the Projection page runs your plan
  through 500 different sequences of good and bad market years. It shows how
  often your money lasts, a chart of the range of outcomes, and a year-by-year
  table from poor to strong markets alongside your main forecast. Press
  "Run 500 simulations" to start; results stay until you change your plan.

- **Mortgage repayment hint** — the property form now reminds you that
  mortgage repayments are calculated automatically from the balance, rate and
  term, so you don't need to (and shouldn't) add them to your expenses.

## 2026-10-17

- **Fix: future property purchases now include mortgage repayments** — if you
  set a property to be bought in a future year, the forecast was dropping its
  loan before the purchase happened. Repayments, the loan balance and the
  property's value were missing from that year onwards, and the full purchase
  price was taken from your cash instead of just the deposit and stamp duty.
  Projections with a future purchase will now look different (and more
  accurate).
- **Offset accounts** now only reduce interest on properties you already own,
  not on a property you haven't bought yet.
- **Draft negative-gearing quarantine** (Assumptions → draft legislation) now
  correctly applies to future purchases entered on the Household page.
- **Fix: mortgage repayments near zero for some loans** — the mortgage form
  could save the loan as the first digit you typed (e.g. $7 instead of
  $700,000), which made yearly repayments almost nothing. Repayments are now
  always based on the outstanding balance and years remaining you enter.
  Existing scenarios are corrected automatically — no need to re-enter.
- **Purchase-year costs pro-rated by month** — a property bought part-way
  through a year now only incurs repayments, interest, rent, expenses and
  land tax from the purchase month (e.g. April → 9 months), not the full year.

## 2026-07-18

- **Cleaner net-worth history chart** — the Actuals history graph now shows a
  single point per month (the most recent snapshot in that month), so saving
  multiple times in a month no longer clutters the line. Your full snapshot
  history is still stored.
- **Dismissible disclaimer on mobile** — the footer disclaimer can now be
  collapsed to a one-line notice via the ✕, so it no longer covers content on
  small screens. Tap it to read the full text again. (Desktop unchanged.)
- **Add to Home Screen** — a new option in the mobile menu installs WealthSpan
  as an app: a native install prompt on Android/Chrome, and Share-sheet
  instructions on iPhone/iPad.
