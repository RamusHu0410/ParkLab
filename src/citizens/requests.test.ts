import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ConstructionBlock } from '../construction/blocks'
import { planFacilities } from '../construction/facilities'
import { generateInitialLayout } from '../construction/initialLayout'
import type { PlacedItem } from '../construction/types'
import { parseParkGeometry } from '../geography/parkGeometry'
import { Cell } from '../simulation/navGrid'
import { buildSnapshot, routeDangerM } from '../simulation/parkMetrics'
import { findRoute } from '../simulation/pathfinding'
import { dist, type Vec2 } from '../utils/geometry2d'
import { CitizenSim, type CitizenSimHost } from './citizenSim'
import { adamRoute, BOB_FLOWER_M2, colgneRoute, COLGNE_PICNIC_M2, DYLAN_GRASS_M2, entrancesFacingStreet, evaluateRequests, makeBaseline } from './requests'

const geo = parseParkGeometry(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/maps/wismer-park.geojson'), 'utf8')))
const facilities = planFacilities(geo)
const items: PlacedItem[] = generateInitialLayout(geo, facilities).map((it, i) => ({ ...it, id: `item-${i}` }))
const snap = buildSnapshot(geo, items, facilities, [])
const baseline = makeBaseline(snap)
const results = () => Object.fromEntries(evaluateRequests(snap, baseline).map((r) => [r.id, r]))

/** Cell types along a route, sampled between cell borders (a diagonal step touches its neighbours only at a corner). */
const cellsAlong = (pts: Vec2[]) => {
  const out: number[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const L = dist(pts[i], pts[i + 1])
    const n = Math.max(1, Math.ceil(L / 0.25))
    for (let t = 0.5; t < n; t++) {
      const p: Vec2 = [pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * t) / n, pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * t) / n]
      const fx = p[0] - Math.floor(p[0])
      const fz = p[1] - Math.floor(p[1])
      if (Math.min(fx, 1 - fx, fz, 1 - fz) < 0.05) continue
      out.push(snap.grid.typeAt(p))
    }
  }
  return out
}

describe('pathfinding', () => {
  const a = snap.entrances[0].point
  const b = snap.entrances[2].point

  it('never routes through blocked terrain (streams, tree trunks, fenced courts, outside the park)', () => {
    for (const mode of ['walk', 'paths', 'accessible'] as const) {
      const r = findRoute(snap.grid, a, b, mode)
      expect(r).not.toBeNull()
      expect(cellsAlong(r!.points)).not.toContain(Cell.Blocked)
    }
  })

  it('keeps path-only and accessible routes on paths', () => {
    const r = findRoute(snap.grid, a, b, 'accessible')!
    expect(new Set(cellsAlong(r.points))).toEqual(new Set([Cell.PavedPath]))
  })

  it('checks accessible routes separately: the gravel path does not count', () => {
    const gravel = geo.pathInfo.find((p) => p.surface === 'gravel')!
    const mid = gravel.line[Math.floor(gravel.line.length / 2)]
    expect(snap.grid.typeAt(mid)).toBe(Cell.RoughPath)
    expect(findRoute(snap.grid, mid, mid, 'paths', { snapM: 1 })).not.toBeNull()
    expect(findRoute(snap.grid, mid, mid, 'accessible', { snapM: 1 })).toBeNull()
  })

  it('returns no route when the goal is walled off', () => {
    const tennis = facilities.find((f) => f.kind === 'tennis_court')!
    expect(findRoute(snap.grid, a, tennis.center, 'walk', { snapM: 0 })).toBeNull()
  })
})

describe('citizen requests on the real park', () => {
  it('lists Enoch first and covers all five citizens', () => {
    expect(evaluateRequests(snap, baseline).map((r) => r.name)).toEqual(['Enoch', 'Adam', 'Bob', 'Colgne', 'Dylan'])
  })

  it('finds the Greenspire Ave entrance and the Bur Oak entrance facing the school', () => {
    const { from, to } = adamRoute(snap)
    expect(from).toBeDefined()
    expect(to!.street).toBe('Bur Oak Avenue')
    expect(entrancesFacingStreet(snap, 'Herbert Calbert Drive')).not.toHaveLength(0)
    expect(entrancesFacingStreet(snap, 'Hyacinth Street')).not.toHaveLength(0)
  })

  it('does not mark a request complete while any required criterion fails', () => {
    for (const r of evaluateRequests(snap, baseline)) {
      const required = r.criteria.filter((c) => !c.bonus)
      expect(r.satisfied).toBe(required.every((c) => c.pass))
    }
    // Nothing is built yet, so none of the construction jobs is done.
    const r = results()
    for (const id of ['adam', 'bob', 'colgne', 'dylan']) expect(r[id].satisfied).toBe(false)
    // Everyone starts between 45 and 60.
    for (const x of Object.values(r)) expect(x.happiness).toBeGreaterThanOrEqual(45), expect(x.happiness).toBeLessThanOrEqual(60)
  })

  it('has no requests about connecting paths or shade', () => {
    const labels = evaluateRequests(snap, baseline).flatMap((r) => r.criteria.map((c) => c.label.toLowerCase()))
    expect(labels.some((l) => /shade|route|path|connected/.test(l))).toBe(false)
  })

  it('completes the construction jobs once the blocks are built', () => {
    const cells = (n: number) => Array.from({ length: n }, (_, i) => i)
    const facility = (id: string, type: 'basketball_court' | 'fitness_area' | 'community_plaza' | 'playground'): ConstructionBlock => ({
      id,
      shape: { kind: 'facility', type, center: [0, 0], angle: 0, length: 10, width: 10 },
      cost: 0,
      cells: [],
      items: [],
      displaced: [],
    })
    const area = (id: string, type: 'flower_garden' | 'picnic_lawn' | 'grassland', m2: number): ConstructionBlock => ({
      id,
      shape: { kind: 'area', type, mode: 'polygon', ring: [[0, 0], [1, 0], [1, 1]] },
      cost: 0,
      cells: cells(m2),
      items: [],
      displaced: [],
    })
    const blocks = [
      facility('f1', 'basketball_court'),
      facility('f2', 'fitness_area'),
      facility('f3', 'community_plaza'),
      facility('f4', 'playground'),
      area('a1', 'flower_garden', BOB_FLOWER_M2),
      area('a2', 'picnic_lawn', COLGNE_PICNIC_M2),
      area('a3', 'grassland', DYLAN_GRASS_M2),
    ]
    const tennis = facilities.find((f) => f.kind === 'tennis_court')!
    const built = buildSnapshot(geo, items, facilities.filter((f) => f.id !== tennis.id), blocks)
    const r = Object.fromEntries(evaluateRequests(built, baseline).map((x) => [x.id, x]))
    for (const id of ['adam', 'bob', 'colgne', 'dylan']) expect(r[id].satisfied).toBe(true)
    // All requirements met but no bonuses: happiness stops at 80.
    for (const id of ['adam', 'colgne', 'dylan']) expect(r[id].happiness).toBe(80)
    // Bob's only bonus (a 200 m² picnic lawn) is met by Colgne's 400 m² lawn, so he goes above 80.
    expect(r.bob.happiness).toBe(100)
  })

  it("measures Colgne's route beside traffic on the real route", () => {
    const { best } = colgneRoute(snap)
    expect(best).not.toBeNull()
    expect(routeDangerM(snap, best!.points)).toBe(best!.trafficM)
  })
})

