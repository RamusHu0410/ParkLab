import type { Vec2 } from '../utils/geometry2d'

/**
 * 1 m occupancy grid over the park in local metres. Because the local frame is
 * aligned with Bur Oak Ave, axis-aligned rectangles here are street-aligned in
 * the real park. A summed-area table makes "is this rectangle free?" O(1).
 */
export class OccupancyGrid {
  readonly w: number
  readonly h: number
  private blocked: Uint8Array
  private integral: Float64Array

  constructor(
    readonly x0: number,
    readonly z0: number,
    x1: number,
    z1: number,
  ) {
    this.w = Math.ceil(x1 - x0)
    this.h = Math.ceil(z1 - z0)
    this.blocked = new Uint8Array(this.w * this.h)
    this.integral = new Float64Array((this.w + 1) * (this.h + 1))
  }

  /** Blocks every cell whose centre satisfies `pred`. */
  blockWhere(pred: (p: Vec2) => boolean) {
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        if (!this.blocked[j * this.w + i] && pred([this.x0 + i + 0.5, this.z0 + j + 0.5])) this.blocked[j * this.w + i] = 1
      }
    }
  }

  /** Blocks an axis-aligned rectangle (size a along x, b along z) plus `pad` metres. */
  blockRect(c: Vec2, a: number, b: number, pad = 0) {
    const [i0, i1, j0, j1] = this.cells(c, a + 2 * pad, b + 2 * pad, true)
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) this.blocked[j * this.w + i] = 1
  }

  /** Grows blocked areas by r cells (square neighbourhood). */
  dilate(r: number) {
    this.rebuild()
    const next = new Uint8Array(this.blocked.length)
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        next[j * this.w + i] = this.sum(Math.max(0, i - r), Math.min(this.w, i + r + 1), Math.max(0, j - r), Math.min(this.h, j + r + 1)) > 0 ? 1 : 0
      }
    }
    this.blocked = next
  }

  rebuild() {
    const W = this.w + 1
    for (let j = 0; j < this.h; j++) {
      let row = 0
      for (let i = 0; i < this.w; i++) {
        row += this.blocked[j * this.w + i]
        this.integral[(j + 1) * W + i + 1] = this.integral[j * W + i + 1] + row
      }
    }
  }

  /** Whether an axis-aligned rectangle lies fully on free cells. Call rebuild() after blocking. */
  rectFree(c: Vec2, a: number, b: number): boolean {
    const r = this.cells(c, a, b, false)
    return r !== null && this.sum(r[0], r[1], r[2], r[3]) === 0
  }

  /** Free spot for an a × b rectangle (either orientation) whose centre is closest to `target`. */
  findNearest(target: Vec2, a: number, b: number): { center: Vec2; rotated: boolean } | null {
    let best: { center: Vec2; rotated: boolean; d: number } | null = null
    for (const rotated of [false, true]) {
      const [sa, sb] = rotated ? [b, a] : [a, b]
      for (let j = 0; j < this.h; j++) {
        for (let i = 0; i < this.w; i++) {
          // Centre on half-metre offsets matching the rectangle's parity keeps edges on cell borders.
          const c: Vec2 = [this.x0 + i + (sa % 2) / 2, this.z0 + j + (sb % 2) / 2]
          const d = Math.hypot(c[0] - target[0], c[1] - target[1])
          if (best && d >= best.d) continue
          if (this.rectFree(c, sa, sb)) best = { center: c, rotated, d }
        }
      }
    }
    return best && { center: best.center, rotated: best.rotated }
  }

  private cells(c: Vec2, a: number, b: number, clamp: true): [number, number, number, number]
  private cells(c: Vec2, a: number, b: number, clamp: false): [number, number, number, number] | null
  private cells(c: Vec2, a: number, b: number, clamp: boolean) {
    let i0 = Math.floor(c[0] - a / 2 - this.x0)
    let i1 = Math.ceil(c[0] + a / 2 - this.x0)
    let j0 = Math.floor(c[1] - b / 2 - this.z0)
    let j1 = Math.ceil(c[1] + b / 2 - this.z0)
    if (!clamp && (i0 < 0 || j0 < 0 || i1 > this.w || j1 > this.h)) return null
    i0 = Math.max(0, i0)
    j0 = Math.max(0, j0)
    i1 = Math.min(this.w, i1)
    j1 = Math.min(this.h, j1)
    return [i0, i1, j0, j1]
  }

  private sum(i0: number, i1: number, j0: number, j1: number) {
    const W = this.w + 1
    const I = this.integral
    return I[j1 * W + i1] - I[j0 * W + i1] - I[j1 * W + i0] + I[j0 * W + i0]
  }
}
