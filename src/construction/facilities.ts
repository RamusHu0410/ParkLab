import type { ParkGeometry } from '../geography/parkGeometry'
import { bbox, distToRingEdge, minAreaRect, pointInRing, ringCentroid, type Ring, type Vec2 } from '../utils/geometry2d'
import { OccupancyGrid } from './occupancyGrid'
import type { PlacedItem } from './types'

export type FacilityKind = 'basketball_court' | 'soccer_field' | 'tennis_court' | 'ice_rink' | 'multi_sport_court'

/**
 * A sports facility drawn as a marked surface with fixtures. `length` runs along
 * `angle` (radians from local +x towards +z), `width` across it. Sizes include run-off.
 */
export interface Facility {
  id: string
  kind: FacilityKind
  name: string
  center: Vec2
  angle: number
  length: number
  width: number
  /** osm: a court/field mapped in OpenStreetMap. proposed: added by design; not in the real park. */
  basis: 'osm' | 'proposed'
  sourceId?: string
}

/** Corner of the park, named by the two streets that meet there. */
export type ParkCorner = 'castlemore-mingay' | 'burOak-mingay' | 'castlemore-royRainey' | 'burOak-royRainey'

interface ProposedSpec {
  kind: FacilityKind
  name: string
  length: number
  width: number
  near: ParkCorner | 'east-of-playgrounds'
}

/**
 * New facilities requested for the design, placed in order. Real-world sizes:
 * - synthetic ice rink 40 × 20 m (community pleasure-skating pad, rounded corners)
 * - multi-purpose court 50 × 30 m (futsal pitch with two cross basketball courts)
 * - 7-a-side soccer 50 × 32 m incl. run-off
 * - basketball 32 × 19 m (FIBA 28 × 15 m court + 2 m run-off)
 *
 * NOTE: the multi-purpose court was requested at "Bur Oak–Castlemore", but those
 * streets are parallel (south and north edges). It is placed at Bur Oak–Mingay
 * (south-east); change `near` to 'castlemore-royRainey' for the north-west corner.
 */
export const PROPOSED_FACILITIES: ProposedSpec[] = [
  { kind: 'ice_rink', name: 'Synthetic ice rink', length: 40, width: 20, near: 'castlemore-mingay' },
  { kind: 'multi_sport_court', name: 'Multi-purpose sports court', length: 50, width: 30, near: 'burOak-mingay' },
  // The two soccer fields and two basketball courts between the playgrounds and Mingay Ave were removed on request.
]

/** Distance new facilities keep from existing facilities, the woodlot and the valley (m). */
const CLEARANCE_M = 3
/** Distance new facilities keep from the park boundary (the street side), m. */
export const EDGE_CLEARANCE_M = 12
/** Gap between two new facilities (m). */
const GAP_M = 4

export function facilityRing(f: Facility): Ring {
  const a: Vec2 = [Math.cos(f.angle), Math.sin(f.angle)]
  const b: Vec2 = [-a[1], a[0]]
  const [l, w] = [f.length / 2, f.width / 2]
  return [
    [f.center[0] + a[0] * l + b[0] * w, f.center[1] + a[1] * l + b[1] * w],
    [f.center[0] - a[0] * l + b[0] * w, f.center[1] - a[1] * l + b[1] * w],
    [f.center[0] - a[0] * l - b[0] * w, f.center[1] - a[1] * l - b[1] * w],
    [f.center[0] + a[0] * l - b[0] * w, f.center[1] + a[1] * l - b[1] * w],
  ]
}

export function parkCorner(geo: ParkGeometry, corner: ParkCorner): Vec2 {
  // Local +x runs towards Mingay (east), +z towards Bur Oak (south).
  const score: Record<ParkCorner, (p: Vec2) => number> = {
    'castlemore-mingay': ([x, z]) => x - z,
    'burOak-mingay': ([x, z]) => x + z,
    'castlemore-royRainey': ([x, z]) => -x - z,
    'burOak-royRainey': ([x, z]) => -x + z,
  }
  return geo.outer.reduce((best, p) => (score[corner](p) > score[corner](best) ? p : best))
}

