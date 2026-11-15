import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
} from 'three'
import { basketballCourtSize, type Facility } from '../../construction/facilities'
import { STANDARD_ROUGHNESS } from './palette'

/** Surfaces sit just above the ground so the map's paths don't show through. */
const SURFACE_Y = 0.05

/** Cute, consistent court colours (sRGB). */
const COURT = {
  runoff: '#3e9c8c',
  basketball: '#f4a46c',
  basketballKey: '#3f87b5',
  grassA: '#8fd062',
  grassB: '#82c457',
  tennisOuter: '#5fae8a',
  tennisInner: '#4f8fd6',
  ice: '#eef8fd',
  iceBlue: '#5aa9e6',
  iceRed: '#ef5b5b',
  multi: '#3c9d9b',
  multiBorder: '#2f7f7d',
  line: '#ffffff',
  lineYellow: '#ffd34d',
}

type Painter = (ctx: CanvasRenderingContext2D, L: number, W: number) => void

/** Canvas texture in metres: origin at the centre, +x along the facility, +y across it. */
function paintTexture(L: number, W: number, paint: Painter): CanvasTexture {
  const ppm = Math.min(24, 1600 / Math.max(L, W))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(L * ppm)
  canvas.height = Math.round(W * ppm)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(ppm, 0, 0, ppm, canvas.width / 2, canvas.height / 2)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  paint(ctx, L, W)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

const stroke = (ctx: CanvasRenderingContext2D, color: string, width: number, draw: () => void) => {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  draw()
  ctx.stroke()
}

function basketballLines(ctx: CanvasRenderingContext2D, cl: number, cw: number, color: string, keyFill?: string) {
  const half = cl / 2
  const lw = 0.12
  for (const s of [1, -1]) {
    const basket = s * (half - 1.575)
    if (keyFill) {
      ctx.fillStyle = keyFill
      ctx.fillRect(s > 0 ? half - 5.8 : -half, -2.45, 5.8, 4.9)
    }
    stroke(ctx, color, lw, () => ctx.rect(s > 0 ? half - 5.8 : -half, -2.45, 5.8, 4.9))
    stroke(ctx, color, lw, () => ctx.arc(s * (half - 5.8), 0, 1.8, 0, Math.PI * 2))
    // Three-point line: straight parts 0.9 m from the sidelines, then a 6.75 m arc.
    const y = Math.min(cw / 2 - 0.9, 6.6)
    const dx = Math.sqrt(Math.max(0, 6.75 ** 2 - y ** 2))
    stroke(ctx, color, lw, () => {
      ctx.moveTo(s * half, -y)
      ctx.lineTo(basket - s * dx, -y)
      const a = Math.atan2(y, -s * dx)
      // Arc from (-y side) to (+y side), bulging towards half court.
      ctx.arc(basket, 0, 6.75, -a, a, s > 0)
      ctx.lineTo(s * half, y)
    })
  }
  stroke(ctx, color, lw, () => ctx.rect(-half, -cw / 2, cl, cw))
  stroke(ctx, color, lw, () => {
    ctx.moveTo(0, -cw / 2)
    ctx.lineTo(0, cw / 2)
  })
  stroke(ctx, color, lw, () => ctx.arc(0, 0, 1.8, 0, Math.PI * 2))
}

function soccerLines(ctx: CanvasRenderingContext2D, pl: number, pw: number, color: string) {
  const full = pl > 80
  const lw = full ? 0.14 : 0.12
  const box = full ? { d: 16.5, w: 40.3, gd: 5.5, gw: 18.3, spot: 11, circle: 9.15 } : { d: 8, w: 18, gd: 3, gw: 9, spot: 7, circle: 5 }
  stroke(ctx, color, lw, () => ctx.rect(-pl / 2, -pw / 2, pl, pw))
  stroke(ctx, color, lw, () => {
    ctx.moveTo(0, -pw / 2)
    ctx.lineTo(0, pw / 2)
  })
  stroke(ctx, color, lw, () => ctx.arc(0, 0, box.circle, 0, Math.PI * 2))
  for (const s of [1, -1]) {
    const x = s * pl / 2
    stroke(ctx, color, lw, () => ctx.rect(s > 0 ? x - box.d : x, -box.w / 2, box.d, box.w))
    stroke(ctx, color, lw, () => ctx.rect(s > 0 ? x - box.gd : x, -box.gw / 2, box.gd, box.gw))
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x - s * box.spot, 0, 0.25, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(0, 0, 0.25, 0, Math.PI * 2)
  ctx.fill()
}

const PAINTERS: Record<Facility['kind'], Painter> = {
  basketball_court(ctx, L, W) {
    const { length: cl, width: cw } = basketballCourtSize({ length: L, width: W })
    ctx.fillStyle = COURT.runoff
    ctx.fillRect(-L / 2, -W / 2, L, W)
    ctx.fillStyle = COURT.basketball
    ctx.fillRect(-cl / 2, -cw / 2, cl, cw)
    basketballLines(ctx, cl, cw, COURT.line, COURT.basketballKey)
  },
  soccer_field(ctx, L, W) {
    // Mowing stripes across the pitch.
    const n = Math.max(6, Math.round(L / 6))
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? COURT.grassA : COURT.grassB
      ctx.fillRect(-L / 2 + (i * L) / n, -W / 2, L / n + 0.02, W)
    }
    const m = L > 80 ? 3 : 2
    soccerLines(ctx, L - 2 * m, W - 2 * m, COURT.line)
  },
  tennis_court(ctx, L, W) {
    ctx.fillStyle = COURT.tennisOuter
    ctx.fillRect(-L / 2, -W / 2, L, W)
    // Doubles court (23.77 × 10.97 m) fitted inside the mapped area.
    const cl = Math.min(23.77, L - 1)
    const cw = Math.min(10.97, W - 0.6)
    const sw = cw * (8.23 / 10.97)
    const service = cl * (6.4 / 23.77)
    ctx.fillStyle = COURT.tennisInner
    ctx.fillRect(-cl / 2, -cw / 2, cl, cw)
    const lw = 0.08
    stroke(ctx, COURT.line, lw, () => ctx.rect(-cl / 2, -cw / 2, cl, cw))
    stroke(ctx, COURT.line, lw, () => {
      ctx.moveTo(-cl / 2, -sw / 2)
      ctx.lineTo(cl / 2, -sw / 2)
      ctx.moveTo(-cl / 2, sw / 2)
      ctx.lineTo(cl / 2, sw / 2)
      ctx.moveTo(-service, -sw / 2)
      ctx.lineTo(-service, sw / 2)
      ctx.moveTo(service, -sw / 2)
      ctx.lineTo(service, sw / 2)
      ctx.moveTo(-service, 0)
      ctx.lineTo(service, 0)
    })
  },
  ice_rink(ctx, L, W) {
    ctx.fillStyle = COURT.ice
    ctx.fillRect(-L / 2, -W / 2, L, W)
    stroke(ctx, COURT.iceRed, 0.3, () => {
      ctx.moveTo(0, -W / 2)
      ctx.lineTo(0, W / 2)
    })
    stroke(ctx, COURT.iceBlue, 0.3, () => {
      for (const s of [1, -1]) {
        ctx.moveTo(s * L * 0.17, -W / 2)
        ctx.lineTo(s * L * 0.17, W / 2)
      }
    })
    stroke(ctx, COURT.iceBlue, 0.12, () => ctx.arc(0, 0, 3, 0, Math.PI * 2))
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) stroke(ctx, COURT.iceRed, 0.1, () => ctx.arc(sx * L * 0.33, sy * W * 0.22, 2.2, 0, Math.PI * 2))
      stroke(ctx, COURT.iceRed, 0.08, () => {
        ctx.moveTo(sx * (L / 2 - 3), -W / 2 + 1)
        ctx.lineTo(sx * (L / 2 - 3), W / 2 - 1)
      })
      ctx.fillStyle = 'rgba(90,169,230,0.35)'
      ctx.beginPath()
      ctx.arc(sx * (L / 2 - 3), 0, 1.5, sx > 0 ? Math.PI / 2 : -Math.PI / 2, sx > 0 ? (3 * Math.PI) / 2 : Math.PI / 2)
      ctx.fill()
    }
  },
  multi_sport_court(ctx, L, W) {
    ctx.fillStyle = COURT.multiBorder
    ctx.fillRect(-L / 2, -W / 2, L, W)
    ctx.fillStyle = COURT.multi
    ctx.fillRect(-L / 2 + 1, -W / 2 + 1, L - 2, W - 2)
    // Futsal pitch along the court (white).
    const pl = L - 2
    const pw = W - 2
    stroke(ctx, COURT.line, 0.1, () => ctx.rect(-pl / 2, -pw / 2, pl, pw))
    stroke(ctx, COURT.line, 0.1, () => {
      ctx.moveTo(0, -pw / 2)
      ctx.lineTo(0, pw / 2)
    })
    stroke(ctx, COURT.line, 0.1, () => ctx.arc(0, 0, 3, 0, Math.PI * 2))
    for (const s of [1, -1]) stroke(ctx, COURT.line, 0.1, () => ctx.arc(s * pl / 2, 0, 6, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? (3 * Math.PI) / 2 : Math.PI / 2))
    // Two basketball courts across it (yellow), centred 12 m either side of halfway.
    for (const u of [-12, 12]) {
      ctx.save()
      ctx.translate(u, 0)
      ctx.rotate(Math.PI / 2)
      basketballLines(ctx, Math.min(28, W - 1), 15, COURT.lineYellow)
      ctx.restore()
    }
  },
}

