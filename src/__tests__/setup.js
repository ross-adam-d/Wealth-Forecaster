// Global test clock.
//
// The simulation engine pro-rates its first year by the fraction of the calendar year
// remaining from "today" (see `initialYearFraction` in simulationEngine.js). Without a fixed
// clock, every year-0 figure — and every `new Date().getFullYear()` used in the scenario
// builders and assertions — drifts with the real wall-clock date, so the suite is only green
// on the day the golden snapshots happened to be captured.
//
// Pinning the clock to 1 January 2026 makes the whole suite deterministic: year 0 becomes a
// full year (initialYearFraction = 1), matching how the assertions and golden snapshots were
// designed. Only Date is faked — real timers (setTimeout, etc.) are left untouched. This runs
// before each test file is evaluated, so it also covers simulations run at collection time.
import { vi, afterAll } from 'vitest'

vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-01-01T00:00:00'))

afterAll(() => {
  vi.useRealTimers()
})
