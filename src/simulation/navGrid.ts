import type { ConstructionBlock } from '../construction/blocks'
import { catalogEntry } from '../construction/catalog'
import { type Facility, facilityRing } from '../construction/facilities'
import type { PlacedItem } from '../construction/types'
import type { ParkGeometry } from '../geography/parkGeometry'
import { bbox, distToSegment, pointInRing, type Ring, type Vec2 } from '../utils/geometry2d'
import type { ParkPath } from './parkMetrics'

/** How a 1 m cell can be walked on. */
export const Cell = {
  Blocked: 0,
  /** Paved, step-free path. */
  PavedPath: 1,
  /** Walkable path that isn't wheelchair-accessible (gravel, trail, steps). */
  RoughPath: 2,
  /** Service roads and parking: walkable, but shared with cars. */
  Service: 3,
  Lawn: 4,
  /** Woodlot, valley floor and planted woodland. */
  Wood: 5,
  /** Courts, playgrounds, plazas. */
  Court: 6,
} as const
export type CellType = (typeof Cell)[keyof typeof Cell]

/** Surface categories per cell, for land-use figures (see parkMetrics.Surface). */
const S = { Outside: 0, Open: 1, Green: 2, Hard: 3, Water: 4 } as const

/** Width of the OSM paths, metres (OSM has no width tags here; matches the map drawing). */
export const PATH_WIDTH_M = 2.2
/** Stream banks kept clear either side of the channel centreline, metres. */
const STREAM_BUFFER_M = 1.5

export interface NavGridInput {
  geo: ParkGeometry
  items: PlacedItem[]
  facilities: Facility[]
  /** Player constructions. With `ownedCells` (from the construction ParkGrid) their painted cells are used. */
  blocks?: readonly ConstructionBlock[]
  ownedCells?: Map<string, number[]>
  /** All paths (OSM + built). Defaults to the OSM paths. */
  paths?: ParkPath[]
}

/**
 * 1 m raster of the park for pathfinding and land-use figures, in local metres.
 * Same cell layout as the construction ParkGrid, so their indices match.
 * Cell (i, j) covers x ∈ [x0 + i, x0 + i + 1), z ∈ [z0 + j, z0 + j + 1).
 */
export class NavGrid {
  readonly x0: number
  readonly z0: number
  readonly w: number
  readonly h: number
  readonly cells: Uint8Array
  readonly surface: Uint8Array

  constructor({ geo, items, facilities, blocks = [], ownedCells, paths }: NavGridInput) {
    const { min, max } = bbox(geo.outer)
    this.x0 = Math.floor(min[0]) - 1
    this.z0 = Math.floor(min[1]) - 1
    this.w = Math.ceil(max[0]) + 1 - this.x0
    this.h = Math.ceil(max[1]) + 1 - this.z0
    this.cells = new Uint8Array(this.w * this.h)
    this.surface = new Uint8Array(this.w * this.h)
    const set = (k: number, cell: CellType, surface: number) => {
      this.cells[k] = cell
      this.surface[k] = surface
    }

    const inside = new Uint8Array(this.w * this.h)
    this.eachInRing(geo.outer, (k) => {
      inside[k] = 1
      set(k, Cell.Lawn, S.Open)
    })
    this.eachInRing(geo.woodlot, (k) => set(k, Cell.Wood, S.Green))
    this.eachInRing(geo.valley, (k) => set(k, Cell.Wood, S.Green))
    for (const p of geo.parking) this.eachInRing(p.ring, (k) => set(k, Cell.Service, S.Hard))
    for (const p of geo.playgrounds) this.eachInRing(p.ring, (k) => set(k, Cell.Court, S.Hard))
    for (const f of facilities) {
      // Fenced or boarded surfaces can't be walked through; open courts and grass fields can.
      const [cell, surface] =
        f.kind === 'tennis_court' || f.kind === 'ice_rink' ? [Cell.Blocked, S.Hard] : f.kind === 'soccer_field' ? [Cell.Lawn, S.Green] : [Cell.Court, S.Hard]
      this.eachInRing(facilityRing(f), (k) => set(k, cell, surface))
    }

    // Player-painted areas and facility blocks.
    for (const b of blocks) {
      const cellsOf = ownedCells?.get(b.id) ?? b.cells
      if (b.shape.kind === 'area') {
        const t = b.shape.type
        const [cell, surface] = t === 'woodland' || t === 'habitat' ? [Cell.Wood, S.Green] : t === 'flower_garden' ? [Cell.Lawn, S.Green] : [Cell.Lawn, S.Open]
        for (const k of cellsOf) if (inside[k]) set(k, cell, surface)
      } else if (b.shape.kind === 'facility') {
        for (const k of cellsOf) if (inside[k]) set(k, Cell.Court, S.Hard)
      }
    }

    for (const s of geo.streams) this.strokeLine(s, STREAM_BUFFER_M, (k) => set(k, Cell.Blocked, S.Water))
    for (const it of items) {
      // Footprints: trees block only around the trunk but their canopy is not open lawn.
      const e = catalogEntry(it.assetId)
      const r = e.radius * (it.scale ?? 1)
      const walkR = e.category === 'tree' ? 0.6 : e.category === 'flowers' || e.category === 'shrub' ? r * 0.8 : Math.min(r, 2.5) * 0.7
      this.stampDisc([it.position[0], it.position[2]], r, (k) => {
        if (this.surface[k] === S.Open) this.surface[k] = S.Green
      })
      this.stampDisc([it.position[0], it.position[2]], walkR, (k) => (this.cells[k] = Cell.Blocked))
    }

    // Paths last: they cross streams on bridges/culverts and run through everything else.
    for (const s of geo.serviceRoads) this.strokeLine(s, 2, (k) => set(k, Cell.Service, S.Hard), inside)
    for (const p of paths ?? osmPaths(geo)) {
      this.strokeLine(p.line, Math.max(p.width, 1.2) / 2, (k) => {
        // Courts the path runs into stay courts; everything else becomes path.
        if (this.cells[k] !== Cell.Court) set(k, p.accessible ? Cell.PavedPath : Cell.RoughPath, S.Hard)
      }, inside)
    }
    // Nothing outside the park boundary is walkable.
    for (let k = 0; k < inside.length; k++) if (!inside[k]) set(k, Cell.Blocked, S.Outside)
  }

