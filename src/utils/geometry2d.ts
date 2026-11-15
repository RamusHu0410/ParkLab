/** 2D helpers on the ground plane. Points are local metres [x, z] (see geography/projection.ts). */
export type Vec2 = [number, number]
export type Ring = Vec2[]

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]]
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
export const scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s]
export const len = (a: Vec2) => Math.hypot(a[0], a[1])
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1])
export const normalize = (a: Vec2): Vec2 => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l]
}
/** Left-hand perpendicular when looking along `a` from above (x right, z down). */
export const perp = (a: Vec2): Vec2 => [a[1], -a[0]]

export function pointInRing([x, y]: Vec2, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function ringArea(ring: Ring): number {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

export function ringCentroid(ring: Ring): Vec2 {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    const c = x1 * y2 - x2 * y1
    a += c
    cx += (x1 + x2) * c
    cy += (y1 + y2) * c
  }
  if (Math.abs(a) < 1e-9) return ring.reduce((s, p) => add(s, scale(p, 1 / ring.length)), [0, 0] as Vec2)
  return [cx / (3 * a), cy / (3 * a)]
}

export function bbox(points: Vec2[]): { min: Vec2; max: Vec2 } {
  const min: Vec2 = [Infinity, Infinity]
  const max: Vec2 = [-Infinity, -Infinity]
  for (const [x, y] of points) {
    min[0] = Math.min(min[0], x)
    min[1] = Math.min(min[1], y)
    max[0] = Math.max(max[0], x)
    max[1] = Math.max(max[1], y)
  }
  return { min, max }
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a)
  const l2 = ab[0] ** 2 + ab[1] ** 2
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2))
  return dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t])
}

export function distToPolyline(p: Vec2, line: Vec2[]): number {
  let d = Infinity
  for (let i = 0; i < line.length - 1; i++) d = Math.min(d, distToSegment(p, line[i], line[i + 1]))
  return d
}

/** Distance from p to the edge of a closed ring. */
export const distToRingEdge = (p: Vec2, ring: Ring) => distToPolyline(p, [...ring, ring[0]])

export function polylineLength(line: Vec2[]): number {
  let s = 0
  for (let i = 0; i < line.length - 1; i++) s += dist(line[i], line[i + 1])
  return s
}

/** Point and unit direction at arc length `d` along a polyline (clamped to its ends). */
export function pointAlong(line: Vec2[], d: number): { p: Vec2; dir: Vec2 } {
  let remaining = Math.max(0, d)
  for (let i = 0; i < line.length - 1; i++) {
    const seg = dist(line[i], line[i + 1])
    if (remaining <= seg || i === line.length - 2) {
      const t = seg === 0 ? 0 : Math.min(1, remaining / seg)
      const dir = normalize(sub(line[i + 1], line[i]))
      return { p: add(line[i], scale(sub(line[i + 1], line[i]), t)), dir }
    }
    remaining -= seg
  }
  return { p: line[0], dir: [1, 0] }
}

function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Vec2[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Vec2[] = []
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * Minimum-area enclosing rectangle. `angle` is the direction of the long side
 * (radians, measured from +x towards +z), `length` >= `width`.
 */
export function minAreaRect(points: Vec2[]): { center: Vec2; angle: number; length: number; width: number } {
  const hull = convexHull(points)
  let best = { area: Infinity, center: [0, 0] as Vec2, angle: 0, length: 0, width: 0 }
  for (let i = 0; i < hull.length; i++) {
    const e = normalize(sub(hull[(i + 1) % hull.length], hull[i]))
    const n: Vec2 = [-e[1], e[0]]
    let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const p of hull) {
      const u = p[0] * e[0] + p[1] * e[1]
      const v = p[0] * n[0] + p[1] * n[1]
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
      minV = Math.min(minV, v)
      maxV = Math.max(maxV, v)
    }
    const area = (maxU - minU) * (maxV - minV)
    if (area < best.area) {
      const cu = (minU + maxU) / 2
      const cv = (minV + maxV) / 2
      const center: Vec2 = [cu * e[0] + cv * n[0], cu * e[1] + cv * n[1]]
      const du = maxU - minU
      const dv = maxV - minV
      const angle = du >= dv ? Math.atan2(e[1], e[0]) : Math.atan2(n[1], n[0])
      best = { area, center, angle, length: Math.max(du, dv), width: Math.min(du, dv) }
    }
  }
  return { center: best.center, angle: best.angle, length: best.length, width: best.width }
}

/** Small deterministic PRNG (mulberry32) so the generated park looks the same on every load. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
