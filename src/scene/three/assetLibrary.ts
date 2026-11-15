import { type AnimationClip, type BufferGeometry, type Material, Matrix4, type Mesh, type Object3D } from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { DRACO_DECODER_PATH, getAsset } from '../../utils/assets'
import { standardizeMaterial } from './palette'

/** One drawable piece of a static model: geometry + material + transform inside the model. */
export interface ModelPart {
  geometry: BufferGeometry
  material: Material
  matrix: Matrix4
}

export interface CharacterTemplate {
  scene: Object3D
  animations: AnimationClip[]
}

const loader = new GLTFLoader()
const draco = new DRACOLoader()
draco.setDecoderPath(DRACO_DECODER_PATH)
loader.setDRACOLoader(draco)

const staticCache = new Map<string, Promise<ModelPart[]>>()
const characterCache = new Map<string, Promise<CharacterTemplate>>()

/** Static model split into parts, with standardized materials. Cached per asset. */
export function loadModelParts(assetId: string): Promise<ModelPart[]> {
  let p = staticCache.get(assetId)
  if (!p) {
    const asset = getAsset(assetId)
    p = loader.loadAsync(asset.url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true)
      const parts: ModelPart[] = []
      gltf.scene.traverse((o) => {
        const mesh = o as Mesh
        if (!mesh.isMesh) return
        const mats = ([] as Material[]).concat(mesh.material)
        if (mats.length !== 1) throw new Error(`${assetId}: multi-material meshes are not supported`)
        parts.push({ geometry: mesh.geometry, material: standardizeMaterial(mats[0], asset.pack), matrix: mesh.matrixWorld.clone() })
      })
      return parts
    })
    staticCache.set(assetId, p)
  }
  return p
}

/** Animated character template. Use `instantiateCharacter` to get an independent copy. */
export function loadCharacter(assetId: string): Promise<CharacterTemplate> {
  let p = characterCache.get(assetId)
  if (!p) {
    const asset = getAsset(assetId)
    p = loader.loadAsync(asset.url).then((gltf) => {
      gltf.scene.traverse((o) => {
        const mesh = o as Mesh
        if (mesh.isMesh) {
          mesh.material = standardizeMaterial(mesh.material as Material, asset.pack)
          mesh.castShadow = true
          // Skinned meshes move outside their bind-pose bounds while animating.
          mesh.frustumCulled = false
        }
      })
      return { scene: gltf.scene, animations: gltf.animations }
    })
    characterCache.set(assetId, p)
  }
  return p
}

/** SkeletonUtils.clone gives every copy its own skeleton, which a plain clone() does not. */
export function instantiateCharacter(template: CharacterTemplate): Object3D {
  return cloneSkinned(template.scene)
}