  index(i: number, j: number) {
    return j * this.w + i
  }

  /** Cell containing local point p, or -1 outside the grid. */
  cellAt([x, z]: Vec2): number {
    const i = Math.floor(x - this.x0)
    const j = Math.floor(z - this.z0)
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : this.index(i, j)
  }

  center(k: number): Vec2 {
    return [this.x0 + (k % this.w) + 0.5, this.z0 + Math.floor(k / this.w) + 0.5]
  }

  typeAt(p: Vec2): CellType {
    const k = this.cellAt(p)
    return (k < 0 ? Cell.Blocked : this.cells[k]) as CellType
  }

  /** Nearest cell (within `maxR` m) accepted by `ok`, searching outwards in square rings. */
  nearest(p: Vec2, ok: (t: CellType) => boolean, maxR = 30): number {
    const ci = Math.floor(p[0] - this.x0)
    const cj = Math.floor(p[1] - this.z0)
    let best = -1
    let bestD = Infinity
    for (let r = 0; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
          const i = ci + di
          const j = cj + dj
          if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue
          const k = this.index(i, j)
          if (!ok(this.cells[k] as CellType)) continue
          const c = this.center(k)
          const d = Math.hypot(c[0] - p[0], c[1] - p[1])
          if (d < bestD) {
            bestD = d
            best = k
          }
        }
      }
      // Anything found in ring r beats every cell in rings beyond r + 1.
      if (best >= 0 && bestD <= r) return best
    }
    return best
  }

  count(type: CellType): number {
    let n = 0
    for (let k = 0; k < this.cells.length; k++) if (this.cells[k] === type) n++
    return n
  }

  private eachInRing(ring: Ring, fn: (k: number) => void) {
    const { min, max } = bbox(ring)
    const i0 = Math.max(0, Math.floor(min[0] - this.x0))
    const i1 = Math.min(this.w - 1, Math.ceil(max[0] - this.x0))
    const j0 = Math.max(0, Math.floor(min[1] - this.z0))
    const j1 = Math.min(this.h - 1, Math.ceil(max[1] - this.z0))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = this.index(i, j)
        if (pointInRing(this.center(k), ring)) fn(k)
      }
    }
  }

  private strokeLine(line: Vec2[], halfWidth: number, fn: (k: number) => void, mask?: Uint8Array) {
    for (let s = 0; s < line.length - 1; s++) {
      const a = line[s]
      const b = line[s + 1]
      const i0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - halfWidth - this.x0))
      const i1 = Math.min(this.w - 1, Math.ceil(Math.max(a[0], b[0]) + halfWidth - this.x0))
      const j0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - halfWidth - this.z0))
      const j1 = Math.min(this.h - 1, Math.ceil(Math.max(a[1], b[1]) + halfWidth - this.z0))
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = this.index(i, j)
          if (mask && !mask[k]) continue
          if (distToSegment(this.center(k), a, b) <= halfWidth) fn(k)
        }
      }
    }
  }

  private stampDisc(p: Vec2, r: number, fn: (k: number) => void) {
    const rr = Math.max(r, 0.5)
    for (let j = Math.floor(p[1] - rr - this.z0); j <= Math.ceil(p[1] + rr - this.z0); j++) {
      for (let i = Math.floor(p[0] - rr - this.x0); i <= Math.ceil(p[0] + rr - this.x0); i++) {
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue
        const k = this.index(i, j)
        const c = this.center(k)
        if (Math.hypot(c[0] - p[0], c[1] - p[1]) <= rr) fn(k)
      }
    }
  }
}

function osmPaths(geo: ParkGeometry): ParkPath[] {
  return geo.pathInfo.map((p) => ({ line: p.line, width: PATH_WIDTH_M, accessible: !p.surface || p.surface === 'asphalt' || p.surface === 'concrete' || p.surface === 'paved', source: 'osm' as const }))
}
