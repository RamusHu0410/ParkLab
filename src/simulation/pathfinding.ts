import type { Vec2 } from '../utils/geometry2d'
import { Cell, type CellType, type NavGrid } from './navGrid'

/**
 * - walk: anyone on foot. Prefers paths, will cross lawn, woods and open courts.
 * - paths: path network only (paved or rough), no shortcuts across grass.
 * - accessible: paved paths only — what a wheelchair, walker or stroller can use.
 */
export type RouteMode = 'walk' | 'paths' | 'accessible'

/** Cost per metre by cell type; Infinity = not allowed. */
const COSTS: Record<RouteMode, Record<CellType, number>> = {
  walk: { [Cell.Blocked]: Infinity, [Cell.PavedPath]: 1, [Cell.RoughPath]: 1.1, [Cell.Service]: 1.3, [Cell.Lawn]: 2, [Cell.Wood]: 3.5, [Cell.Court]: 2.5 },
  paths: { [Cell.Blocked]: Infinity, [Cell.PavedPath]: 1, [Cell.RoughPath]: 1, [Cell.Service]: Infinity, [Cell.Lawn]: Infinity, [Cell.Wood]: Infinity, [Cell.Court]: Infinity },
  accessible: { [Cell.Blocked]: Infinity, [Cell.PavedPath]: 1, [Cell.RoughPath]: Infinity, [Cell.Service]: Infinity, [Cell.Lawn]: Infinity, [Cell.Wood]: Infinity, [Cell.Court]: Infinity },
}

export const allowedIn = (mode: RouteMode) => (t: CellType) => COSTS[mode][t] < Infinity

export interface Route {
  /** Simplified polyline in local metres, start to goal. */
  points: Vec2[]
  /** Walking distance along `points`, metres. */
  lengthM: number
}

class MinHeap {
  private keys: number[] = []
  private vals: number[] = []
  get size() {
    return this.keys.length
  }
  push(key: number, val: number) {
    const k = this.keys
    const v = this.vals
    k.push(key)
    v.push(val)
    let i = k.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= k[i]) break
      ;[k[p], k[i]] = [k[i], k[p]]
      ;[v[p], v[i]] = [v[i], v[p]]
      i = p
    }
  }
  pop(): number {
    const k = this.keys
    const v = this.vals
    const top = v[0]
    const lk = k.pop()!
    const lv = v.pop()!
    if (k.length) {
      k[0] = lk
      v[0] = lv
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < k.length && k[l] < k[m]) m = l
        if (r < k.length && k[r] < k[m]) m = r
        if (m === i) break
        ;[k[m], k[i]] = [k[i], k[m]]
        ;[v[m], v[i]] = [v[i], v[m]]
        i = m
      }
    }
    return top
  }
}

const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
]

/**
 * A* over the grid (8-neighbour, no corner-cutting past blocked cells).
 * Start and goal snap to the nearest allowed cell within `snapM` metres.
 * Returns null when the goal can't be reached in this mode.
 */
export interface RouteOptions {
  snapM?: number
  /** Per-cell 0/1 mask of cells beside traffic, and the cost multiplier for walking on them. */
  danger?: Uint8Array
  dangerFactor?: number
}