/** OSM courts and fields as facilities, so they get the same markings and fixtures as new ones. */
function osmFacilities(geo: ParkGeometry): Facility[] {
  const from = (kind: FacilityKind, name: string, list: ParkGeometry['soccerFields']) =>
    list.map((a, i) => {
      const r = minAreaRect(a.ring)
      return { id: `osm-${kind}-${i}`, kind, name, center: r.center, angle: r.angle, length: r.length, width: r.width, basis: 'osm' as const, sourceId: a.sourceId }
    })
  return [
    ...from('soccer_field', 'Soccer field', geo.soccerFields),
    ...from('tennis_court', 'Tennis court', geo.tennisCourts),
    ...from('basketball_court', 'Basketball court', geo.basketballCourts),
  ]
}

/** Existing OSM facilities plus the proposed ones, fitted into free, street-aligned space. */
export function planFacilities(geo: ParkGeometry, proposed: ProposedSpec[] = PROPOSED_FACILITIES): Facility[] {
  const result = osmFacilities(geo)
  const { min, max } = bbox(geo.outer)
  const grid = new OccupancyGrid(Math.floor(min[0]) - 2, Math.floor(min[1]) - 2, Math.ceil(max[0]) + 2, Math.ceil(max[1]) + 2)
  const existing = [...geo.soccerFields, ...geo.tennisCourts, ...geo.basketballCourts, ...geo.parking, ...geo.playgrounds].map((a) => a.ring)
  grid.blockWhere((p) => !pointInRing(p, geo.outer) || pointInRing(p, geo.woodlot) || pointInRing(p, geo.valley) || existing.some((r) => pointInRing(p, r)))
  grid.dilate(CLEARANCE_M)
  grid.blockWhere((p) => distToRingEdge(p, geo.outer) < EDGE_CLEARANCE_M)
  grid.rebuild()

  const playgroundEast = Math.max(...geo.playgrounds.flatMap((p) => p.ring.map((q) => q[0])))
  const playgroundZ = geo.playgrounds.map((p) => ringCentroid(p.ring)[1]).reduce((a, b) => a + b, 0) / Math.max(1, geo.playgrounds.length)
  const eastEdge = max[0]

  proposed.forEach((spec, i) => {
    const target: Vec2 = spec.near === 'east-of-playgrounds' ? [(playgroundEast + eastEdge) / 2, playgroundZ] : parkCorner(geo, spec.near)
    const spot = grid.findNearest(target, spec.length, spec.width)
    if (!spot) {
      console.warn(`No room for ${spec.name} near ${spec.near}`)
      return
    }
    const [a, b] = spot.rotated ? [spec.width, spec.length] : [spec.length, spec.width]
    grid.blockRect(spot.center, a, b, GAP_M)
    grid.rebuild()
    result.push({
      id: `proposed-${spec.kind}-${i}`,
      kind: spec.kind,
      name: spec.name,
      center: spot.center,
      angle: spot.rotated ? Math.PI / 2 : 0,
      length: spec.length,
      width: spec.width,
      basis: 'proposed',
    })
  })
  return result
}

/** Hoops are real models from the asset packs, so they are regular items. Goals, nets and boards are drawn with the surface. */
export function facilityFixtures(f: Facility): Omit<PlacedItem, 'id'>[] {
  const along: Vec2 = [Math.cos(f.angle), Math.sin(f.angle)]
  const across: Vec2 = [-along[1], along[0]]
  const at = (u: number, v: number): [number, number, number] => [f.center[0] + along[0] * u + across[0] * v, 0, f.center[1] + along[1] * u + across[1] * v]
  // The hoop model's backboard faces +z.
  const facing = (dir: Vec2) => Math.atan2(dir[0], dir[1])
  const basis = f.basis === 'osm' ? ('osm-court' as const) : ('proposed' as const)
  const hoop = (u: number, v: number, dir: Vec2) => ({ assetId: 'Sport_Basketball_Hoop', position: at(u, v), rotationY: facing(dir), scale: 1, basis })

  if (f.kind === 'basketball_court') {
    const half = basketballCourtSize(f).length / 2 + 0.3
    return [hoop(half, 0, [-along[0], -along[1]]), hoop(-half, 0, along)]
  }
  if (f.kind === 'multi_sport_court') {
    // Two basketball courts running across the futsal pitch, hoops on the long sides.
    const v = f.width / 2 - 0.4
    return [-12, 12].flatMap((u) => [hoop(u, v, [-across[0], -across[1]]), hoop(u, -v, across)])
  }
  return []
}

/** FIBA court (28 × 15 m) shrunk to fit inside the surface with 0.5 m to spare. */
export function basketballCourtSize(f: Pick<Facility, 'length' | 'width'>) {
  return { length: Math.min(28, f.length - 1), width: Math.min(15, f.width - 1) }
}
