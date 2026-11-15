// Temporary: measures every model's real size, materials and animation behaviour.
import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ASSETS } from '../utils/assetManifest.generated'

export async function measureAssets() {
  const loader = new GLTFLoader()
  const d = new DRACOLoader()
  d.setDecoderPath('/draco/')
  loader.setDRACOLoader(d)
  const rows = []
  for (const a of ASSETS) {
    const g = await loader.loadAsync(a.url)
    g.scene.updateMatrixWorld(true)
    let anim = {}
    if (a.kind === 'character') {
      const mixer = new THREE.AnimationMixer(g.scene)
      const hips = g.scene.getObjectByName('hips')!
      const leg = g.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('upper_leg.L'))!
      const sample = (clip: string, t: number) => {
        mixer.stopAllAction()
        mixer.clipAction(g.animations.find((c) => c.name === clip)!).reset().play()
        mixer.setTime(t)
        g.scene.updateMatrixWorld(true)
        return { q: leg.quaternion.clone(), hips: hips.getWorldPosition(new THREE.Vector3()) }
      }
      const w0 = sample('Walk', 0), w1 = sample('Walk', 0.25), wEnd = sample('Walk', 0.99)
      const i0 = sample('Idle', 0), i1 = sample('Idle', 1)
      anim = {
        walkLegSwingDeg: +((w0.q.angleTo(w1.q) * 180) / Math.PI).toFixed(1),
        idleLegDeg: +((i0.q.angleTo(i1.q) * 180) / Math.PI).toFixed(1),
        idleHipsBobCm: +(Math.abs(i0.hips.y - i1.hips.y) * 100).toFixed(1),
        walkRootTravelM: +w0.hips.distanceTo(wEnd.hips).toFixed(3),
      }
      mixer.stopAllAction()
      g.scene.updateMatrixWorld(true)
    }
    const box = new THREE.Box3()
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const s = o as THREE.SkinnedMesh
        s.computeBoundingBox()
        box.union(s.boundingBox!.clone().applyMatrix4(s.matrixWorld))
      } else if (m.isMesh) box.expandByObject(m)
    })
    const size = box.getSize(new THREE.Vector3())
    const mats = new Set<string>()
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      for (const mat of ([] as THREE.Material[]).concat(m.material)) {
        const s = mat as THREE.MeshStandardMaterial
        mats.add(`${s.type.replace('Mesh', '').replace('Material', '')} r${s.roughness?.toFixed(1)} m${s.metalness?.toFixed(1)}${s.emissive?.getHex() ? ' emissive' : ''}${s.transparent ? ' transp' : ''}`)
      }
    })
    rows.push({ id: a.id, pack: a.pack, w: +size.x.toFixed(2), h: +size.y.toFixed(2), d: +size.z.toFixed(2), minY: +box.min.y.toFixed(2), mats: [...mats].join(' | '), ...anim })
  }
  return rows
}

export async function measureRigs() {
  const loader = new GLTFLoader()
  const out: Record<string, unknown> = {}
  const restBy: Record<string, string> = {}
  for (const a of ASSETS.filter((x) => x.kind === 'character')) {
    const g = await loader.loadAsync(a.url)
    const skinned = g.scene.getObjectByProperty('type', 'SkinnedMesh') as THREE.SkinnedMesh
    const bones = skinned.skeleton.bones
    const rest = bones.map((b) => `${b.name}<${b.parent && (b.parent as THREE.Bone).isBone ? b.parent.name : 'ROOT'}@${b.position.toArray().map((v) => v.toFixed(3)).join(',')}`).join(';')
    restBy[a.id] = rest
    // Cross-play: drive this character with the Man's clips.
    const mixer = new THREE.AnimationMixer(g.scene)
    const foot = g.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('foot.L'))!
    const walk = g.animations.find((c) => c.name === 'Walk')!
    mixer.clipAction(walk).play()
    const samples: { t: number; p: THREE.Vector3 }[] = []
    for (let i = 0; i <= 60; i++) {
      mixer.setTime(i / 60)
      g.scene.updateMatrixWorld(true)
      samples.push({ t: i / 60, p: foot.getWorldPosition(new THREE.Vector3()) })
    }
    const zs = samples.map((s) => s.p.z), xs = samples.map((s) => s.p.x), ys = samples.map((s) => s.p.y)
    // Forward = direction the foot moves while lifted (highest point).
    const iTop = ys.indexOf(Math.max(...ys))
    const v = samples[Math.min(iTop + 1, 60)].p.clone().sub(samples[Math.max(iTop - 1, 0)].p)
    // Planted phase: foot within 2 cm of its lowest height.
    const minY = Math.min(...ys)
    const planted = samples.filter((s) => s.p.y < minY + 0.02)
    const plantedZ = planted.map((s) => s.p.z)
    out[a.id] = {
      footZRange: +(Math.max(...zs) - Math.min(...zs)).toFixed(3),
      footXRange: +(Math.max(...xs) - Math.min(...xs)).toFixed(3),
      liftedVelocity: v.toArray().map((n) => +n.toFixed(3)),
      plantedFraction: +(planted.length / samples.length).toFixed(2),
      plantedTravel: +(Math.max(...plantedZ) - Math.min(...plantedZ)).toFixed(3),
      clipDurations: Object.fromEntries(g.animations.map((c) => [c.name, +c.duration.toFixed(3)])),
      bones: bones.length,
    }
  }
  const ids = Object.keys(restBy)
  const identicalRest = ids.every((id) => restBy[id] === restBy[ids[0]])
  const diffs = ids.filter((id) => restBy[id] !== restBy[ids[0]]).map((id) => {
    const a = restBy[ids[0]].split(';'), b = restBy[id].split(';')
    return { id, firstDiff: a.findIndex((x, i) => x !== b[i]), ref: a.find((x, i) => x !== b[i]), got: b.find((x, i) => x !== a[i]) }
  })
  return { identicalRest, diffs, perCharacter: out }
}
