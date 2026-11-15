import { ASSETS } from './assetManifest.generated'
import type { AssetEntry } from './assetTypes'

export { ASSETS }
export type { AssetEntry }

/** Local copy of the three.js Draco decoder (public/draco). */
export const DRACO_DECODER_PATH = '/draco/'

const byId = new Map(ASSETS.map((a) => [a.id, a]))

export function getAsset(id: string): AssetEntry {
  const asset = byId.get(id)
  if (!asset) throw new Error(`Unknown asset id: ${id}`)
  return asset
}

export const CHARACTER_ASSETS = ASSETS.filter((a) => a.kind === 'character')
