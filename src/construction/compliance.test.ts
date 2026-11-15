import { describe, expect, it } from 'vitest'
import { rateDesign, type RuleCheck } from './compliance'
import { RULES, type RuleId } from './rules'

const checks = (failing?: RuleId): RuleCheck[] =>
  (Object.keys(RULES) as RuleId[]).map((rule) => ({ rule, ...RULES[rule], pass: rule !== failing, violations: [] }))

describe('rateDesign', () => {
  it('disqualifies any rule violation, whatever the happiness', () => {
    expect(rateDesign(checks('environment'), 95)).toEqual({ stars: 1, ending: 'disqualified' })
  })
  it('rates by happiness when every rule is met', () => {
    expect(rateDesign(checks(), 49)).toEqual({ stars: 1, ending: 'unhappy' })
    expect(rateDesign(checks(), 50)).toEqual({ stars: 2, ending: 'ordinary' })
    expect(rateDesign(checks(), 69)).toEqual({ stars: 2, ending: 'ordinary' })
    expect(rateDesign(checks(), 70)).toEqual({ stars: 3, ending: 'greatest' })
  })
})
