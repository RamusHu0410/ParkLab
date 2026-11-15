import { dist, distToPolyline, pointAlong, pointInRing, polylineLength, seededRandom, type Ring, type Vec2 } from '../utils/geometry2d'
import { catalogEntry } from './catalog'
import { type Facility, facilityFixtures, facilityRing } from './facilities'
import type { PlacedItem } from './types'

export type PathType = 'walking_trail' | 'accessible_path' | 'jogging_trail'
export type AreaType = 'woodland' | 'grassland' | 'flower_garden' | 'habitat' | 'picnic_lawn'
export type FacilityType = 'playground' | 'basketball_court' | 'picnic_area' | 'community_plaza' | 'fitness_area'
export type BlockKind = 'path' | 'area' | 'facility'

/** What the player drew, in local metres [x, z]. */
export type BlockShape =
  | { kind: 'path'; type: PathType; line: Vec2[]; width: number }
  | { kind: 'area'; type: AreaType; mode: 'polygon'; ring: Ring }
  | { kind: 'area'; type: AreaType; mode: 'brush'; stroke: Vec2[]; radius: number }
  | { kind: 'facility'; type: FacilityType; center: Vec2; angle: number; length: number; width: number }

/** A built construction block. Its cells are marked in the ParkGrid, which stays the source of truth for terrain. */
export interface ConstructionBlock {
  id: string
  shape: BlockShape
  /** Amount paid when it was built. */
  cost: number
  /** Grid cell indices claimed when it was built. */
  cells: number[]
  /** Items generated with the block (benches, trees, play equipment…). */
  items: PlacedItem[]
  /** Items that stood in the way and were removed; restored when the block is removed. */
  displaced: PlacedItem[]
  /** Court rendered by ParkWorld (basketball court only). */
  facility?: Facility
}

export const PATH_TYPES: Record<PathType, { label: string; color: string; edge: string; defaultWidth: number }> = {
  walking_trail: { label: 'Walking trail', color: '#e8d3a5', edge: '#c9a86a', defaultWidth: 2 },
  accessible_path: { label: 'Accessible pathway', color: '#d9d9de', edge: '#a9a9b3', defaultWidth: 3 },
  jogging_trail: { label: 'Jogging trail', color: '#d98b6a', edge: '#b0654a', defaultWidth: 2.5 },
}
export const PATH_WIDTH_RANGE = { min: 1.5, max: 6, step: 0.5 }

export const AREA_TYPES: Record<AreaType, { label: string; color: string }> = {
  woodland: { label: 'Woodland', color: '#6fae5a' },
  grassland: { label: 'Grassland', color: '#c7e39a' },
  flower_garden: { label: 'Flower garden', color: '#f5b8d0' },
  habitat: { label: 'Biodiversity habitat', color: '#9bc98a' },
  picnic_lawn: { label: 'Picnic lawn', color: '#a8dd84' },
}
export const BRUSH_RADIUS_RANGE = { min: 2, max: 15, step: 1 }

export const FACILITY_TYPES: Record<FacilityType, { label: string; color: string; length: number; width: number }> = {
  playground: { label: 'Playground', color: '#ffd9a0', length: 20, width: 15 },
  basketball_court: { label: 'Basketball court', color: '#f2a26b', length: 32, width: 19 },
  picnic_area: { label: 'Picnic area', color: '#e6d8b0', length: 16, width: 12 },
  community_plaza: { label: 'Community plaza', color: '#e4dccf', length: 20, width: 20 },
  fitness_area: { label: 'Outdoor fitness area', color: '#cfe0f2', length: 16, width: 10 },
}

export function blockLabel(shape: BlockShape): string {
  if (shape.kind === 'path') return PATH_TYPES[shape.type].label
  if (shape.kind === 'area') return AREA_TYPES[shape.type].label
  return FACILITY_TYPES[shape.type].label
}

