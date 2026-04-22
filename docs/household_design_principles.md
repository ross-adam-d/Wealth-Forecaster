# Household Profile — UI Design Principles

Developed from review of user-annotated screenshots and feedback during Session 35 (2026-04-16).
Applied iteratively to `HouseholdProfile.jsx` and related components.

---

## 1. Field width should match value range

Size each input to the largest realistic value it will ever hold — not to the width of its container. A 7-digit number field should look like a 7-digit field, not a text paragraph.

**Reference widths (Tailwind):**
| Value type | Max realistic value | Width |
|---|---|---|
| Age / years / term | 2–3 digits | `w-14` – `w-16` |
| Year (4 digits) | e.g. 2028 | `w-24` |
| Interest / % rate | 4 chars (e.g. 8.5%) | `w-20` |
| Small dollar (≤$30k) | 5 digits | `max-w-40` |
| Medium dollar (≤$200k) | 6 digits | `max-w-44` |
| Large dollar (≤$2M+) | 7 digits | `max-w-56` (default) |
| Short text (ticker, name) | 6–10 chars | `w-36` |
| Medium text (fund name) | ~20 chars | `w-64` |

---

## 2. Eliminate blank space by filling rows

If there is horizontal space available after a row of fields, that space should be occupied by the next logical field — not left empty. Blank space forces unnecessary scrolling and visually disconnects related data.

**How to apply:** Use `flex flex-wrap gap-x-3 gap-y-2 items-start` for rows. Size fields correctly (Principle 1) so they pack naturally. Where wrapping must be guaranteed, use `grid grid-cols-N gap-3`.

---

## 3. Keep related content together without scrolling

Fields that belong to the same concept should be visible together on screen. If a user has to scroll mid-section to see all fields in a group, the layout has failed.

---

## 4. The household section is the most important section

It is the "root" data — errors or friction here cascade everywhere. It deserves the highest UX polish of any section in the app.

---

## 5. Density enables quick scanning

The goal isn't minimalism for its own sake — it's that a denser, well-organised layout lets the user scan and verify their data faster. Compact ≠ cramped; it means no wasted space.

---

## 6. Use space deliberately to create sections of connected data points

Whitespace is a tool, not a gap. Intentional spacing between groups signals to the user where one concept ends and another begins — proximity implies relationship, distance implies separation.

**How to apply:** Use `space-y-3` within a section, a larger gap (`space-y-4` or `border-t`) between logical groups. Within the novated lease panel for example: Financing fields / Usage fields / Date fields are three distinct rows with `space-y-3` between them.

---

## 7. Balance and alignment is key

Fields that require only a single row of data entry should occupy equal vertical space. Columns and horizontal groups should be balanced in their usage — a heavy left column with an empty right column is a layout failure, not a design choice.

**How to apply:** Use `grid grid-cols-N` (not `flex-wrap`) when you need a guaranteed equal-column layout — e.g. the Super contributions row (salary sacrifice / extra concessional / non-concessional) must always be 3 equal columns. Use `flex-wrap` only when items can naturally pack and overflow is acceptable.

---

## Implementation notes (learned through iteration)

- **`className` override on `CurrencyInput` / `PctInput`**: The wrapper div uses `className || 'max-w-56'` (or `max-w-36` for PctInput), meaning any `className` you pass **fully replaces** the default — not appends to it. Pass the full width class you want (e.g. `className="max-w-40"`).

- **`grid-cols-N` vs `flex-wrap`**: Use `grid` when column count must be guaranteed (e.g. 3 super contribution fields). Use `flex-wrap` when you want fields to pack naturally and it's acceptable for rows to vary in count based on content.

- **Holdings fields**: Name `w-64`, Ticker `w-36`, Units `w-24`, purchase/sale price `w-32`. Avoid `w-full` or `flex-1` in this section — values are short and these classes produce gross over-sizing.

- **`MonthYearInput`**: Year input is `w-24`. Avoid long placeholder text (e.g. "Already owned" truncates) — use "Year" instead.

- **Do not use `w-full` inside flex rows** unless the field genuinely benefits from filling all available space (e.g. a search input, a free-text description). Dollar amounts, percentages, and years never need `w-full`.
