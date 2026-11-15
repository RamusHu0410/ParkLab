import {
  AnimationMixer,
  type AnimationAction,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  Scene,
  Shape,
  ShapeGeometry,
  ShadowMaterial,
  Vector3,
} from 'three'
import type { Facility } from '../../construction/facilities'
import type { PlacedItem } from '../../construction/types'
import type { Ring } from '../../utils/geometry2d'
import { instantiateCharacter, loadCharacter, loadModelParts } from './assetLibrary'
import { buildFacility } from './facilityMeshes'
import { applyTint } from './portraits'
import { LIGHTING } from './palette'

/** A character standing still or walking back and forth along a polyline. */
export interface CitizenSpec {
  id: string
  assetId: string
  scale: number
  clip: 'Idle' | 'Walk'
  /** Idle: position + facing. */
  position?: [number, number]
  yaw?: number
  /** Walk: route in local metres and ground speed (m/s). */
  route?: [number, number][]
  speed?: number
  /** Playback speed of the Walk clip, so the feet match the ground speed. */
  timeScale?: number
}

export type AgentClip = 'Idle' | 'Walk' | 'Run'

/** A character driven from outside (the citizen simulation): ParkWorld only poses and animates it. */
interface Agent {
  root: Object3D
  mixer: AnimationMixer
  actions: Partial<Record<AgentClip, AnimationAction>>
  clip: AgentClip | null
}

interface CitizenRuntime {
  spec: CitizenSpec
  root: Object3D
  mixer: AnimationMixer
  action: AnimationAction
  /** Distance travelled along a ping-pong route. */
  s: number
}

/**
 * The Three.js side of the park: a scene in local metres that the MapLibre
 * custom layer draws into the map. Rendering-only; game state lives in ParkState.
 */
export class ParkWorld {
  readonly scene = new Scene()
  private readonly itemsRoot = new Group()
  private readonly citizensRoot = new Group()
  private readonly facilitiesRoot = new Group()
  private facilities: Facility[] = []
  private readonly groups = new Map<string, { items: PlacedItem[]; object: Group }>()
  private citizens: CitizenRuntime[] = []
  private agents = new Map<string, Agent>()
  /** Runs every frame before animations update (the citizen simulation hooks in here). */
  beforeUpdate: (dt: number) => void = () => {}
  private disposed = false
  /** Called when something async finished loading and the map should redraw. */
  onChange: () => void = () => {}

  constructor(groundRing: Ring) {
    this.scene.matrixWorldAutoUpdate = true
    this.itemsRoot.name = 'items'
    this.citizensRoot.name = 'citizens'
    this.facilitiesRoot.name = 'facilities'
    this.scene.add(this.facilitiesRoot, this.itemsRoot, this.citizensRoot)
    this.addLighting()
    this.addShadowGround(groundRing)
  }

  private addLighting() {
    this.scene.add(new HemisphereLight(LIGHTING.skyColor, LIGHTING.groundColor, LIGHTING.hemisphereIntensity))
    const sun = new DirectionalLight(LIGHTING.sunColor, LIGHTING.sunIntensity)
    const target = new Vector3(-10, 0, 10) // middle of the park
    sun.position.copy(new Vector3(...LIGHTING.sunFrom).normalize().multiplyScalar(500).add(target))
    sun.target.position.copy(target)
    sun.castShadow = true
    const cam = sun.shadow.camera
    // Covers the whole park (≈ 680 × 330 m) from the sun's point of view.
    cam.left = -420
    cam.right = 420
    cam.top = 300
    cam.bottom = -300
    cam.near = 100
    cam.far = 900
    sun.shadow.mapSize.set(4096, 4096)
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.05
    this.scene.add(sun, sun.target)
  }

