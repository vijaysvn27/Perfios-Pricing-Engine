import { describe, expect, it } from 'vitest'
import { applyRatio, toBasisPoints } from './money'

describe('money', () => {
  it('converts ratios to basis points', () => {
    expect(toBasisPoints(0.18)).toBe(1800)
    expect(toBasisPoints(0.12)).toBe(1200)
    expect(toBasisPoints(0.7)).toBe(7000)
    expect(toBasisPoints(0.3)).toBe(3000)
  })

  it('rounds half-up to the nearest rupee, deterministically', () => {
    expect(applyRatio(1, 0.5)).toBe(1) // 0.5 -> 1
    expect(applyRatio(3, 0.5)).toBe(2) // 1.5 -> 2
    expect(applyRatio(5, 0.5)).toBe(3) // 2.5 -> 3
  })

  it('matches the worked rate-card examples exactly', () => {
    expect(applyRatio(1713800, 0.18)).toBe(308484)
    expect(applyRatio(1713800, 0.12)).toBe(205656)
    expect(applyRatio(1708000, 0.7)).toBe(1195600)
  })

  it('is referentially transparent (same input -> same output)', () => {
    expect(applyRatio(1234567, 0.18)).toBe(applyRatio(1234567, 0.18))
  })
})
