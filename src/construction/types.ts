/**
 * Why an item is where it is.
 * - woodlot / valley: inside the City of Markham Woodlot or Valley polygon (the land
 *   really is wooded / a stream valley); individual tree positions are illustrative.
 * - osm-playground / osm-court: inside a facility mapped in OpenStreetMap; the
 *   specific equipment is illustrative because OSM does not record it.
 * - illustrative: typical park furniture placed along real paths; not surveyed.
 * - proposed: part of a facility added by design (not in the real park).
 * - player: placed by the player.
 */
export type PlacementBasis = 'woodlot' | 'valley' | 'osm-playground' | 'osm-court' | 'illustrative' | 'proposed' | 'player'

/** An object in the park. Positions are local scene metres (x, y up, z); see geography/projection.ts. */
export interface PlacedItem {
  id: string
  /** Asset id from the asset manifest, e.g. "park_bench". */
  assetId: string
  position: [number, number, number]
  /** Rotation around the vertical axis, radians. */
  rotationY: number
  /** Uniform scale; defaults to 1. */
  scale?: number
  basis?: PlacementBasis
}

/** Current interaction mode of the construction tool. */
export type ConstructionTool = 'select' | 'place' | 'remove'
