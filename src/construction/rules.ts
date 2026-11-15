/**
 * Siting rules. Breaking one does not stop construction: the block is built and
 * flagged with a "!" marker so the player can see what is wrong with it.
 */
export type RuleId = 'boundary' | 'overlap' | 'clearance' | 'accessibility' | 'environment'

export const RULES: Record<RuleId, { label: string; summary: string }> = {
  boundary: { label: 'Park boundary', summary: 'Every facility must remain entirely inside the official park boundary.' },
  overlap: { label: 'Facility overlap', summary: 'Facilities cannot overlap existing buildings, sports courts, playgrounds or other infrastructure.' },
  clearance: { label: 'Safety clearance', summary: 'Facilities must keep playground fall zones and sports field run-off areas clear.' },
  accessibility: { label: 'Accessibility', summary: 'Accessible pathways need at least 1.5 m clear width, gentle slopes and passing spaces where required.' },
  environment: { label: 'Environmental protection', summary: 'Construction must avoid protected trees, wetlands, watercourses and other restricted areas.' },
}

export interface Violation {
  rule: RuleId
  message: string
}

/** Safety zone kept clear around play and sports surfaces (m). */
export const CLEARANCE_M = {
  /** Fall zone around playground equipment (CSA Z614 uses 1.8 m minimum; 3 m covers swings and slides). */
  playground: 3,
  /** Run-off around courts and sports fields. */
  sports: 2,
  /** Fall zone around outdoor fitness equipment. */
  fitness: 2,
} as const

export const ACCESSIBLE_PATH = {
  /** Minimum clear width (m). */
  minWidth: 1.5,
  /** Paths narrower than this need passing spaces… */
  passingWidth: 1.8,
  /** …at least this often (m). */
  passingInterval: 30,
} as const