export function findRoute(grid: NavGrid, from: Vec2, to: Vec2, mode: RouteMode, opts: RouteOptions = {}): Route | null {
  const { snapM = 12, danger, dangerFactor = 1 } = opts
  const base = COSTS[mode]
  const cost = base
  const ok = allowedIn(mode)
  const s = grid.nearest(from, ok, snapM)
  const g = grid.nearest(to, ok, snapM)
  if (s < 0 || g < 0) return null
  const { w, h, cells } = grid
  const minCost = Math.min(...Object.values(cost))
  const gi = g % w
  const gj = Math.floor(g / w)
  const heuristic = (k: number) => {
    const dx = Math.abs((k % w) - gi)
    const dz = Math.abs(Math.floor(k / w) - gj)
    return minCost * (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz))
  }
  const gScore = new Float32Array(w * h).fill(Infinity)
  const came = new Int32Array(w * h).fill(-1)
  const closed = new Uint8Array(w * h)
  const open = new MinHeap()
  gScore[s] = 0
  open.push(heuristic(s), s)
  while (open.size) {
    const k = open.pop()
    if (closed[k]) continue
    if (k === g) break
    closed[k] = 1
    const i = k % w
    const j = Math.floor(k / w)
    const ck = cost[cells[k] as CellType] * (danger && danger[k] ? dangerFactor : 1)
    for (const [di, dj, step] of NEIGHBOURS) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue
      const n = nj * w + ni
      const cn = cost[cells[n] as CellType] * (danger && danger[n] ? dangerFactor : 1)
      if (cn === Infinity || closed[n]) continue
      // No squeezing diagonally between two blocked cells.
      if (di && dj && (cost[cells[j * w + ni] as CellType] === Infinity || cost[cells[nj * w + i] as CellType] === Infinity)) continue
      const tentative = gScore[k] + (step * (ck + cn)) / 2
      if (tentative < gScore[n]) {
        gScore[n] = tentative
        came[n] = k
        open.push(tentative + heuristic(n), n)
      }
    }
  }
  if (s !== g && came[g] < 0) return null
  const cellsPath: number[] = [g]
  while (cellsPath[cellsPath.length - 1] !== s) cellsPath.push(came[cellsPath[cellsPath.length - 1]])
  cellsPath.reverse()
  const points = danger ? cellsPath.map((c) => grid.center(c)) : simplify(grid, cellsPath, cost)
  let lengthM = 0
  for (let i = 0; i < points.length - 1; i++) lengthM += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
  return { points, lengthM }
}

/**
 * String-pulling: keeps a corner only when the straight shortcut would cross a
 * blocked cell or a cell that costs more than the cells it replaces (so a route
 * that follows a path doesn't cut across the grass).
 */
function simplify(grid: NavGrid, path: number[], cost: Record<CellType, number>): Vec2[] {
  if (path.length <= 2) return path.map((k) => grid.center(k))
  const out: Vec2[] = [grid.center(path[0])]
  let anchor = 0
  let maxCost = cost[grid.cells[path[0]] as CellType]
  for (let i = 2; i < path.length; i++) {
    maxCost = Math.max(maxCost, cost[grid.cells[path[i - 1]] as CellType])
    if (!lineClear(grid, grid.center(path[anchor]), grid.center(path[i]), cost, maxCost)) {
      out.push(grid.center(path[i - 1]))
      anchor = i - 1
      maxCost = cost[grid.cells[path[anchor]] as CellType]
    }
  }
  out.push(grid.center(path[path.length - 1]))
  return out
}

function lineClear(grid: NavGrid, a: Vec2, b: Vec2, cost: Record<CellType, number>, maxCost: number): boolean {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  const n = Math.ceil(L / 0.35)
  for (let t = 1; t < n; t++) {
    const p: Vec2 = [a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n]
    const c = cost[grid.typeAt(p)]
    if (c === Infinity || c > maxCost + 1e-6) return false
  }
  return true
}

/** Cells reachable from `from` in `mode` (flood fill). */
export function reachable(grid: NavGrid, from: Vec2, mode: RouteMode, snapM = 12): Uint8Array {
  const ok = allowedIn(mode)
  const seen = new Uint8Array(grid.w * grid.h)
  const s = grid.nearest(from, ok, snapM)
  if (s < 0) return seen
  const stack = [s]
  seen[s] = 1
  while (stack.length) {
    const k = stack.pop()!
    const i = k % grid.w
    const j = Math.floor(k / grid.w)
    for (const [di, dj] of NEIGHBOURS) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= grid.w || nj >= grid.h) continue
      const n = nj * grid.w + ni
      if (seen[n] || !ok(grid.cells[n] as CellType)) continue
      if (di && dj && (!ok(grid.cells[j * grid.w + ni] as CellType) || !ok(grid.cells[nj * grid.w + i] as CellType))) continue
      seen[n] = 1
      stack.push(n)
    }
  }
  return seen
}
