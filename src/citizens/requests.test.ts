import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ConstructionBlock } from '../construction/blocks'
import { planFacilities } from '../construction/facilities'
import { generateInitialLayout } from '../construction/initialLayout'
import type { PlacedItem } from '../construction/types'
import { parseParkGeometry } from '../geography/parkGeometry'
import { Cell } from '../simulation/navGrid'
import { buildSnapshot, landUse, routeDangerM } from '../simulation/parkMetrics'
import { findRoute, reachable } from '../simulation/pathfinding'
import { dist, type Vec2 } from '../utils/geometry2d'
import { CitizenSim, type CitizenSimHost } from './citizenSim'
import { adamRoute, BOB_MAX_LAND_LOSS_M2, colgneRoute, DYLAN_TARGET_M, entrancesFacingStreet, evaluateRequests, makeBaseline } from './requests'

const geo = parseParkGeometry(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/maps/wismer-park.geojson'), 'utf8')))
const facilities = planFacilities(geo)
const items: PlacedItem[] = generateInitialLayout(geo, facilities).map((it, i) => ({ ...it, id: `item-${i}` }))
const snap = buildSnapshot(geo, items, facilities, [])
const baseline = makeBaseline(snap)
const results = () => Object.fromEntries(evaluateRequests(snap, baseline).map((r) => [r.id, r]))

/** A built path block (only the fields the simulation reads). */
function pathBlock(id: string, line: Vec2[], type: 'accessible_path' | 'walking_trail' = 'accessible_path', width = 3): ConstructionBlock {
  return { id, shape: { kind: 'path', type, line, width }, cost: 0, cells: [], items: [], displaced: [] }
}

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
    const r = results()
    // Today's park: Adam's route is too long, Colgne's walk runs along Castlemore, Dylan has almost no shade.
    expect(r.adam.satisfied).toBe(false)
    expect(r.colgne.satisfied).toBe(false)
    expect(r.dylan.satisfied).toBe(false)
    expect(r.dylan.criteria[0].pass).toBe(false)
  })

  it("satisfies Adam once a direct path is built, and Bob once his entrance joins the network", () => {
    const { from, to } = adamRoute(snap)
    const adamPath = pathBlock('b1', [from!.point, to!.point])
    const bobHome = entrancesFacingStreet(snap, 'Herbert Calbert Drive')[0].point
    // Bob's entrance: a straight accessible link to the nearest point of the main network.
    const main = reachable(snap.grid, snap.entrances[0].point, 'accessible')
    const k = snap.grid.nearest(bobHome, () => true, 0)
    let best = -1
    for (let q = 0; q < main.length; q++) if (main[q] && (best < 0 || dist(snap.grid.center(q), bobHome) < dist(snap.grid.center(best), bobHome))) best = q
    expect(k).toBeGreaterThanOrEqual(0)
    const link: Vec2[] = [bobHome, snap.grid.center(best)]
    const built = buildSnapshot(geo, items, facilities, [adamPath, pathBlock('b2', link)])
    const r = Object.fromEntries(evaluateRequests(built, baseline).map((x) => [x.id, x]))
    expect(r.adam.satisfied).toBe(true)
    expect(r.bob.criteria[0].pass).toBe(true)
  })

  it('fails Bob when more than 250 m² of unused land is built over', () => {
    const { from, to } = adamRoute(snap)
    // A 6 m wide path across the lawn uses well over 250 m².
    const wide = buildSnapshot(geo, items, facilities, [pathBlock('w', [from!.point, to!.point], 'accessible_path', 6)])
    const lost = baseline.land.greenM2 - landUse(wide).greenM2
    expect(lost).toBeGreaterThan(BOB_MAX_LAND_LOSS_M2)
    const bob = evaluateRequests(wide, baseline).find((x) => x.id === 'bob')!
    expect(bob.criteria.find((c) => c.label === 'Unused land removed')!.pass).toBe(false)
    expect(bob.satisfied).toBe(false)
  })

  it("measures Colgne's route beside traffic on the real route", () => {
    const { best } = colgneRoute(snap)
    expect(best).not.toBeNull()
    expect(routeDangerM(snap, best!.points)).toBe(best!.trafficM)
    expect(best!.trafficM).toBeGreaterThan(10)
  })

  it("uses Dylan's 5 km target", () => {
    expect(DYLAN_TARGET_M).toBe(5000)
    expect(results().dylan.criteria[0].target).toContain('5 km')
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
