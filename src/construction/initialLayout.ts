import type { ParkGeometry } from '../geography/parkGeometry'
import {
  add,
  bbox,
  dist,
  distToPolyline,
  distToRingEdge,
  minAreaRect,
  perp,
  pointAlong,
  pointInRing,
  polylineLength,
  ringArea,
  ringCentroid,
  scale,
  seededRandom,
  type Ring,
  type Vec2,
} from '../utils/geometry2d'
import { catalogEntry } from './catalog'
import { type Facility, facilityFixtures, facilityRing } from './facilities'
import type { PlacedItem, PlacementBasis } from './types'

/**
 * Generates the starting layout of Wismer Park from the real park geometry.
 * Deterministic (fixed seed), so the park looks the same on every load.
 * See PlacementBasis for which placements are backed by data.
 */
export function generateInitialLayout(geo: ParkGeometry, facilityList: Facility[] = [], seed = 2025): Omit<PlacedItem, 'id'>[] {
  const rand = seededRandom(seed)
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  const items: Omit<PlacedItem, 'id'>[] = []
  const occupied: { p: Vec2; r: number }[] = []

  const facilities: Ring[] = [
    ...geo.soccerFields,
    ...geo.tennisCourts,
    ...geo.basketballCourts,
    ...geo.parking,
    ...geo.playgrounds,
  ]
    .map((a) => a.ring)
    .concat(facilityList.map(facilityRing))
  const corridors = [...geo.paths, ...geo.serviceRoads]

  const nearCorridor = (p: Vec2, clearance: number) => corridors.some((l) => distToPolyline(p, l) < clearance)
  const nearStream = (p: Vec2, clearance: number) => geo.streams.some((l) => distToPolyline(p, l) < clearance)
  const inFacility = (p: Vec2, margin: number) => facilities.some((r) => pointInRing(p, r) || distToRingEdge(p, r) < margin)
  const insidePark = (p: Vec2, margin: number) => pointInRing(p, geo.outer) && distToRingEdge(p, geo.outer) >= margin
  const free = (p: Vec2, r: number) => occupied.every((o) => dist(o.p, p) >= o.r + r + 0.4)

  function place(assetId: string, p: Vec2, rotationY: number, basis: PlacementBasis, s?: number) {
    const e = catalogEntry(assetId)
    const sc = s ?? e.defaultScale
    items.push({ assetId, position: [p[0], 0, p[1]], rotationY, scale: sc, basis })
    occupied.push({ p, r: e.radius * sc })
  }

  /** Places only if the spot passes `ok` and is not taken. Returns whether it was placed. */
  function tryPlace(assetId: string, p: Vec2, rotationY: number, basis: PlacementBasis, ok: (p: Vec2, r: number) => boolean, s?: number) {
    const e = catalogEntry(assetId)
    const sc = s ?? e.defaultScale * (e.scaleJitter ? e.scaleJitter[0] + rand() * (e.scaleJitter[1] - e.scaleJitter[0]) : 1)
    const r = e.radius * sc
    if (!ok(p, r) || !free(p, r)) return false
    place(assetId, p, rotationY, basis, sc)
    return true
  }

  const yawFacing = (dir: Vec2) => Math.atan2(dir[0], dir[1]) // model +z points along dir

  // 1. Playground equipment inside the mapped playgrounds.
  const PLAY_SETS = [
    ['swing_set', 'slide', 'spring_rider', 'sandbox'],
    ['Playground_Slide_Tower', 'merry_go_round', 'seesaw', 'spring_rider'],
    ['climbing_frame', 'swing_set', 'jungle_dome', 'spring_rider', 'sandbox'],
    ['tire_swing', 'monkey_bars', 'playhouse', 'slide'],
  ]
  geo.playgrounds.forEach((pg, i) => {
    const rect = minAreaRect(pg.ring)
    const along: Vec2 = [Math.cos(rect.angle), Math.sin(rect.angle)]
    const set = PLAY_SETS[i % PLAY_SETS.length]
    const wanted = Math.max(2, Math.min(set.length, Math.round(ringArea(pg.ring) / 80)))
    const { min, max } = bbox(pg.ring)
    let placed = 0
    for (const assetId of set) {
      if (placed >= wanted) break
      for (let attempt = 0; attempt < 60; attempt++) {
        const p: Vec2 = [min[0] + rand() * (max[0] - min[0]), min[1] + rand() * (max[1] - min[1])]
        // Equipment is aligned with the playground's long side, like real installations.
        const yaw = yawFacing(perp(along)) + (rand() < 0.5 ? 0 : Math.PI)
        const ok = (q: Vec2, r: number) => pointInRing(q, pg.ring) && distToRingEdge(q, pg.ring) >= r * 0.8
        if (tryPlace(assetId, p, yaw, 'osm-playground', ok, 1)) {
          placed++
          break
        }
      }
    }
  })

  // 2. Fixed equipment of every court (hoops).
  for (const f of facilityList) {
    for (const it of facilityFixtures(f)) {
      items.push(it)
      occupied.push({ p: [it.position[0], it.position[2]], r: catalogEntry(it.assetId).radius })
    }
  }

  // 3. Drinking fountain beside each playground, at the closest path.
  for (const pg of geo.playgrounds) {
    const c = ringCentroid(pg.ring)
    let best: { p: Vec2; d: number; dir: Vec2 } | null = null
    for (const line of geo.paths) {
      const L = polylineLength(line)
      for (let d = 0; d <= L; d += 2) {
        const { p, dir } = pointAlong(line, d)
        const dd = dist(p, c)
        if (!best || dd < best.d) best = { p, d: dd, dir }
      }
    }
    if (!best) continue
    const side = perp(best.dir)
    for (const s of [1, -1]) {
      const p = add(best.p, scale(side, s * 1.6))
      if (tryPlace('drinking_fountain', p, yawFacing(scale(side, -s)), 'illustrative', (q, r) => insidePark(q, 2) && !inFacility(q, r) && !nearCorridor(q, 1.1), 1)) break
    }
  }

  // 4. Path furniture: benches facing the path (with a bin beside every other one) and lamp posts.
  const MAIN_PATH_M = 60
  geo.paths.forEach((line, li) => {
    const L = polylineLength(line)
    if (L < 25) return
    let bench = 0
    for (let d = 14 + (li % 3) * 5; d < L - 8; d += 38) {
      const { p, dir } = pointAlong(line, d)
      const s = bench % 2 === 0 ? 1 : -1
      const side = scale(perp(dir), s)
      const spot = add(p, scale(side, 1.9))
      const ok = (q: Vec2, r: number) => insidePark(q, 2) && !inFacility(q, r + 0.5) && !nearCorridor(q, r + 0.9) && !nearStream(q, 2)
      if (tryPlace('park_bench', spot, yawFacing(scale(side, -1)), 'illustrative', ok, 1)) {
        if (bench % 2 === 0) tryPlace('trash_can', add(spot, scale(dir, 1.5)), 0, 'illustrative', ok, 1)
        bench++
      }
    }
    if (L < MAIN_PATH_M) return
    let lamp = 0
    for (let d = 6; d < L - 4; d += 32) {
      const { p, dir } = pointAlong(line, d)
      const s = lamp % 2 === 0 ? -1 : 1
      const ok = (q: Vec2, r: number) => insidePark(q, 1) && !inFacility(q, r) && !nearCorridor(q, r + 0.7)
      if (tryPlace('park_lamp', add(p, scale(perp(dir), s * 1.4)), yawFacing(scale(perp(dir), -s)), 'illustrative', ok, 1)) lamp++
    }
  })

  // 5. Gazebo with picnic tables on the most open lawn of the main park area.
  {
    const { min, max } = bbox(geo.parkArea)
    let best: { p: Vec2; score: number } | null = null
    for (let x = min[0]; x <= max[0]; x += 6) {
      for (let z = min[1]; z <= max[1]; z += 6) {
        const p: Vec2 = [x, z]
        if (!pointInRing(p, geo.parkArea) || pointInRing(p, geo.woodlot) || pointInRing(p, geo.valley)) continue
        if (inFacility(p, 14) || !insidePark(p, 20)) continue
        const toPath = Math.min(...corridors.map((l) => distToPolyline(p, l)))
        if (toPath < 9 || toPath > 30) continue
        const clearance = Math.min(toPath, ...occupied.map((o) => dist(o.p, p) - o.r))
        if (!best || clearance > best.score) best = { p, score: clearance }
      }
    }
    if (best) {
      place('gazebo', best.p, 0, 'illustrative', 1)
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.4
        const p = add(best.p, [Math.cos(a) * 7.5, Math.sin(a) * 7.5])
        tryPlace('picnic_table', p, a, 'illustrative', (q, r) => insidePark(q, 2) && !inFacility(q, r) && !nearCorridor(q, r + 1), 1)
      }
    }
  }

  // 6. Flower beds at park entrances (path ends near the boundary).
  for (const line of geo.paths) {
    for (const [end, next] of [[line[0], line[1]], [line[line.length - 1], line[line.length - 2]]] as [Vec2, Vec2][]) {
      if (!next || distToRingEdge(end, geo.outer) > 6) continue
      const inward = pointAlong([end, next], 0).dir
      const p = pointAlong([end, next], 0).p
      for (const s of [1, -1]) {
        const spot = add(add(p, scale(inward, 4)), scale(perp(inward), s * 2.6))
        const assetId = pick(['flower_bed', 'Flowers_Tulips', 'Planter_Red_Flowers'])
        tryPlace(assetId, spot, yawFacing(inward), 'illustrative', (q, r) => insidePark(q, 1) && !inFacility(q, r) && !nearCorridor(q, r + 0.6), 1)
      }
    }
  }

  // 7. Woodlot: dense jittered grid of trees, clear of paths.
  const TREES = ['round_tree', 'round_tree', 'Tree_Round_LowPoly']
  const scatterTrees = (ring: Ring, spacing: number, basis: PlacementBasis, accept: (p: Vec2) => boolean) => {
    const { min, max } = bbox(ring)
    for (let x = min[0]; x <= max[0]; x += spacing) {
      for (let z = min[1]; z <= max[1]; z += spacing) {
        const p: Vec2 = [x + (rand() - 0.5) * spacing * 0.8, z + (rand() - 0.5) * spacing * 0.8]
        if (!pointInRing(p, ring) || !accept(p)) continue
        tryPlace(pick(TREES), p, rand() * Math.PI * 2, basis, (q, r) => insidePark(q, 1.5) && !inFacility(q, r) && !nearCorridor(q, r * 0.5 + 1.2))
      }
    }
  }
  scatterTrees(geo.woodlot, 7, 'woodlot', () => true)

  // 8. Valley: trees and shrubs along the stream banks, leaving the channel open.
  scatterTrees(geo.valley, 8.5, 'valley', (p) => !nearStream(p, 3) && rand() < 0.75)
  {
    const { min, max } = bbox(geo.valley)
    for (let k = 0; k < 160; k++) {
      const p: Vec2 = [min[0] + rand() * (max[0] - min[0]), min[1] + rand() * (max[1] - min[1])]
      if (!pointInRing(p, geo.valley) || nearStream(p, 2) || !nearStream(p, 14)) continue
      tryPlace('hedge_round', p, rand() * Math.PI * 2, 'valley', (q, r) => !nearCorridor(q, r + 1) && !inFacility(q, r))
    }
  }

  // 9. Open lawn: a ring of shade trees just inside the park edge, outside the woodlot and valley.
  {
    const ringLen = polylineLength([...geo.outer, geo.outer[0]])
    for (let d = 0; d < ringLen; d += 13) {
      const { p, dir } = pointAlong([...geo.outer, geo.outer[0]], d)
      for (const inset of [6, -6]) {
        const q = add(p, scale(perp(dir), inset))
        if (!pointInRing(q, geo.parkArea) || pointInRing(q, geo.woodlot) || pointInRing(q, geo.valley)) continue
        tryPlace(pick(TREES), q, rand() * Math.PI * 2, 'illustrative', (s, r) => insidePark(s, 3) && !inFacility(s, r + 1) && !nearCorridor(s, r * 0.5 + 1.5))
      }
    }
  }

  return items
}
