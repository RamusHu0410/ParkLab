import { describe, expect, it } from 'vitest'
import { ENVIRONMENT, environmentScore, rateDesign, type RuleCheck } from './compliance'
import { RULES, type RuleId } from './rules'

const checks = (failing?: RuleId): RuleCheck[] =>
  (Object.keys(RULES) as RuleId[]).map((rule) => ({ rule, ...RULES[rule], pass: rule !== failing, violations: [] }))
const GOOD_ENV = 100
const BAD_ENV = ENVIRONMENT.threshold - 1

describe('rateDesign', () => {
  it('disqualifies any rule violation, whatever the happiness', () => {
    expect(rateDesign(checks('environment'), 95, GOOD_ENV)).toMatchObject({ stars: 1, ending: 'disqualified' })
  })
  it('rates by happiness when every rule is met', () => {
    expect(rateDesign(checks(), 59, GOOD_ENV)).toMatchObject({ stars: 1, ending: 'unhappy' })
    expect(rateDesign(checks(), 60, GOOD_ENV)).toMatchObject({ stars: 2, ending: 'ordinary' })
    expect(rateDesign(checks(), 89, GOOD_ENV)).toMatchObject({ stars: 2, ending: 'ordinary' })
    expect(rateDesign(checks(), 90, GOOD_ENV)).toMatchObject({ stars: 3, ending: 'greatest' })
  })
  it('takes a star away for a low environmental score, never below 1', () => {
    expect(rateDesign(checks(), 95, BAD_ENV)).toEqual({ stars: 2, ending: 'greatest', environmentPenalty: true })
    expect(rateDesign(checks(), 70, BAD_ENV)).toMatchObject({ stars: 1, environmentPenalty: true })
    expect(rateDesign(checks(), 30, BAD_ENV)).toMatchObject({ stars: 1, environmentPenalty: true })
    expect(rateDesign(checks(), 95, ENVIRONMENT.threshold)).toMatchObject({ stars: 3, environmentPenalty: false })
  })
})

describe('environmentScore', () => {
  it('passes the untouched park (90% green, 32 t CO₂) and fails a heavily paved one', () => {
    expect(environmentScore(0.898, 32.3)).toBeGreaterThanOrEqual(ENVIRONMENT.threshold)
    expect(environmentScore(0.75, 28)).toBeLessThan(ENVIRONMENT.threshold)
    expect(environmentScore(0.5, 0)).toBe(0)
    expect(environmentScore(1, 50)).toBe(100)
  })
})
