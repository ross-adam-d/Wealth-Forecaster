# WealthSpan — Release Notes

User-facing changelog. Newest first. Add an entry **every deploy** (even small
ones). Keep it plain-English — this is what a user would want to know changed,
not an internal diff. Date format: `YYYY-MM-DD`.

> Going forward: on each production deploy, prepend a dated entry here and
> commit it alongside the change. (No in-app "What's new" surface yet — see
> backlog if we decide to add one.)

---

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
