import level from '../../data/level/1_wismer_park.json'
import type { AreaType, FacilityType, PathType } from './blocks'

/** Level settings: starting funds, construction prices and refund rules (data/level/1_wismer_park.json). */
export interface LevelConfig {
  id: string
  name: string
  startingFunds: number
  currency: string
  economy: {
    /** Share of the build cost returned when the player removes a block. */
    removalRefundRate: number
    /** Share returned when a construction is undone. */
    undoRefundRate: number
    /** Demolition cost of objects and facilities that were in the park before the player started. */
    existingRemoval: { itemCost: number; facilityCost: number }
  }
  costs: {
    path: Record<PathType, { perSquareMetre: number }>
    area: Record<AreaType, { perSquareMetre: number }>
    facility: Record<FacilityType, { flat: number }>
  }
}

export const LEVEL: LevelConfig = level as LevelConfig