  /** Invisible ground over the park that only shows shadows, so trees and furniture sit on the map. */
  private addShadowGround(ring: Ring) {
    // Shape is in the XY plane; rotating -90° about X maps (x, y) to (x, 0, -y).
    const shape = new Shape(ring.map(([x, z]) => ({ x, y: -z }) as never))
    const ground = new Mesh(new ShapeGeometry(shape), new ShadowMaterial({ opacity: LIGHTING.shadowOpacity, color: 0x1d3b12 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    ground.name = 'shadow-ground'
    this.scene.add(ground)
  }

  /** Courts, fields and rinks: painted surfaces plus goals, nets and boards. */
  setFacilities(list: Facility[]) {
    if (list === this.facilities) return
    this.facilities = list
    for (const child of [...this.facilitiesRoot.children]) {
      this.facilitiesRoot.remove(child)
      child.traverse((o) => (o as Mesh).isMesh && (o as Mesh).geometry.dispose())
    }
    for (const f of list) this.facilitiesRoot.add(buildFacility(f))
    this.onChange()
  }

  /** Rebuilds instanced groups for assets whose item list changed. */
  setItems(items: PlacedItem[]) {
    const byAsset = new Map<string, PlacedItem[]>()
    for (const it of items) byAsset.set(it.assetId, [...(byAsset.get(it.assetId) ?? []), it])

    for (const [assetId, g] of this.groups) {
      if (!byAsset.has(assetId)) {
        this.itemsRoot.remove(g.object)
        this.disposeGroup(g.object)
        this.groups.delete(assetId)
      }
    }
    for (const [assetId, list] of byAsset) {
      const prev = this.groups.get(assetId)
      if (prev && sameItems(prev.items, list)) continue
      const object = new Group()
      object.name = assetId
      if (prev) {
        this.itemsRoot.remove(prev.object)
        this.disposeGroup(prev.object)
      }
      this.groups.set(assetId, { items: list, object })
      this.itemsRoot.add(object)
      void this.fillGroup(object, assetId, list)
    }
  }

  private async fillGroup(object: Group, assetId: string, list: PlacedItem[]) {
    const parts = await loadModelParts(assetId)
    if (this.disposed || this.groups.get(assetId)?.object !== object) return
    const m = new Matrix4()
    const q = new Quaternion()
    const up = new Vector3(0, 1, 0)
    for (const part of parts) {
      const mesh = new InstancedMesh(part.geometry, part.material, list.length)
      list.forEach((it, i) => {
        const s = it.scale ?? 1
        q.setFromAxisAngle(up, it.rotationY)
        m.compose(new Vector3(...it.position), q, new Vector3(s, s, s)).multiply(part.matrix)
        mesh.setMatrixAt(i, m)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      mesh.castShadow = true
      mesh.receiveShadow = true
      object.add(mesh)
    }
    this.onChange()
  }

  private disposeGroup(g: Object3D) {
    g.traverse((o) => (o as InstancedMesh).isInstancedMesh && (o as InstancedMesh).dispose())
  }

  async setCitizens(specs: CitizenSpec[]) {
    for (const c of this.citizens) {
      c.mixer.stopAllAction()
      this.citizensRoot.remove(c.root)
    }
    this.citizens = []
    for (const spec of specs) {
      const tpl = await loadCharacter(spec.assetId)
      if (this.disposed) return
      const root = instantiateCharacter(tpl)
      root.scale.setScalar(spec.scale)
      const mixer = new AnimationMixer(root)
      const clip = tpl.animations.find((a) => a.name === spec.clip)
      if (!clip) throw new Error(`${spec.assetId} has no "${spec.clip}" clip`)
      const action = mixer.clipAction(clip)
      action.timeScale = spec.timeScale ?? 1
      // Desynchronise identical characters.
      action.play()
      mixer.setTime(Math.random() * clip.duration)
      const rt: CitizenRuntime = { spec, root, mixer, action, s: 0 }
      this.placeCitizen(rt)
      this.citizensRoot.add(root)
      this.citizens.push(rt)
    }
    this.onChange()
  }

  get animating() {
    return this.citizens.length > 0 || this.agents.size > 0
  }

  /** Adds a driven character. Resolves once its model is loaded. */
  async addAgent(id: string, assetId: string, scale: number, tint?: Record<string, number>): Promise<void> {
    if (this.agents.has(id)) return
    const tpl = await loadCharacter(assetId)
    if (this.disposed || this.agents.has(id)) return
    const root = instantiateCharacter(tpl)
    applyTint(root, tint)
    root.scale.setScalar(scale)
    root.name = `agent:${id}`
    const mixer = new AnimationMixer(root)
    const actions: Agent['actions'] = {}
    for (const clip of ['Idle', 'Walk', 'Run'] as const) {
      const c = tpl.animations.find((a) => a.name === clip)
      if (c) actions[clip] = mixer.clipAction(c)
    }
    root.visible = false
    this.agents.set(id, { root, mixer, actions, clip: null })
    this.citizensRoot.add(root)
    this.onChange()
  }

  /** Poses a driven character. `yaw` 0 faces +z. Switching clip cross-fades over 0.25 s. */
  setAgent(id: string, x: number, z: number, yaw: number, clip: AgentClip, timeScale = 1) {
    const a = this.agents.get(id)
    if (!a) return
    a.root.visible = true
    a.root.position.set(x, 0, z)
    a.root.rotation.y = yaw
    const next = a.actions[clip] ?? a.actions.Idle
    if (!next) return
    next.timeScale = timeScale
    if (a.clip !== clip) {
      const prev = a.clip ? a.actions[a.clip] : undefined
      next.reset().play()
      if (prev && prev !== next) next.crossFadeFrom(prev, 0.25, false)
      a.clip = clip
    }
  }

  removeAgent(id: string) {
    const a = this.agents.get(id)
    if (!a) return
    a.mixer.stopAllAction()
    this.citizensRoot.remove(a.root)
    this.agents.delete(id)
  }

  private placeCitizen(c: CitizenRuntime) {
    const { spec, root } = c
    if (spec.clip === 'Idle' || !spec.route) {
      const [x, z] = spec.position ?? [0, 0]
      root.position.set(x, 0, z)
      root.rotation.y = spec.yaw ?? 0
      return
    }
    // Ping-pong along the route: walk to the end, turn around, walk back.
    const route = spec.route
    const segs = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i][0], p[1] - route[i][1]))
    const total = segs.reduce((a, b) => a + b, 0)
    const t = c.s % (2 * total)
    let d = t <= total ? t : 2 * total - t
    const forward = t <= total
    let i = 0
    while (i < segs.length - 1 && d > segs[i]) d -= segs[i++]
    const a = route[i]
    const b = route[i + 1]
    const f = segs[i] === 0 ? 0 : d / segs[i]
    root.position.set(a[0] + (b[0] - a[0]) * f, 0, a[1] + (b[1] - a[1]) * f)
    const dir = forward ? [b[0] - a[0], b[1] - a[1]] : [a[0] - b[0], a[1] - b[1]]
    // The character models face +z.
    root.rotation.y = Math.atan2(dir[0], dir[1])
  }

  update(dt: number) {
    this.beforeUpdate(dt)
    for (const a of this.agents.values()) a.mixer.update(dt)
    for (const c of this.citizens) {
      c.mixer.update(dt)
      if (c.spec.clip === 'Walk') {
        c.s += (c.spec.speed ?? 1) * dt
        this.placeCitizen(c)
      }
    }
  }

  dispose() {
    this.disposed = true
    this.scene.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh && !(m as InstancedMesh).isInstancedMesh) m.geometry.dispose()
    })
    for (const g of this.groups.values()) this.disposeGroup(g.object)
  }
}

function sameItems(a: PlacedItem[], b: PlacedItem[]) {
  return a.length === b.length && a.every((x, i) => x === b[i])
}
