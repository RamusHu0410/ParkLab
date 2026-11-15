import { polylineLength } from '../utils/geometry2d'
import { blockLabel, type ConstructionBlock, facilityShapeRing } from './blocks'
import { catalogEntry } from './catalog'
import { type ParkGrid, TERRAIN } from './parkGrid'
import { ACCESSIBLE_PATH, CLEARANCE_M, RULES, type RuleId, type Violation } from './rules'

/** Outcome of one government rule for the finished park. */
export interface RuleCheck {
  rule: RuleId
  label: string
  summary: string
  pass: boolean
  violations: Violation[]
}

/** Footprint safety zone kept clear around a built facility, by type (m). */
const FACILITY_CLEARANCE: Partial<Record<string, number>> = {
  playground: CLEARANCE_M.playground,
  basketball_court: CLEARANCE_M.sports,
  fitness_area: CLEARANCE_M.fitness,
}

const PROTECTED_TREE_BASIS = new Set(['woodlot', 'valley'])

/**
 * Audits every built block against the five siting rules in rules.ts.
 * Used when the player finalizes the design; any violation disqualifies it.
 */
export function auditPark(grid: ParkGrid, blocks: readonly ConstructionBlock[]): RuleCheck[] {
  const found: Record<RuleId, Violation[]> = { boundary: [], overlap: [], clearance: [], accessibility: [], environment: [] }
  const add = (rule: RuleId, message: string) => found[rule].push({ rule, message })
  const hasFlag = (cells: number[], flag: number) => cells.some((i) => grid.terrain[i] & flag)

  // Cells owned by each facility, for overlap and clearance checks between blocks.
  const facilityCells = new Map<string, Set<number>>()
  const pathCells = new Set<number>()
  for (const b of blocks) {
    if (b.shape.kind === 'facility') facilityCells.set(b.id, new Set(b.cells))
    else if (b.shape.kind === 'path') b.cells.forEach((c) => pathCells.add(c))
  }

  const zones = grid.safetyZones()

  for (const b of blocks) {
    const name = blockLabel(b.shape)
    const { shape, cells } = b
    // Rules flagged when the block was built (the "!" markers).
    for (const v of b.violations ?? []) add(v.rule, `${name}: ${v.message}`)
    // The live audit catches what changed since (e.g. a later block in its safety zone); one message per rule is enough.
    const recorded = new Set((b.violations ?? []).map((v) => v.rule))
    const check = (rule: RuleId, message: string) => !recorded.has(rule) && add(rule, message)

    // 1. Park boundary
    if (hasFlag(cells, TERRAIN.outside)) check('boundary', `${name} extends beyond the park boundary.`)

    // 5. Environmental protection
    const natural = shape.kind === 'area' && (shape.type === 'woodland' || shape.type === 'habitat')
    if (!natural) {
      if (hasFlag(cells, TERRAIN.water)) check('environment', `${name} is built on a watercourse.`)
      if (shape.kind !== 'path' && hasFlag(cells, TERRAIN.woodlot | TERRAIN.valley)) check('environment', `${name} is built in the protected woodlot or valley.`)
    }
    const felled = b.displaced.filter((it) => PROTECTED_TREE_BASIS.has(it.basis ?? '') && isTree(it.assetId)).length
    if (felled > 0) check('environment', `${name} removed ${felled} protected tree${felled > 1 ? 's' : ''}.`)

    if (shape.kind === 'facility') {
      // 2. Facility overlap
      const own = facilityCells.get(b.id)!
      if (hasFlag(cells, TERRAIN.existing)) check('overlap', `${name} overlaps an existing court, field, playground or parking lot.`)
      for (const [otherId, other] of facilityCells) {
        if (otherId < b.id && cells.some((c) => other.has(c))) check('overlap', `${name} overlaps another facility.`)
      }
      if (cells.some((c) => pathCells.has(c))) check('overlap', `${name} overlaps a path.`)

      // 3. Safety clearance: nothing in existing fall zones / run-offs, and its own zone kept clear.
      for (const z of zones) {
        if (cells.some((c) => z.cells.has(c))) check('clearance', `${name} sits in the ${z.what}.`)
      }
      const metres = FACILITY_CLEARANCE[shape.type]
      if (metres) {
        const zone = grid.zoneCells(facilityShapeRing(shape), metres)
        const intrudes = [...facilityCells].some(([otherId, other]) => otherId !== b.id && [...other].some((c) => zone.has(c)))
        if (intrudes || [...zone].some((c) => grid.terrain[c] & TERRAIN.existing && !own.has(c))) check('clearance', `${name} needs ${metres} m of clear ground around it.`)
      }
    }

    // 4. Accessibility
    if (shape.kind === 'path' && shape.type === 'accessible_path') {
      if (shape.width < ACCESSIBLE_PATH.minWidth) check('accessibility', `${name} is ${shape.width} m wide; at least ${ACCESSIBLE_PATH.minWidth} m is required.`)
      else if (shape.width < ACCESSIBLE_PATH.passingWidth && polylineLength(shape.line) > ACCESSIBLE_PATH.passingInterval)
        check('accessibility', `${name} is narrower than ${ACCESSIBLE_PATH.passingWidth} m over more than ${ACCESSIBLE_PATH.passingInterval} m without passing spaces.`)
    }
  }

  return (Object.keys(RULES) as RuleId[]).map((rule) => ({ rule, ...RULES[rule], pass: found[rule].length === 0, violations: dedupe(found[rule]) }))
}