export function facilityShape(type: FacilityType, center: Vec2, angle = 0): Extract<BlockShape, { kind: 'facility' }> {
  const { length, width } = FACILITY_TYPES[type]
  return { kind: 'facility', type, center, angle, length, width }
}

/** Facility footprint as a ring. */
export const facilityShapeRing = (s: Extract<BlockShape, { kind: 'facility' }>): Ring =>
  facilityRing({ center: s.center, angle: s.angle, length: s.length, width: s.width } as Facility)

/**
 * Turns a raw mouse trace into continuous path geometry: drops points closer
 * than `minStep`, then rounds corners with two Chaikin passes (end points kept).
 */
export function smoothLine(raw: Vec2[], minStep = 1.5): Vec2[] {
  const pts: Vec2[] = []
  for (const p of raw) if (!pts.length || dist(p, pts[pts.length - 1]) >= minStep) pts.push(p)
  if (raw.length > 1 && pts.length > 0 && pts[pts.length - 1] !== raw[raw.length - 1]) {
    if (pts.length === 1) pts.push(raw[raw.length - 1])
    else pts[pts.length - 1] = raw[raw.length - 1]
  }
  let line = pts
  for (let pass = 0; pass < 2 && line.length > 2; pass++) {
    const next: Vec2[] = [line[0]]
    for (let i = 0; i < line.length - 1; i++) {
      const [a, b] = [line[i], line[i + 1]]
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    next.push(line[line.length - 1])
    line = next
  }
  return line
}

/** Nearest point on any of `lines` within `radius` of p, else p. */
export function snapToLines(p: Vec2, lines: Vec2[][], radius: number): Vec2 {
  let best: Vec2 = p
  let bestD = radius
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [a, b] = [line[i], line[i + 1]]
      const ab: Vec2 = [b[0] - a[0], b[1] - a[1]]
      const l2 = ab[0] ** 2 + ab[1] ** 2
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2))
      const q: Vec2 = [a[0] + ab[0] * t, a[1] + ab[1] * t]
      const d = dist(p, q)
      if (d < bestD) [best, bestD] = [q, d]
    }
  }
  return best
}

type NewItem = Omit<PlacedItem, 'id'>

const item = (assetId: string, p: Vec2, rotationY: number, jitter = 1): NewItem => ({
  assetId,
  position: [p[0], 0, p[1]],
  rotationY,
  scale: catalogEntry(assetId).defaultScale * jitter,
  basis: 'player',
})

/** Yaw that turns a model's front (+z) towards `dir`. */
const facing = (dir: Vec2) => Math.atan2(dir[0], dir[1])

function seedOf(shape: BlockShape): number {
  const pts = shape.kind === 'path' ? shape.line : shape.kind === 'facility' ? [shape.center] : shape.mode === 'polygon' ? shape.ring : shape.stroke
  return Math.floor(Math.abs(pts.reduce((s, p) => s + p[0] * 31.7 + p[1] * 17.3, 0)) * 1000) % 2147483647 || 1
}

/**
 * Objects that come with a block. `free(p, r)` says whether a disc of radius r
 * lies on cells the block owns and does not hit an existing item.
 */
