import { bbox, distToPolyline, pointInRing, type Ring, type Vec2 } from '../utils/geometry2d'
import { type BlockKind, type BlockShape, type ConstructionBlock, shapeBounds, shapeContains } from './blocks'

/** Terrain flags of the base map, per cell. */
export const TERRAIN = {
  outside: 1,
  water: 2,
  woodlot: 4,
  valley: 8,
  /** Existing courts, fields, playgrounds and parking. */
  existing: 16,
} as const

const LAYER: Record<BlockKind, number> = { area: 1, path: 2, facility: 3 }
const LAYER_KIND: (BlockKind | null)[] = [null, 'area', 'path', 'facility']

/** Base terrain the grid is built from, in local metres. */
export interface GridTerrain {
  outer: Ring
  woodlot?: Ring
  valley?: Ring
  streams?: Vec2[][]
  /** Footprints that new blocks may not overlap. Ids let a footprint be cleared when the player demolishes it. */
  existing?: { id: string; ring: Ring }[]
}

/** Half-width of the strip along a stream treated as water (m). */
const STREAM_HALF_WIDTH = 2

/**
 * The logical construction grid (1 m cells over the park), the source of truth
 * for what each piece of ground is. Players draw shapes; blocks claim the cells
 * their shape covers, and the grid is rebuilt from the block list after every change.
 */
export class ParkGrid {
  readonly cell = 1
  readonly x0: number
  readonly z0: number
  readonly w: number
  readonly h: number
  /** TERRAIN flags. */
  readonly terrain: Uint8Array
  /** 0 empty, else LAYER of the owning block. */
  readonly layer: Uint8Array
  /** Index into `owners`, or -1. */
  readonly owner: Int32Array
  private owners: ConstructionBlock[] = []
  /** Cells of each existing footprint, by id. */
  private existingCells = new Map<string, number[]>()
  private removedExisting = new Set<string>()

