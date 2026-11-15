import { describe, expect, it } from 'vitest'
import { distToPolyline, minAreaRect, pointAlong, pointInRing, ringArea, seededRandom, type Vec2 } from './geometry2d'

describe('geometry2d', () => {
  const square: Vec2[] = [[0, 0], [10, 0], [10, 10], [0, 10]]

  it('point in ring and area', () => {
    expect(pointInRing([5, 5], square)).toBe(true)
    expect(pointInRing([15, 5], square)).toBe(false)
    expect(ringArea(square)).toBe(100)
  })

  it('distance to polyline and points along it', () => {
    expect(distToPolyline([5, 3], [[0, 0], [10, 0]])).toBeCloseTo(3)
    const { p, dir } = pointAlong([[0, 0], [10, 0], [10, 10]], 15)
    expect(p).toEqual([10, 5])
    expect(dir).toEqual([0, 1])
  })

  it('finds the oriented rectangle of a rotated court', () => {
    const a = Math.PI / 6
    const pts: Vec2[] = [[-14, -7.5], [14, -7.5], [14, 7.5], [-14, 7.5]].map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a) + 50, x * Math.sin(a) + y * Math.cos(a) + 20])
    const r = minAreaRect(pts)
    expect(r.length).toBeCloseTo(28)
    expect(r.width).toBeCloseTo(15)
    expect(r.center[0]).toBeCloseTo(50)
    expect(Math.abs(Math.cos(r.angle - a))).toBeCloseTo(1)
  })

  it('seeded random is deterministic', () => {
    const a = seededRandom(7)
    const b = seededRandom(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})