describe('citizen simulation', () => {
  function run(seconds: number) {
    const poses = new Map<string, { x: number; z: number; clip: string }[]>()
    const using = new Map<string, number>()
    const host: CitizenSimHost = {
      addAgent: async () => {},
      setAgent: (id, x, z, _yaw, clip) => poses.set(id, [...(poses.get(id) ?? []), { x, z, clip }]),
      startUsingFacility: (id) => using.set(id, (using.get(id) ?? 0) + 1),
      stopUsingFacility: (id) => using.set(id, (using.get(id) ?? 0) - 1),
    }
    const sim = new CitizenSim(host)
    sim.setSnapshot(snap)
    const seen = new Map<string, Set<string>>()
    for (let t = 0; t < seconds; t += 0.1) {
      sim.update(0.1)
      for (const s of sim.statuses) seen.set(s.id, (seen.get(s.id) ?? new Set()).add(s.movement))
    }
    return { sim, poses, using, seen }
  }

  it('puts 30 named citizens in the park, each with position, destination, activity and movement', () => {
    const { sim } = run(1)
    const st = sim.statuses
    expect(st).toHaveLength(30)
    expect(new Set(st.map((c) => c.id)).size).toBe(30)
    // Everyone belongs to one of the five representatives' groups.
    expect(new Set(st.map((c) => c.group))).toEqual(new Set(['enoch', 'adam', 'bob', 'colgne', 'dylan']))
    for (const c of st) {
      expect(c.name).toBeTruthy()
      expect(c.activity).toBeTruthy()
      expect(['idle', 'walking', 'arrived', 'stuck']).toContain(c.movement)
      expect(c.position.every(Number.isFinite)).toBe(true)
    }
    expect(st.filter((c) => c.requestId).map((c) => c.requestId).sort()).toEqual(['adam', 'bob', 'colgne', 'dylan', 'enoch'])
    for (const rep of st.filter((c) => c.requestId)) expect(rep.group).toBe(rep.requestId)
  })

  it('moves citizens with the Walk clip, and they reach their destinations', () => {
    // Seven simulated minutes: Adam's walk to school alone takes ~5.5 min at a real walking pace.
    const { poses, seen } = run(420)
    const ids = [...poses.keys()].filter((id) => id !== 'mia')
    expect(ids).toHaveLength(29)
    // Representatives, and most visitors, arrive within 7 minutes; a few are still on a long walk across the park.
    const arrivedVisitors = ids.filter((id) => id.startsWith('visitor-') && seen.get(id)!.has('arrived'))
    expect(arrivedVisitors.length).toBeGreaterThanOrEqual(17)
    for (const id of ['enoch', 'adam', 'bob', 'colgne', 'dylan', 'jordan']) {
      const p = poses.get(id)!
      expect(p.some((x) => x.clip === 'Walk'), id).toBe(true)
      const travelled = p.slice(1).reduce((a, q, i) => a + dist([p[i].x, p[i].z], [q.x, q.z]), 0)
      expect(travelled, id).toBeGreaterThan(20)
      expect(seen.get(id)!.has('arrived'), id).toBe(true)
    }
  })

  it('keeps walking citizens off blocked cells', () => {
    const { poses } = run(120)
    for (const [id, list] of poses) {
      if (id === 'mia') continue // the child steps around her parent freely
      const blocked = list.filter((p) => snap.grid.typeAt([p.x, p.z]) === Cell.Blocked && p.clip === 'Walk')
      expect(blocked.length, id).toBeLessThan(list.length * 0.02)
    }
  })

  it('marks a facility as in use while a citizen uses it', () => {
    const { using } = run(400)
    expect([...using.keys()].some((k) => k.startsWith('playground-') || k.includes('basketball'))).toBe(true)
  })
})
