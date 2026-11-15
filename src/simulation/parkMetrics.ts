import type { ConstructionBlock, PathType } from '../construction/blocks'
import { catalogEntry } from '../construction/catalog'
import type { Facility } from '../construction/facilities'
import type { PlacedItem } from '../construction/types'
import type { Entrance, ParkGeometry } from '../geography/parkGeometry'
import { findEntrances } from '../geography/parkGeometry'
import { dist, distToPolyline, distToSegment, pointAlong, pointInRing, polylineLength, ringArea, type Vec2 } from '../utils/geometry2d'
import { Cell, NavGrid, PATH_WIDTH_M } from './navGrid'

/** A walkable path, real or built by the player. */
export interface ParkPath {
  line: Vec2[]
  width: number
  /** Paved and step-free (wheelchair, walker and stroller friendly). */
  accessible: boolean
  source: 'osm' | PathType
}

/** Everything the requests are judged on. Built from the live park state. */
export interface ParkSnapshot {
  geo: ParkGeometry
  items: PlacedItem[]
  facilities: Facility[]
  blocks: ConstructionBlock[]
  grid: NavGrid
  paths: ParkPath[]
  entrances: Entrance[]
  trees: { p: Vec2; canopyR: number }[]
  /** 1 for walkable path/service cells directly beside traffic (see pathNextToTraffic). */
  danger: Uint8Array
}

const ROUGH_SURFACES = new Set(['gravel', 'fine_gravel', 'dirt', 'ground', 'grass', 'earth', 'mud', 'sand', 'woodchips', 'unpaved', 'compacted'])

export function collectPaths(geo: ParkGeometry, blocks: readonly ConstructionBlock[]): ParkPath[] {
  const osm: ParkPath[] = geo.pathInfo.map((p) => ({
    line: p.line,
    width: PATH_WIDTH_M,
    // Untagged footways/paths are counted as paved: most here are asphalt park paths, but OSM doesn't say.
    accessible: p.highway !== 'steps' && !(p.surface && ROUGH_SURFACES.has(p.surface)),
    source: 'osm',
  }))
  const built: ParkPath[] = blocks.flatMap((b) =>
    b.shape.kind === 'path' ? [{ line: b.shape.line, width: b.shape.width, accessible: b.shape.type === 'accessible_path', source: b.shape.type }] : [],
  )
  return [...osm, ...built]
}

export function buildSnapshot(geo: ParkGeometry, items: PlacedItem[], facilities: Facility[], blocks: ConstructionBlock[], ownedCells?: Map<string, number[]>): ParkSnapshot {
  const paths = collectPaths(geo, blocks)
  const grid = new NavGrid({ geo, items, facilities, blocks, ownedCells, paths })
  const trees = items
    .filter((i) => catalogEntry(i.assetId).category === 'tree')
    .map((i) => ({ p: [i.position[0], i.position[2]] as Vec2, canopyR: catalogEntry(i.assetId).radius * (i.scale ?? 1) }))
  return { geo, items, facilities, blocks, grid, paths, entrances: findEntrances(paths.map((p) => p.line), geo.outer, geo.streets), trees, danger: dangerMask(geo, grid) }
}

/** Marks path and service cells that sit directly beside a street, service road or parking lot. */
function dangerMask(geo: ParkGeometry, grid: NavGrid): Uint8Array {
  const mask = new Uint8Array(grid.cells.length)
  const segs = (lines: Vec2[][], pad: number) =>
    lines.flatMap((l) => l.slice(0, -1).map((a, i) => ({ a, b: l[i + 1], minX: Math.min(a[0], l[i + 1][0]) - pad, maxX: Math.max(a[0], l[i + 1][0]) + pad, minZ: Math.min(a[1], l[i + 1][1]) - pad, maxZ: Math.max(a[1], l[i + 1][1]) + pad, pad })))
  const all = [
    ...segs(geo.streets.map((s) => s.line), STREET_DANGER_M),
    ...segs([...geo.serviceRoads, ...geo.parking.map((p) => [...p.ring, p.ring[0]])], SERVICE_DANGER_M),
  ]
  for (let k = 0; k < grid.cells.length; k++) {
    const c = grid.cells[k]
    if (c === Cell.Service) {
      mask[k] = 1
      continue
    }
    if (c !== Cell.PavedPath && c !== Cell.RoughPath) continue
    const p = grid.center(k)
    for (const s of all) {
      if (p[0] < s.minX || p[0] > s.maxX || p[1] < s.minZ || p[1] > s.maxZ) continue
      if (distToSegment(p, s.a, s.b) < s.pad) {
        mask[k] = 1
        break
      }
    }
  }
  return mask
}