function isTree(assetId: string): boolean {
  try {
    return catalogEntry(assetId).category === 'tree'
  } catch {
    return false
  }
}

function dedupe(v: Violation[]): Violation[] {
  const seen = new Set<string>()
  return v.filter((x) => !seen.has(x.message) && seen.add(x.message))
}

export type Ending = 'disqualified' | 'unhappy' | 'ordinary' | 'greatest'

/**
 * Environmental score, 0–100:
 *   60 × green, where green = (green share − 60%) / (85% − 60%), clamped to 0–1
 * + 40 × carbon, where carbon = CO₂ absorbed / 35 t per year, clamped to 0–1.
 * 85% and 35 t are Enoch's targets; the untouched park scores about 97
 * (90% green, 32 t). Paving or clearing ~10% of the park drops it below the threshold.
 */
export const ENVIRONMENT = { greenFloor: 0.6, greenTarget: 0.85, co2Target: 35, greenWeight: 60, co2Weight: 40, threshold: 75 } as const

export function environmentScore(greenShare: number, co2TonnesPerYear: number): number {
  const e = ENVIRONMENT
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
  const green = clamp01((greenShare - e.greenFloor) / (e.greenTarget - e.greenFloor))
  const carbon = clamp01(co2TonnesPerYear / e.co2Target)
  return Math.round(e.greenWeight * green + e.co2Weight * carbon)
}

export interface Rating {
  stars: 1 | 2 | 3
  ending: Ending
  /** A star was taken away for a low environmental score. */
  environmentPenalty: boolean
}

/**
 * Final rating. Any broken rule disqualifies (1 star). Otherwise happiness sets the
 * stars (below 60: 1, 60–89: 2, 90+: 3), and an environmental score below
 * ENVIRONMENT.threshold takes one away, never below 1.
 */
export function rateDesign(checks: readonly RuleCheck[], happiness: number, envScore: number): Rating {
  if (checks.some((c) => !c.pass)) return { stars: 1, ending: 'disqualified', environmentPenalty: false }
  const ending: Ending = happiness < 60 ? 'unhappy' : happiness < 90 ? 'ordinary' : 'greatest'
  const base = ending === 'unhappy' ? 1 : ending === 'ordinary' ? 2 : 3
  const penalty = envScore < ENVIRONMENT.threshold
  return { stars: Math.max(1, base - (penalty ? 1 : 0)) as 1 | 2 | 3, ending, environmentPenalty: penalty }
}
