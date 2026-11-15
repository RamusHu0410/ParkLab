export type AssetPack = 'playground' | 'city'
export type AssetKind = 'environment' | 'character'

export interface AssetEntry {
  id: string
  pack: AssetPack
  kind: AssetKind
  category: string
  /** URL under /public, ready for useGLTF. */
  url: string
  /** City-pack static models are Draco-compressed. */
  draco: boolean
  /** Real-world size in metres [x, y, z] (Blender axes), where known. */
  sizeM?: number[]
  /** Animation clip names for rigged characters. */
  clips?: string[]
}