/** Metres of a route that run on cells beside traffic, sampled every 0.5 m. */
export function routeDangerM(snap: ParkSnapshot, points: Vec2[]): number {
  let n = 0
  for (let i = 0; i < points.length - 1; i++) {
    const L = dist(points[i], points[i + 1])
    for (let d = 0.25; d < L; d += 0.5) {
      const p: Vec2 = [points[i][0] + ((points[i + 1][0] - points[i][0]) * d) / L, points[i][1] + ((points[i + 1][1] - points[i][1]) * d) / L]
      const k = snap.grid.cellAt(p)
      if (k >= 0 && snap.danger[k]) n++
    }
  }
  return n * 0.5
}

// ---------------------------------------------------------------------------
// Shade

/** A point counts as shaded within the canopy plus this margin (m): the sun is never straight overhead here. */
const SHADE_MARGIN_M = 1

class TreeIndex {
  private cells = new Map<string, { p: Vec2; canopyR: number }[]>()
  constructor(trees: ParkSnapshot['trees'], private size = 10) {
    for (const t of trees) {
      const k = this.key(t.p)
      const list = this.cells.get(k)
      if (list) list.push(t)
      else this.cells.set(k, [t])
    }
  }
  private key(p: Vec2) {
    return `${Math.floor(p[0] / this.size)},${Math.floor(p[1] / this.size)}`
  }
  shaded(p: Vec2): boolean {
    const ci = Math.floor(p[0] / this.size)
    const cj = Math.floor(p[1] / this.size)
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++)
        for (const t of this.cells.get(`${ci + di},${cj + dj}`) ?? []) if (dist(t.p, p) <= t.canopyR + SHADE_MARGIN_M) return true
    return false
  }
}

/** Metres of path whose centreline is under or next to a tree canopy, sampled every metre. */
export function shadedPathLength(snap: ParkSnapshot, lines: Vec2[][] = snap.paths.map((p) => p.line)): { shadedM: number; totalM: number } {
  const index = new TreeIndex(snap.trees)
  // A path drawn over another one doesn't count twice: each grid cell belongs to the first path through it.
  const claimed = new Int32Array(snap.grid.cells.length).fill(-1)
  let shadedM = 0
  let totalM = 0
  lines.forEach((line, li) => {
    const L = polylineLength(line)
    for (let d = 0.5; d < L; d += 1) {
      const p = pointAlong(line, d).p
      if (!pointInRing(p, snap.geo.outer)) continue
      const k = snap.grid.cellAt(p)
      if (k >= 0) {
        if (claimed[k] >= 0 && claimed[k] !== li) continue
        claimed[k] = li
      }
      totalM += 1
      if (index.shaded(p)) shadedM += 1
    }
  })
  return { shadedM, totalM }
}

// ---------------------------------------------------------------------------
// Traffic safety

/** Path closer than this to a street centreline is "next to traffic" (m). Half a 2-lane road plus boulevard ≈ 6 m, plus 6 m. */
export const STREET_DANGER_M = 12
/** Same for parking aisles, service roads and parking lot edges inside the park (m). */
export const SERVICE_DANGER_M = 3