export function generateBlockItems(shape: BlockShape, free: (p: Vec2, r: number) => boolean): NewItem[] {
  const rand = seededRandom(seedOf(shape))
  const out: NewItem[] = []
  const tryAdd = (it: NewItem) => {
    const r = catalogEntry(it.assetId).radius * (it.scale ?? 1)
    const p: Vec2 = [it.position[0], it.position[2]]
    if (out.some((o) => dist(p, [o.position[0], o.position[2]]) < r + catalogEntry(o.assetId).radius * (o.scale ?? 1))) return
    if (free(p, r)) out.push(it)
  }

  if (shape.kind === 'path') {
    // Benches, bins and lamps beside the path, alternating sides.
    const total = polylineLength(shape.line)
    const spacing = { walking_trail: 30, accessible_path: 25, jogging_trail: 45 }[shape.type]
    let side = 1
    for (let d = spacing / 2, n = 0; d < total; d += spacing, n++, side = -side) {
      const { p, dir } = pointAlong(shape.line, d)
      const normal: Vec2 = [-dir[1] * side, dir[0] * side]
      const off = shape.width / 2 + 1
      const at: Vec2 = [p[0] + normal[0] * off, p[1] + normal[1] * off]
      const toPath = facing([-normal[0], -normal[1]])
      if (shape.type === 'jogging_trail') tryAdd(item(n % 2 ? 'trash_can' : 'park_lamp', at, toPath))
      else {
        tryAdd(item('park_bench', at, toPath))
        const along: Vec2 = [at[0] + dir[0] * 2.2, at[1] + dir[1] * 2.2]
        if (shape.type === 'accessible_path') tryAdd(item('park_lamp', along, toPath))
        else if (n % 2 === 0) tryAdd(item('trash_can', along, toPath))
      }
    }
    return out
  }

  if (shape.kind === 'area') {
    const pts = shape.mode === 'polygon' ? shape.ring : shape.stroke
    const r0 = shape.mode === 'brush' ? shape.radius : 0
    const xs = pts.map((p) => p[0])
    const zs = pts.map((p) => p[1])
    const spacing = { woodland: 6, grassland: 12, flower_garden: 3, habitat: 5, picnic_lawn: 9 }[shape.type]
    const pick = (): string | null => {
      const u = rand()
      switch (shape.type) {
        case 'woodland':
          return u < 0.8 ? (u < 0.4 ? 'round_tree' : 'Tree_Round_LowPoly') : 'hedge_round'
        case 'grassland':
          return u < 0.35 ? 'hedge_round' : u < 0.45 ? 'round_tree' : null
        case 'flower_garden':
          return u < 0.45 ? 'flower_bed' : u < 0.8 ? 'Flowers_Tulips' : 'Planter_Red_Flowers'
        case 'habitat':
          return u < 0.25 ? 'Tree_Round_LowPoly' : u < 0.65 ? 'hedge_round' : 'Flowers_Tulips'
        case 'picnic_lawn':
          return u < 0.55 ? 'picnic_table' : u < 0.75 ? 'round_tree' : null
      }
    }
    for (let x = Math.min(...xs) - r0; x <= Math.max(...xs) + r0; x += spacing) {
      for (let z = Math.min(...zs) - r0; z <= Math.max(...zs) + r0; z += spacing) {
        const p: Vec2 = [x + (rand() - 0.5) * spacing * 0.7, z + (rand() - 0.5) * spacing * 0.7]
        const assetId = pick()
        if (!assetId) continue
        const [j0, j1] = catalogEntry(assetId).scaleJitter ?? [1, 1]
        tryAdd(item(assetId, p, rand() * Math.PI * 2, j0 + rand() * (j1 - j0)))
      }
    }
    if (shape.type === 'picnic_lawn' || shape.type === 'habitat') {
      // A bin for picnics, an information sign for habitats, at the first free spot near the middle.
      const c: Vec2 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]
      const extra = shape.type === 'picnic_lawn' ? 'trash_can' : 'park_sign'
      for (let k = 0; k < 40 && !out.some((o) => o.assetId === extra); k++) tryAdd(item(extra, [c[0] + (rand() - 0.5) * k, c[1] + (rand() - 0.5) * k], 0))
    }
    return out
  }

  // Facilities: fixed layouts in the block's own frame (u along length, v across).
  const along: Vec2 = [Math.cos(shape.angle), Math.sin(shape.angle)]
  const across: Vec2 = [-along[1], along[0]]
  const at = (u: number, v: number): Vec2 => [shape.center[0] + along[0] * u + across[0] * v, shape.center[1] + along[1] * u + across[1] * v]
  const towards = (u: number, v: number, tu: number, tv: number) => {
    const [a, b] = [at(u, v), at(tu, tv)]
    return facing([b[0] - a[0], b[1] - a[1]])
  }
  const yaw = facing(across)
  const put = (assetId: string, u: number, v: number, rot = yaw) => out.push(item(assetId, at(u, v), rot))
  switch (shape.type) {
    case 'playground':
      put('swing_set', -6, -3.5)
      put('slide', -0.5, -3.5)
      put('climbing_frame', 5, -3.5)
      put('seesaw', -6, 2.5)
      put('spring_rider', -2, 2.5)
      put('sandbox', 2, 2.5)
      put('merry_go_round', 6.5, 2.5)
      put('park_bench', -4, 6.3, towards(-4, 6.3, -4, 0))
      put('park_bench', 4, 6.3, towards(4, 6.3, 4, 0))
      put('trash_can', 8.8, 6.3)
      break
    case 'basketball_court':
      return facilityFixtures(basketballFacility(shape, 'preview')).map((f) => ({ ...f, basis: 'player' }))
    case 'picnic_area':
      put('gazebo', 0, 0)
      for (const [u, v] of [[-5, -3.5], [5, -3.5], [-5, 3.5], [5, 3.5]]) put('picnic_table', u, v, shape.angle)
      put('trash_can', 7, 5)
      put('round_tree', -7, 0, 0)
      break
    case 'community_plaza':
      put('fountain', 0, 0)
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4
        const [u, v] = [Math.cos(a) * 6, Math.sin(a) * 6]
        put('park_bench', u, v, towards(u, v, 0, 0))
      }
      for (const [u, v] of [[-8.5, -8.5], [8.5, -8.5], [-8.5, 8.5], [8.5, 8.5]]) put('park_lamp', u, v)
      for (const [u, v] of [[0, -8.5], [0, 8.5], [-8.5, 0], [8.5, 0]]) put('Planter_Red_Flowers', u, v, towards(u, v, 0, 0))
      break
    case 'fitness_area':
      put('monkey_bars', -5, -1.5)
      put('climbing_frame', 0, -1.5)
      put('jungle_dome', 5, -1.5)
      put('park_bench', -3, 3.8, towards(-3, 3.8, -3, 0))
      put('drinking_fountain', 3, 3.8)
      put('trash_can', 6.5, 3.8)
      break
  }
  return out
}

