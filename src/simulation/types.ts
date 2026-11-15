export interface SimulationState {
  running: boolean
  /** In-game day counter. */
  day: number
  /** Overall citizen satisfaction, 0–100. */
  satisfaction: number
}