const textureCache = new Map<string, CanvasTexture>()

function surfaceMaterial(f: Facility) {
  const key = `${f.kind}:${f.length.toFixed(1)}x${f.width.toFixed(1)}`
  let tex = textureCache.get(key)
  if (!tex) {
    tex = paintTexture(f.length, f.width, PAINTERS[f.kind])
    textureCache.set(key, tex)
  }
  if (f.kind === 'ice_rink') {
    // Self-lit a little so the ice stays cool white under the warm sun.
    return new MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0 })
  }
  return new MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 })
}

const white = new MeshStandardMaterial({ color: 0xffffff, roughness: STANDARD_ROUGHNESS, metalness: 0 })
const netMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0.35, side: DoubleSide, depthWrite: false })
const darkNet = new MeshStandardMaterial({ color: 0x24323a, roughness: 1, metalness: 0, transparent: true, opacity: 0.6, side: DoubleSide, depthWrite: false })
const boardWhite = new MeshStandardMaterial({ color: 0xfdfbf5, roughness: STANDARD_ROUGHNESS, metalness: 0 })
const boardYellow = new MeshStandardMaterial({ color: 0xffc94d, roughness: STANDARD_ROUGHNESS, metalness: 0 })

/** Soccer goal standing on the goal line at u = ±x, opening towards the pitch centre. */
function goal(width: number, height: number, depth: number, side: 1 | -1): Group {
  const g = new Group()
  const r = 0.06
  const post = new CylinderGeometry(r, r, height, 8)
  for (const v of [-width / 2, width / 2]) {
    const m = new Mesh(post, white)
    m.position.set(0, height / 2, v)
    g.add(m)
  }
  const bar = new Mesh(new CylinderGeometry(r, r, width + 2 * r, 8), white)
  bar.rotation.x = Math.PI / 2
  bar.position.set(0, height, 0)
  g.add(bar)
  // Net: back and two sides.
  const back = new Mesh(new PlaneGeometry(width, height), netMat)
  back.rotation.y = Math.PI / 2
  back.position.set(side * depth, height / 2, 0)
  const sideGeo = new PlaneGeometry(depth, height)
  for (const v of [-width / 2, width / 2]) {
    const s = new Mesh(sideGeo, netMat)
    s.position.set((side * depth) / 2, height / 2, v)
    g.add(s)
  }
  const top = new Mesh(new PlaneGeometry(depth, width), netMat)
  top.rotation.x = -Math.PI / 2
  top.position.set((side * depth) / 2, height, 0)
  g.add(back, top)
  return g
}