/** The court surface and markings drawn by ParkWorld for a basketball block. */
export function basketballFacility(s: Extract<BlockShape, { kind: 'facility' }>, blockId: string): Facility {
  return { id: `block-${blockId}`, kind: 'basketball_court', name: 'Basketball court', center: s.center, angle: s.angle, length: s.length, width: s.width, basis: 'proposed' }
}

/** Whether point p lies on the block's drawn shape (used for cell marking). */
export function shapeContains(shape: BlockShape, p: Vec2): boolean {
  if (shape.kind === 'path') return distToPolyline(p, shape.line) <= shape.width / 2
  if (shape.kind === 'area') return shape.mode === 'brush' ? distToPolyline(p, shape.stroke.length > 1 ? shape.stroke : [shape.stroke[0], shape.stroke[0]]) <= shape.radius : pointInRing(p, shape.ring)
  return pointInRing(p, facilityShapeRing(shape))
}

/** Bounding box of a shape including its width/radius. */
export function shapeBounds(shape: BlockShape): { min: Vec2; max: Vec2 } {
  const [pts, pad] =
    shape.kind === 'path'
      ? [shape.line, shape.width / 2]
      : shape.kind === 'facility'
        ? [facilityShapeRing(shape), 0]
        : shape.mode === 'brush'
          ? [shape.stroke, shape.radius]
          : [shape.ring, 0]
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  return { min: [Math.min(...xs) - pad, Math.min(...zs) - pad], max: [Math.max(...xs) + pad, Math.max(...zs) + pad] }
}
