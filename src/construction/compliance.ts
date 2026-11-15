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

    // 1. Park boundary
    if (hasFlag(cells, TERRAIN.outside)) add('boundary', `${name} extends beyond the park boundary.`)

    // 5. Environmental protection
    const natural = shape.kind === 'area' && (shape.type === 'woodland' || shape.type === 'habitat')
    if (!natural) {
      if (hasFlag(cells, TERRAIN.water)) add('environment', `${name} is built on a watercourse.`)
      if (shape.kind !== 'path' && hasFlag(cells, TERRAIN.woodlot | TERRAIN.valley)) add('environment', `${name} is built in the protected woodlot or valley.`)
    }
    const felled = b.displaced.filter((it) => PROTECTED_TREE_BASIS.has(it.basis ?? '') && isTree(it.assetId)).length
    if (felled > 0) add('environment', `${name} removed ${felled} protected tree${felled > 1 ? 's' : ''}.`)

    if (shape.kind === 'facility') {
      // 2. Facility overlap
      const own = facilityCells.get(b.id)!
      if (hasFlag(cells, TERRAIN.existing)) add('overlap', `${name} overlaps an existing court, field, playground or parking lot.`)
      for (const [otherId, other] of facilityCells) {
        if (otherId < b.id && cells.some((c) => other.has(c))) add('overlap', `${name} overlaps another facility.`)
      }
      if (cells.some((c) => pathCells.has(c))) add('overlap', `${name} overlaps a path.`)

      // 3. Safety clearance: nothing in existing fall zones / run-offs, and its own zone kept clear.
      for (const z of zones) {
        if (cells.some((c) => z.cells.has(c))) add('clearance', `${name} sits in the ${z.what}.`)
      }
      const metres = FACILITY_CLEARANCE[shape.type]
      if (metres) {
        const zone = grid.zoneCells(facilityShapeRing(shape), metres)
        const intrudes = [...facilityCells].some(([otherId, other]) => otherId !== b.id && [...other].some((c) => zone.has(c)))
        if (intrudes || [...zone].some((c) => grid.terrain[c] & TERRAIN.existing && !own.has(c))) add('clearance', `${name} needs ${metres} m of clear ground around it.`)
      }
    }

    // 4. Accessibility
    if (shape.kind === 'path' && shape.type === 'accessible_path') {
      if (shape.width < ACCESSIBLE_PATH.minWidth) add('accessibility', `${name} is ${shape.width} m wide; at least ${ACCESSIBLE_PATH.minWidth} m is required.`)
      else if (shape.width < ACCESSIBLE_PATH.passingWidth && polylineLength(shape.line) > ACCESSIBLE_PATH.passingInterval)
        add('accessibility', `${name} is narrower than ${ACCESSIBLE_PATH.passingWidth} m over more than ${ACCESSIBLE_PATH.passingInterval} m without passing spaces.`)
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

/** Final rating: any broken rule disqualifies; otherwise stars follow average happiness. */
export function rateDesign(checks: readonly RuleCheck[], happiness: number): { stars: 1 | 2 | 3; ending: Ending } {
  if (checks.some((c) => !c.pass)) return { stars: 1, ending: 'disqualified' }
  if (happiness < 50) return { stars: 1, ending: 'unhappy' }
  if (happiness < 70) return { stars: 2, ending: 'ordinary' }
  return { stars: 3, ending: 'greatest' }
}