function roundedRect(L: number, W: number, r: number) {
  const s = new Shape()
  const [x, y] = [-L / 2, -W / 2]
  s.moveTo(x + r, y)
  s.lineTo(x + L - r, y)
  s.quadraticCurveTo(x + L, y, x + L, y + r)
  s.lineTo(x + L, y + W - r)
  s.quadraticCurveTo(x + L, y + W, x + L - r, y + W)
  s.lineTo(x + r, y + W)
  s.quadraticCurveTo(x, y + W, x, y + W - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/** Ring of dasher boards around a rounded rink, `height` tall, standing on the ground. */
function boards(L: number, W: number, r: number, thickness: number, height: number, mat: MeshStandardMaterial, y0 = 0) {
  const outer = roundedRect(L, W, r)
  outer.holes.push(roundedRect(L - 2 * thickness, W - 2 * thickness, r - thickness))
  const geo = new ExtrudeGeometry(outer, { depth: height, bevelEnabled: false, curveSegments: 10 })
  geo.rotateX(-Math.PI / 2)
  const m = new Mesh(geo, mat)
  m.position.y = y0
  return m
}

/** Builds a facility in its own frame (length along +x) and places it in local metres. */
export function buildFacility(f: Facility): Group {
  const g = new Group()
  g.name = f.id
  g.position.set(f.center[0], 0, f.center[1])
  // Facility angle is measured from +x towards +z; three's rotation.y turns +x towards -z.
  g.rotation.y = -f.angle

  if (f.kind === 'ice_rink') {
    const r = Math.min(6, f.width / 3)
    const geo = new ShapeGeometry(roundedRect(f.length, f.width, r), 12)
    geo.rotateX(-Math.PI / 2)
    // ShapeGeometry UVs are shape coordinates; map them onto the 0..1 texture.
    const mat = surfaceMaterial(f)
    // (emissiveMap is the same texture object, so it follows.)
    mat.map!.repeat.set(1 / f.length, 1 / f.width)
    mat.map!.offset.set(0.5, 0.5)
    const ice = new Mesh(geo, mat)
    ice.position.y = SURFACE_Y + 0.05
    ice.receiveShadow = true
    g.add(ice, boards(f.length, f.width, r, 0.2, 0.25, boardYellow), boards(f.length, f.width, r, 0.2, 0.85, boardWhite, 0.25))
  } else {
    const surface = new Mesh(new PlaneGeometry(f.length, f.width), surfaceMaterial(f))
    // Plane is in XY; lay it flat so texture +x runs along the facility and +y across it (towards -z after rotation).
    surface.rotation.x = -Math.PI / 2
    surface.position.y = SURFACE_Y
    surface.receiveShadow = true
    g.add(surface)
  }

  if (f.kind === 'soccer_field') {
    const full = f.length > 80
    const m = full ? 3 : 2
    const [w, h] = full ? [7.32, 2.44] : [5, 2]
    for (const side of [1, -1] as const) {
      const gl = goal(w, h, full ? 2 : 1.4, side)
      gl.position.x = side * (f.length / 2 - m)
      g.add(gl)
    }
  }
  if (f.kind === 'multi_sport_court') {
    for (const side of [1, -1] as const) {
      const gl = goal(3, 2, 1, side)
      gl.position.x = side * (f.length / 2 - 1)
      g.add(gl)
    }
  }
  if (f.kind === 'tennis_court') {
    const cw = Math.min(10.97, f.width - 0.6) + 1.8
    const net = new Mesh(new PlaneGeometry(cw, 0.95), darkNet)
    net.rotation.y = Math.PI / 2
    net.position.y = 0.95 / 2 + SURFACE_Y
    const tape = new Mesh(new BoxGeometry(0.05, 0.07, cw), white)
    tape.position.y = 0.95 + SURFACE_Y
    g.add(net, tape)
    for (const v of [-cw / 2, cw / 2]) {
      const post = new Mesh(new CylinderGeometry(0.05, 0.05, 1.07, 8), white)
      post.position.set(0, 1.07 / 2, v)
      g.add(post)
    }
  }

  g.traverse((o) => {
    const m = o as Mesh
    if (m.isMesh && m.material !== netMat && m.material !== darkNet) m.castShadow = true
  })
  return g
}
