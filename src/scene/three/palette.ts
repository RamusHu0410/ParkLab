import { Color, type Material, MeshStandardMaterial } from 'three'

/**
 * Shared cute palette. The two packs use the same flat-shaded low-poly style,
 * but the playground pack's colours are much darker and muddier (e.g. leaves
 * #1b590b vs #66ab03, metal near-black). Playground-pack materials are recoloured
 * to the brighter city-pack palette by material name so both packs read as one
 * set. Values are glTF linear colour factors (the same space as the source files).
 */
const PLAYGROUND_TO_CUTE: Record<string, number> = {
  bark: 0x633313, // city "Bark"
  wood2: 0x633313,
  leaf: 0x66ab03, // city "Leaf"
  leaf2: 0x88ab04, // city "LeafLight"
  hedge: 0x337306, // city "LeafDark"
  grass: 0x66ab03,
  sign: 0x337306,
  metal: 0x33383d, // city "Metal"
  tire: 0x0e0f11, // city "Rubber"
  wood: 0xa84a14, // warm wood between the two packs
  stone: 0x9c8f7a,
  white: 0xfce5ba, // city "Ivory"
  roof: 0xe03b17, // city "RoofRed"
  pr: 0xfa2e0e, // city "Red"
  py: 0xffc201, // city "Yellow"
  pb: 0x098fd9, // city "Cyan"
  pg: 0x2e9e6e, // city "Teal"
  water: 0x268ab0, // city "GlassPale"
  bin: 0x1a5e21, // city "BinGreen"
}

/** One roughness for every surface so light falls on both packs the same way. */
export const STANDARD_ROUGHNESS = 0.85

export function standardizeMaterial(material: Material, pack: 'playground' | 'city'): Material {
  if (!(material instanceof MeshStandardMaterial)) return material
  const m = material.clone()
  const remap = pack === 'playground' ? PLAYGROUND_TO_CUTE[m.name] : undefined
  if (remap !== undefined) m.color = new Color().setRGB(((remap >> 16) & 255) / 255, ((remap >> 8) & 255) / 255, (remap & 255) / 255)
  m.roughness = STANDARD_ROUGHNESS
  m.metalness = 0
  m.flatShading = true
  m.envMap = null
  m.needsUpdate = true
  return m
}

/** Scene lighting shared by every object, tuned for the cute look. */
export const LIGHTING = {
  skyColor: 0xfff4e0,
  groundColor: 0x9ccf7a,
  hemisphereIntensity: 1.6,
  sunColor: 0xfff1d6,
  sunIntensity: 2.4,
  /** Direction the sunlight comes from, in local axes (x along Bur Oak, y up, z towards Bur Oak). */
  sunFrom: [-0.45, 1, 0.55] as [number, number, number],
  shadowOpacity: 0.28,
}
