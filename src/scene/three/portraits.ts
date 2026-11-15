import {
  AnimationMixer,
  DirectionalLight,
  HemisphereLight,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PropertyBinding,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { type Look, lookKey } from '../../citizens/looks'
import { instantiateCharacter, loadCharacter } from './assetLibrary'
import { LIGHTING } from './palette'

/** Replaces named materials with tinted copies, so only this character changes colour. */
export function applyTint(root: Object3D, tint: Record<string, number> | undefined) {
  if (!tint) return
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    const swap = (m: Material) => {
      const hex = tint[m.name]
      if (hex === undefined || !(m instanceof MeshStandardMaterial)) return m
      const c = m.clone()
      c.color.set(hex)
      return c
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
  })
}

const SIZE = 160
let renderer: WebGLRenderer | null = null
const cache = new Map<string, Promise<string>>()

/**
 * Head-and-shoulders picture of a character model, rendered once with
 * Three.js and returned as a PNG data URL (transparent background).
 * All portraits share one small offscreen renderer.
 */
export function renderPortrait(look: Look): Promise<string> {
  const key = lookKey(look)
  let p = cache.get(key)
  if (!p) {
    p = draw(look)
    cache.set(key, p)
  }
  return p
}

async function draw(look: Look): Promise<string> {
  const tpl = await loadCharacter(look.assetId)
  renderer ??= new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(SIZE, SIZE, false)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0x000000, 0)

  const scene = new Scene()
  scene.add(new HemisphereLight(LIGHTING.skyColor, LIGHTING.groundColor, LIGHTING.hemisphereIntensity))
  const key = new DirectionalLight(LIGHTING.sunColor, LIGHTING.sunIntensity)
  key.position.set(0.6, 1.2, 1.4)
  scene.add(key)

  const body = instantiateCharacter(tpl)
  applyTint(body, look.tint)
  // A relaxed frame of the Idle loop.
  const idle = tpl.animations.find((a) => a.name === 'Idle')
  if (idle) {
    const mixer = new AnimationMixer(body)
    mixer.clipAction(idle).play()
    mixer.setTime(0.4)
  }
  scene.add(body)
  body.updateMatrixWorld(true)

  // Frame the head bone; the models face +z, so the camera looks back along -z, slightly from the side.
  const head = body.getObjectByName(PropertyBinding.sanitizeNodeName('head'))
  const target = head ? head.getWorldPosition(new Vector3()).add(new Vector3(0, 0.06, 0)) : new Vector3(0, 1.3, 0)
  const camera = new PerspectiveCamera(26, 1, 0.05, 10)
  camera.position.copy(target).add(new Vector3(0.28, 0.06, 1.05))
  camera.lookAt(target.clone().add(new Vector3(0, -0.08, 0)))

  renderer.render(scene, camera)
  const url = renderer.domElement.toDataURL('image/png')
  scene.clear()
  return url
}
