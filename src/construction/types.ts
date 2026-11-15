/** An object the player has placed in the park. Positions are scene metres (x, z on the ground plane). */
export interface PlacedItem {
  id: string
  /** Asset id from the asset manifest, e.g. "park_bench". */
  assetId: string
  position: [number, number, number]
  /** Rotation around the vertical axis, radians. */
  rotationY: number
}

/** Current interaction mode of the construction tool. */
export type ConstructionTool = 'select' | 'place' | 'remove'
