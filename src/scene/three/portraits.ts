import {
  AnimationMixer,
  Box3,
  DirectionalLight,
  HemisphereLight,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PropertyBinding,
  Scene,
  type SkinnedMesh,
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

  // Frame the head: the posed (skinned) vertices above the neck bone. The models face +z,
  // so the camera looks back along -z from slightly to one side.
  const head = headBox(body)
  const target = head.getCenter(new Vector3())
  const height = head.getSize(new Vector3()).y
  const fov = 22
  // Close-up: the head fills ~85% of the picture.
  const distance = height / 0.85 / (2 * Math.tan(((fov / 2) * Math.PI) / 180))
  const camera = new PerspectiveCamera(fov, 1, 0.05, 10)
  camera.position.copy(target).add(new Vector3(distance * 0.16, distance * 0.04, distance))
  camera.lookAt(target)

  renderer.render(scene, camera)

  const url = renderer.domElement.toDataURL('image/png')
  scene.clear()
  return url
}

/** World-space box of the posed head: skinned vertices more than 2 cm above the neck bone. */
function headBox(body: Object3D): Box3 {
  const box = new Box3()
  const neck = body.getObjectByName(PropertyBinding.sanitizeNodeName('neck'))
  const neckY = neck ? neck.getWorldPosition(new Vector3()).y + 0.02 : -Infinity
  const v = new Vector3()
  body.traverse((o) => {
    const mesh = o as SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    const pos = mesh.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld)
      if (v.y > neckY) box.expandByPoint(v)
    }
  })
  if (box.isEmpty()) box.set(new Vector3(-0.15, 1.25, -0.15), new Vector3(0.15, 1.57, 0.15))
  return box
}
