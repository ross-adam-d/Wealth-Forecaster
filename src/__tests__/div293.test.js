import { describe, it, expect } from 'vitest'
import { calcDiv293 } from '../modules/super.js'

describe('calcDiv293', () => {
  it('returns zero tax when income + contributions below threshold', () => {
    const result = calcDiv293(200_000, 25_000)
    expect(result.div293Tax).toBe(0)
    expect(result.isSubject).toBe(false)
    expect(result.div293Income).toBe(225_000)
  })

  it('returns zero tax when exactly at threshold', () => {
    const result = calcDiv293(225_000, 25_000)
    expect(result.div293Tax).toBe(0)
    expect(result.isSubject).toBe(false)
  })

  it('applies 15% on lesser of contributions or excess when contributions < excess', () => {
    // Income $260k + contributions $30k = $290k, excess = $40k
    // Tax on min($30k, $40k) = $30k × 15% = $4,500
    const result = calcDiv293(260_000, 30_000)
    expect(result.div293Tax).toBe(4_500)
    expect(result.isSubject).toBe(true)
    expect(result.div293Income).toBe(290_000)
  })

  it('applies 15% on excess when excess < contributions', () => {
    // Income $245k + contributions $30k = $275k, excess = $25k
    // Tax on min($30k, $25k) = $25k × 15% = $3,750
    const result = calcDiv293(245_000, 30_000)
    expect(result.div293Tax).toBe(3_750)
    expect(result.isSubject).toBe(true)
  })

  it('handles high income with standard SG-only contributions', () => {
    // $300k salary + $36k SG (12%) = $336k, excess = $86k
    // Tax on min($36k, $86k) = $36k × 15% = $5,400
    const result = calcDiv293(300_000, 36_000)
    expect(result.div293Tax).toBe(5_400)
    expect(result.isSubject).toBe(true)
  })

  it('returns zero for zero salary', () => {
    const result = calcDiv293(0, 0)
    expect(result.div293Tax).toBe(0)
    expect(result.isSubject).toBe(false)
  })
})