  constructor(t: GridTerrain) {
    const { min, max } = bbox(t.outer)
    this.x0 = Math.floor(min[0]) - 1
    this.z0 = Math.floor(min[1]) - 1
    this.w = Math.ceil(max[0]) + 1 - this.x0
    this.h = Math.ceil(max[1]) + 1 - this.z0
    const n = this.w * this.h
    this.terrain = new Uint8Array(n)
    this.layer = new Uint8Array(n)
    this.owner = new Int32Array(n).fill(-1)
    const streamBoxes = (t.streams ?? []).map((s) => ({ line: s, ...bbox(s) }))
    const ringBox = (r?: Ring) => (r && r.length > 2 ? { r, ...bbox(r) } : null)
    const inBox = (p: Vec2, b: { min: Vec2; max: Vec2 }, pad = 0) => p[0] >= b.min[0] - pad && p[0] <= b.max[0] + pad && p[1] >= b.min[1] - pad && p[1] <= b.max[1] + pad
    const wood = ringBox(t.woodlot)
    const valley = ringBox(t.valley)
    const existing = (t.existing ?? []).map((e) => ({ id: e.id, box: ringBox(e.ring) })).filter((e) => e.box !== null)
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const p = this.center(j * this.w + i)
        let f = 0
        if (!pointInRing(p, t.outer)) f |= TERRAIN.outside
        if (wood && inBox(p, wood) && pointInRing(p, wood.r)) f |= TERRAIN.woodlot
        if (valley && inBox(p, valley) && pointInRing(p, valley.r)) f |= TERRAIN.valley
        if (streamBoxes.some((s) => inBox(p, s, STREAM_HALF_WIDTH) && distToPolyline(p, s.line) <= STREAM_HALF_WIDTH)) f |= TERRAIN.water
        const idx = j * this.w + i
        for (const e of existing) {
          if (!inBox(p, e.box!) || !pointInRing(p, e.box!.r)) continue
          f |= TERRAIN.existing
          const list = this.existingCells.get(e.id)
          if (list) list.push(idx)
          else this.existingCells.set(e.id, [idx])
        }
        this.terrain[idx] = f
      }
    }
  }

  /** Clears (or restores) the "existing" flag of a demolished footprint, so the ground becomes buildable. */
  setExistingRemoved(id: string, removed: boolean) {
    if (removed) this.removedExisting.add(id)
    else this.removedExisting.delete(id)
    const still = new Set<number>()
    for (const [other, cells] of this.existingCells) if (!this.removedExisting.has(other)) cells.forEach((c) => still.add(c))
    for (const idx of this.existingCells.get(id) ?? []) {
      if (still.has(idx)) this.terrain[idx] |= TERRAIN.existing
      else this.terrain[idx] &= ~TERRAIN.existing
    }
  }

  /** Marks a footprint as existing (e.g. a landmark), so blocks can't be built over it. */
  reserve(id: string, ring: Ring) {
    const { min, max } = bbox(ring)
    const cells: number[] = []
    for (let z = Math.floor(min[1]) + 0.5; z <= max[1]; z++) {
      for (let x = Math.floor(min[0]) + 0.5; x <= max[0]; x++) {
        const idx = this.indexAt([x, z])
        if (idx >= 0 && pointInRing([x, z], ring)) {
          cells.push(idx)
          this.terrain[idx] |= TERRAIN.existing
        }
      }
    }
    this.existingCells.set(id, cells)
  }

  /**
   * Nearest open ground to `target` where a disc of radius r is free of blocks, `obstacles`
   * and the TERRAIN flags in `blockedTerrain` (default: all), within maxDist m.
   */
  findOpenSpot(target: Vec2, r: number, obstacles: { p: Vec2; r: number }[], maxDist = 80, blockedTerrain = 0xff): Vec2 | null {
    const candidates: { p: Vec2; d: number }[] = []
    for (let z = Math.floor(target[1] - maxDist) + 0.5; z <= target[1] + maxDist; z++) {
      for (let x = Math.floor(target[0] - maxDist) + 0.5; x <= target[0] + maxDist; x++) {
        const d = Math.hypot(x - target[0], z - target[1])
        if (d <= maxDist) candidates.push({ p: [x, z], d })
      }
    }
    candidates.sort((a, b) => a.d - b.d)
    for (const { p } of candidates) {
      if (this.discFree(p, r, blockedTerrain) && obstacles.every((o) => Math.hypot(o.p[0] - p[0], o.p[1] - p[1]) > o.r + r)) return p
    }
    return null
  }

  private discFree(p: Vec2, r: number, blockedTerrain: number): boolean {
    for (let z = Math.floor(p[1] - r) + 0.5; z <= p[1] + r; z++) {
      for (let x = Math.floor(p[0] - r) + 0.5; x <= p[0] + r; x++) {
        if ((x - p[0]) ** 2 + (z - p[1]) ** 2 > r * r) continue
        const idx = this.indexAt([x, z])
        if (idx < 0 || this.terrain[idx] & blockedTerrain || this.layer[idx]) return false
      }
    }
    return true
  }

  center(idx: number): Vec2 {
    return [this.x0 + (idx % this.w) + 0.5, this.z0 + Math.floor(idx / this.w) + 0.5]
  }

  indexAt(p: Vec2): number {
    const i = Math.floor(p[0] - this.x0)
    const j = Math.floor(p[1] - this.z0)
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i
  }

  /** Cells whose centre lies on the shape. `outside` counts covered cells beyond the grid. */
  cellsOf(shape: BlockShape): { cells: number[]; beyondGrid: number } {
    const { min, max } = shapeBounds(shape)
    const cells: number[] = []
    let beyondGrid = 0
    for (let z = Math.floor(min[1]) + 0.5; z <= max[1]; z++) {
      for (let x = Math.floor(min[0]) + 0.5; x <= max[0]; x++) {
        if (!shapeContains(shape, [x, z])) continue
        const idx = this.indexAt([x, z])
        if (idx < 0) beyondGrid++
        else cells.push(idx)
      }
    }
    return { cells, beyondGrid }
  }

  kindAt(idx: number): BlockKind | null {
    return LAYER_KIND[this.layer[idx]]
  }

  blockAt(p: Vec2): ConstructionBlock | null {
    const idx = this.indexAt(p)
    return idx < 0 || this.owner[idx] < 0 ? null : this.owners[this.owner[idx]]
  }

  /**
   * Re-marks all cells from the block list, in build order. Facilities always
   * keep their cells, paths cut through areas, and areas only take empty cells.
   * Removing a path therefore gives the area underneath its ground back.
   */
  rebuild(blocks: readonly ConstructionBlock[]) {
    this.layer.fill(0)
    this.owner.fill(-1)
    this.owners = [...blocks]
    blocks.forEach((b, k) => {
      const L = LAYER[b.shape.kind]
      for (const idx of b.cells) {
        const cur = this.layer[idx]
        if (L === LAYER.facility || (L === LAYER.path && cur !== LAYER.facility) || (L === LAYER.area && cur === 0)) {
          this.layer[idx] = L
          this.owner[idx] = k
        }
      }
    })
  }

  /** Cells currently owned by each block id. */
  ownedCells(): Map<string, number[]> {
    const out = new Map<string, number[]>()
    for (let idx = 0; idx < this.owner.length; idx++) {
      const k = this.owner[idx]
      if (k < 0) continue
      const id = this.owners[k].id
      const list = out.get(id)
      if (list) list.push(idx)
      else out.set(id, [idx])
    }
    return out
  }

  /** Cell indices covered by a disc. */
  discCells(p: Vec2, r: number): number[] {
    const out: number[] = []
    const rr = Math.max(r, 0.5)
    for (let z = Math.floor(p[1] - rr) + 0.5; z <= p[1] + rr; z++) {
      for (let x = Math.floor(p[0] - rr) + 0.5; x <= p[0] + rr; x++) {
        if ((x - p[0]) ** 2 + (z - p[1]) ** 2 > rr * rr) continue
        const idx = this.indexAt([x, z])
        if (idx >= 0) out.push(idx)
      }
    }
    if (!out.length) {
      const idx = this.indexAt(p)
      if (idx >= 0) out.push(idx)
    }
    return out
  }
}
