# WealthSpan — Release Notes

User-facing changelog. Newest first. Add an entry **every deploy** (even small
ones). Keep it plain-English — this is what a user would want to know changed,
not an internal diff. Date format: `YYYY-MM-DD`.

> Going forward: on each production deploy, prepend a dated entry here and
> commit it alongside the change. (No in-app "What's new" surface yet — see
> backlog if we decide to add one.)

---

## 2026-10-18

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