/** Metres of path that run directly beside traffic (streets, service roads, parking). */
export function pathNextToTraffic(snap: ParkSnapshot): { unsafeM: number; totalM: number } {
  const { geo } = snap
  const service = [...geo.serviceRoads, ...geo.parking.map((p) => [...p.ring, p.ring[0]])]
  let unsafeM = 0
  let totalM = 0
  for (const path of snap.paths) {
    const L = polylineLength(path.line)
    for (let d = 0.5; d < L; d += 1) {
      const p = pointAlong(path.line, d).p
      if (!pointInRing(p, geo.outer)) continue
      totalM += 1
      const nearStreet = geo.streets.some((s) => distToPolyline(p, s.line) < STREET_DANGER_M)
      const nearService = !nearStreet && service.some((l) => distToPolyline(p, l) < SERVICE_DANGER_M)
      if (nearStreet || nearService) unsafeM += 1
    }
  }
  return { unsafeM, totalM }
}

// ---------------------------------------------------------------------------
// Land use

export interface LandUse {
  parkM2: number
  /** Lawn, woods, planted areas and grass fields. Trees standing on lawn count as green. */
  greenM2: number
  /** Paths, service roads, parking, courts, plazas, the rink. */
  hardM2: number
  parkingM2: number
  /** Open lawn with nothing on it: no path, court, building, tree or furniture. */
  openM2: number
  /** Largest single connected patch of open lawn. */
  largestOpenM2: number
}

export function landUse(snap: ParkSnapshot): LandUse {
  const g = snap.grid
  let parkM2 = 0
  let greenM2 = 0
  let hardM2 = 0
  let openM2 = 0
  for (let k = 0; k < g.cells.length; k++) {
    const s = g.surface[k]
    if (s === Surface.Outside) continue
    parkM2++
    if (s === Surface.Green || s === Surface.Open) greenM2++
    else if (s === Surface.Hard) hardM2++
    if (s === Surface.Open) openM2++
  }
  return {
    parkM2,
    greenM2,
    hardM2,
    parkingM2: snap.geo.parking.reduce((a, p) => a + ringArea(p.ring), 0),
    openM2,
    largestOpenM2: largestPatch(g, Surface.Open),
  }
}

/** Surface categories stored per cell in NavGrid.surface. */
export const Surface = { Outside: 0, Open: 1, Green: 2, Hard: 3, Water: 4 } as const

function largestPatch(g: NavGrid, value: number): number {
  const seen = new Uint8Array(g.cells.length)
  let best = 0
  const stack: number[] = []
  for (let s = 0; s < g.cells.length; s++) {
    if (seen[s] || g.surface[s] !== value) continue
    let n = 0
    seen[s] = 1
    stack.push(s)
    while (stack.length) {
      const k = stack.pop()!
      n++
      const i = k % g.w
      const j = Math.floor(k / g.w)
      for (const [ni, nj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        if (ni < 0 || nj < 0 || ni >= g.w || nj >= g.h) continue
        const nk = nj * g.w + ni
        if (!seen[nk] && g.surface[nk] === value) {
          seen[nk] = 1
          stack.push(nk)
        }
      }
    }
    best = Math.max(best, n)
  }
  return best
}

// ---------------------------------------------------------------------------
// Carbon

/**
 * CO₂ taken up per year. An estimate for gameplay, not a measurement:
 * - 22 kg per tree per year, a commonly used average for a maturing urban tree
 *   (actual uptake varies roughly 10–50 kg with species, size and health);
 * - 0.2 kg/m²/yr for woodland, habitat and planted ground, 0.05 kg/m²/yr for mown lawn.
 */
export const CO2 = { perTreeKg: 22, perWoodM2Kg: 0.2, perLawnM2Kg: 0.05 }

export function co2UptakeTonnes(snap: ParkSnapshot): number {
  let wood = 0
  let lawn = 0
  for (let k = 0; k < snap.grid.cells.length; k++) {
    const s = snap.grid.surface[k]
    if (s !== Surface.Green && s !== Surface.Open) continue
    if (snap.grid.cells[k] === Cell.Wood) wood++
    else lawn++
  }
  return (snap.trees.length * CO2.perTreeKg + wood * CO2.perWoodM2Kg + lawn * CO2.perLawnM2Kg) / 1000
}
