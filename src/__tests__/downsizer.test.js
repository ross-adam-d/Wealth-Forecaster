import { describe, it, expect } from 'vitest'
import { calcDownsizerContribution } from '../modules/super.js'

describe('calcDownsizerContribution', () => {
  it('returns zero for person under 55', () => {
    const result = calcDownsizerContribution(500_000, 54)
    expect(result.amount).toBe(0)
    expect(result.eligible).toBe(false)
  })

  it('returns eligible for person exactly 55', () => {
    const result = calcDownsizerContribution(500_000, 55)
    expect(result.eligible).toBe(true)
    expect(result.amount).toBeGreaterThan(0)
  })

  it('caps at $300k per person', () => {
    const result = calcDownsizerContribution(1_000_000, 65)
    expect(result.amount).toBe(300_000)
    expect(result.eligible).toBe(true)
  })

  it('returns full proceeds when under cap', () => {
    const result = calcDownsizerContribution(200_000, 65)
    expect(result.amount).toBe(200_000)
  })

  it('applies ownership percentage', () => {
    // 50% ownership of $600k sale → $300k share → capped at $300k
    const result = calcDownsizerContribution(600_000, 65, 50)
    expect(result.amount).toBe(300_000)
  })

  it('applies ownership percentage — partial share under cap', () => {
    // 30% ownership of $500k sale → $150k share
    const result = calcDownsizerContribution(500_000, 65, 30)
    expect(result.amount).toBe(150_000)
  })

  it('returns zero for zero proceeds', () => {
    const result = calcDownsizerContribution(0, 65)
    expect(result.amount).toBe(0)
    expect(result.eligible).toBe(false)
  })

  it('defaults to 100% ownership', () => {
    const result = calcDownsizerContribution(250_000, 70)
    expect(result.amount).toBe(250_000)
  })
})
