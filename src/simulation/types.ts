import type { AreaType, FacilityType, PathType } from '../construction/blocks'

/** Park figures derived from the construction grid; recomputed after every construction change. */
export interface ParkStats {
  /** Paved ground per path type, m². */
  pathM2: Record<PathType, number>
  /** Painted ground per area type, m² (cells still owned by the area). */
  areaM2: Record<AreaType, number>
  facilities: Record<FacilityType, number>
  /** Constructed blocks. */
  blocks: number
  /** All objects in the park. */
  items: number
}

export interface SimulationState {
  running: boolean
  /** In-game day counter. */
  day: number
  /** Overall citizen satisfaction, 0–100. */
  satisfaction: number
  stats: ParkStats
}
