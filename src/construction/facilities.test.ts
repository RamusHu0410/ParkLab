import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseParkGeometry } from '../geography/parkGeometry'
import { dist, distToRingEdge, pointInRing, type Vec2 } from '../utils/geometry2d'
import { EDGE_CLEARANCE_M, facilityFixtures, facilityRing, parkCorner, planFacilities } from './facilities'
import { generateInitialLayout } from './initialLayout'

const geo = parseParkGeometry(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/maps/wismer-park.geojson'), 'utf8')))
const facilities = planFacilities(geo)
const proposed = facilities.filter((f) => f.basis === 'proposed')

/** Points on a 2 m grid covering a facility. */
function samples(f: (typeof facilities)[number]): Vec2[] {
  const a: Vec2 = [Math.cos(f.angle), Math.sin(f.angle)]
  const b: Vec2 = [-a[1], a[0]]
  const out: Vec2[] = []
  for (let u = -f.length / 2; u <= f.length / 2; u += 2)
    for (let v = -f.width / 2; v <= f.width / 2; v += 2) out.push([f.center[0] + a[0] * u + b[0] * v, f.center[1] + a[1] * u + b[1] * v])
  return out
}

describe('facility planning', () => {
  it('places every requested facility', () => {
    expect(proposed.map((f) => f.kind).sort()).toEqual(['ice_rink', 'multi_sport_court'])
  })

  it('keeps new facilities inside the park, off the woodlot/valley and existing facilities', () => {
    const existing = [...geo.soccerFields, ...geo.tennisCourts, ...geo.basketballCourts, ...geo.parking, ...geo.playgrounds].map((a) => a.ring)
    for (const f of proposed) {
      for (const p of samples(f)) {
        expect(pointInRing(p, geo.outer)).toBe(true)
        expect(distToRingEdge(p, geo.outer)).toBeGreaterThanOrEqual(EDGE_CLEARANCE_M - 1)
        expect(pointInRing(p, geo.woodlot) || pointInRing(p, geo.valley)).toBe(false)
        expect(existing.some((r) => pointInRing(p, r))).toBe(false)
      }
    }
  })

  it('does not overlap new facilities with each other', () => {
    for (const a of proposed) for (const b of proposed) if (a !== b) for (const p of samples(a)) expect(pointInRing(p, facilityRing(b))).toBe(false)
  })

  it('puts the ice rink in the Castlemore–Mingay corner and the multi-purpose court in the Bur Oak–Mingay corner', () => {
    const rink = proposed.find((f) => f.kind === 'ice_rink')!
    const multi = proposed.find((f) => f.kind === 'multi_sport_court')!
    expect(dist(rink.center, parkCorner(geo, 'castlemore-mingay'))).toBeLessThan(40)
    expect(dist(multi.center, parkCorner(geo, 'burOak-mingay'))).toBeLessThan(50)
  })

  it('puts the new soccer fields and basketball courts east of the playgrounds (towards Mingay)', () => {
    const playgroundEast = Math.max(...geo.playgrounds.flatMap((p) => p.ring.map((q) => q[0])))
    for (const f of proposed.filter((x) => x.kind === 'soccer_field' || x.kind === 'basketball_court')) {
      expect(Math.min(...facilityRing(f).map((p) => p[0]))).toBeGreaterThan(playgroundEast)
    }
  })

  it('gives every basketball court two hoops and the multi-purpose court four', () => {
    for (const f of facilities.filter((x) => x.kind === 'basketball_court')) expect(facilityFixtures(f)).toHaveLength(2)
    expect(facilityFixtures(proposed.find((f) => f.kind === 'multi_sport_court')!)).toHaveLength(4)
  })

  it('clears generated trees and furniture from facility footprints (hoops excepted)', () => {
    const items = generateInitialLayout(geo, facilities)
    for (const f of proposed) {
      const ring = facilityRing(f)
      const inside = items.filter((i) => pointInRing([i.position[0], i.position[2]], ring) && i.assetId !== 'Sport_Basketball_Hoop')
      expect(inside.map((i) => i.assetId)).toEqual([])
    }
  })
})
