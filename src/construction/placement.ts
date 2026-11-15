import { dist, polylineLength, type Vec2 } from '../utils/geometry2d'
import { AREA_TYPES, type BlockShape, blockLabel, type ConstructionBlock, type FacilityType, facilityShapeRing, generateBlockItems } from './blocks'
import { catalogEntry } from './catalog'
import { LEVEL } from './level'
import { type ParkGrid, TERRAIN } from './parkGrid'
import { ACCESSIBLE_PATH, CLEARANCE_M, type Violation } from './rules'
import type { PlacedItem } from './types'

/** Result of checking a construction action; shown as the preview and applied on confirm. */
export interface PlacementPlan {
  ok: boolean
  /** Why the placement cannot be built at all (empty when ok): nothing drawn yet, already paved, no funds. */
  reasons: string[]
  /** Siting rules the placement breaks. It can still be built, and is flagged with "!". */
  violations: Violation[]
  /** Information that does not block placement, e.g. cells skipped while painting. */
  notes: string[]
  /** Cells the block will claim. */
  cells: number[]
  cost: number
  /** Existing items in the way, removed on confirm. */
  displaced: PlacedItem[]
  /** Items generated with the block. */
  items: Omit<PlacedItem, 'id'>[]
}
export interface PlacementContext {
  grid: ParkGrid
  items: readonly PlacedItem[]
  budget: number
  /** Built blocks, for the safety zones of player-built playgrounds and courts. */
  blocks?: readonly ConstructionBlock[]
}

export function itemRadius(it: Pick<PlacedItem, 'assetId' | 'scale'>): number {
  try {
    return catalogEntry(it.assetId).radius * (it.scale ?? 1)
  } catch {
    return 0.5
  }
}

export function shapeCost(shape: BlockShape, newCells: number): number {
  const c = LEVEL.costs
  if (shape.kind === 'path') return Math.round(newCells * c.path[shape.type].perSquareMetre)
  if (shape.kind === 'area') return Math.round(newCells * c.area[shape.type].perSquareMetre)
  return c.facility[shape.type].flat
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

/** Safety zone a facility type needs around itself, if any. */
function facilityZone(type: FacilityType): { metres: number; what: string } | null {
  if (type === 'playground') return { metres: CLEARANCE_M.playground, what: 'playground fall zone' }
  if (type === 'basketball_court') return { metres: CLEARANCE_M.sports, what: 'court run-off area' }
  if (type === 'fitness_area') return { metres: CLEARANCE_M.fitness, what: 'fitness equipment fall zone' }
  return null
}

const zoneCache = new WeakMap<object, Set<number>>()
function blockZoneCells(grid: ParkGrid, shape: Extract<BlockShape, { kind: 'facility' }>, metres: number): Set<number> {
  let cells = zoneCache.get(shape)
  if (!cells) zoneCache.set(shape, (cells = grid.zoneCells(facilityShapeRing(shape), metres)))
  return cells
}

const isProtectedTree = (it: PlacedItem) => {
  if (it.basis !== 'woodlot' && it.basis !== 'valley') return false
  try {
    return catalogEntry(it.assetId).category === 'tree'
  } catch {
    return false
  }
}

/**
 * Checks a shape against the siting rules (park boundary, overlap, safety
 * clearance, accessibility, environmental protection), collisions and the
 * budget, and works out what building it would do. Rule breaks are reported
 * as violations; only an empty shape or missing funds stop the build.
 */
export function planPlacement(shape: BlockShape, ctx: PlacementContext): PlacementPlan {
  const { grid } = ctx
  const reasons: string[] = []
  const notes: string[] = []
  const violations: Violation[] = []
  const flag = (rule: Violation['rule'], message: string) => violations.push({ rule, message })
  const { cells: covered, beyondGrid } = grid.cellsOf(shape)
  let cells = covered
  let charged = covered.length
  if (shape.kind === 'path') {
    if (polylineLength(shape.line) < 2) reasons.push('Drag further to draw a path.')
    // Joining an existing path is free where they overlap.
    charged = covered.filter((i) => grid.kindAt(i) !== 'path').length
    if (covered.length > 0 && charged === 0) reasons.push('This ground is already paved.')
  } else if (shape.kind === 'area') {
    if (shape.mode === 'polygon' && shape.ring.length < 3) reasons.push('A polygon needs at least 3 corners.')
    // Areas are painted around other blocks.
    cells = covered.filter((i) => grid.layer[i] === 0)
    charged = cells.length
    const skipped = covered.length - cells.length + beyondGrid
    if (cells.length === 0 && reasons.length === 0) reasons.push('Nothing to paint here: the ground is already built on.')
    else if (skipped > 0) notes.push(`${skipped} m² skipped (already built on${beyondGrid ? ' or too far from the park' : ''}).`)
  }
  if (shape.kind !== 'area' && beyondGrid > 0) notes.push(`${beyondGrid} m² lies too far from the park to be tracked on the map grid.`)

  const has = (flag_: number) => cells.some((i) => grid.terrain[i] & flag_)
  const anyKind = (k: 'path' | 'area' | 'facility') => cells.some((i) => grid.kindAt(i) === k)
  const what = shape.kind === 'path' ? 'path' : shape.kind === 'area' ? AREA_TYPES[shape.type].label.toLowerCase() : 'facility'

  // 1. Park boundary.
  if (beyondGrid > 0 || has(TERRAIN.outside)) flag('boundary', `The ${what} extends outside the park boundary.`)

  // 2. Overlap with existing infrastructure and other facilities.
  if (has(TERRAIN.existing)) flag('overlap', `The ${what} overlaps an existing court, field, playground, parking lot or landmark.`)
  if (shape.kind !== 'area' && anyKind('facility')) flag('overlap', `The ${what} overlaps a facility.`)
  if (shape.kind === 'facility' && anyKind('path')) flag('overlap', 'The facility overlaps a path.')

  // 3. Safety clearance: fall zones and run-off areas stay clear.
  if (shape.kind !== 'area') {
    const zones = [...grid.safetyZones()]
    for (const b of ctx.blocks ?? []) {
      if (b.shape.kind !== 'facility') continue
      const z = facilityZone(b.shape.type)
      if (z) zones.push({ id: b.id, what: z.what, cells: blockZoneCells(grid, b.shape, z.metres) })
    }
    const hit = new Set(zones.filter((z) => cells.some((i) => z.cells.has(i))).map((z) => z.what))
    for (const w of hit) flag('clearance', `The ${what} intrudes on a ${w}.`)
    if (shape.kind === 'facility') {
      const own = facilityZone(shape.type)
      if (own) {
        const zone = grid.zoneCells(facilityShapeRing(shape), own.metres)
        const blocked = [...zone].some((i) => grid.terrain[i] & TERRAIN.existing || grid.kindAt(i) === 'path' || grid.kindAt(i) === 'facility')
        if (blocked) flag('clearance', `Its ${own.metres} m ${own.what} is not clear of paths, courts or other facilities.`)
      }
    }
  }

  // 4. Accessibility of accessible pathways.
  if (shape.kind === 'path' && shape.type === 'accessible_path') {
    if (shape.width < ACCESSIBLE_PATH.minWidth) flag('accessibility', `Clear width ${shape.width} m is below the ${ACCESSIBLE_PATH.minWidth} m minimum.`)
    else if (shape.width < ACCESSIBLE_PATH.passingWidth && polylineLength(shape.line) > ACCESSIBLE_PATH.passingInterval)
      flag('accessibility', `Paths under ${ACCESSIBLE_PATH.passingWidth} m wide need passing spaces every ${ACCESSIBLE_PATH.passingInterval} m; widen the path.`)
    if (has(TERRAIN.valley)) flag('accessibility', 'The path runs down the valley slopes, too steep for an accessible route.')
    if (has(TERRAIN.existing) || anyKind('facility')) flag('accessibility', 'Courts or facilities in the way break the clear width of the route.')
  }

  // 5. Environmental protection.
  if (has(TERRAIN.water)) flag('environment', `The ${what} encroaches on a watercourse.`)
  const natural = shape.kind === 'area' && (shape.type === 'woodland' || shape.type === 'habitat')
  if (shape.kind !== 'path' && !natural && has(TERRAIN.woodlot | TERRAIN.valley)) flag('environment', `The ${what} is in the protected woodlot or valley.`)

  const cost = shapeCost(shape, charged)
  if (reasons.length === 0 && cost > ctx.budget) reasons.push(`${blockLabel(shape)} costs ${money(cost)}; only ${money(ctx.budget)} available.`)

  // Items in the way. Areas are painted around existing items instead.
  const cellSet = new Set(cells)
  const displaced =
    shape.kind === 'area' ? [] : ctx.items.filter((it) => grid.discCells([it.position[0], it.position[2]], itemRadius(it)).some((i) => cellSet.has(i)))
  const displacedIds = new Set(displaced.map((d) => d.id))
  const remaining = ctx.items.filter((it) => !displacedIds.has(it.id))

  const hitsItem = (p: Vec2, r: number) => remaining.some((it) => dist(p, [it.position[0], it.position[2]]) < r + itemRadius(it))
  const free = (p: Vec2, r: number) => {
    const disc = grid.discCells(p, r)
    if (shape.kind === 'path') {
      // Furniture stands beside the path, on open park ground.
      const ok = disc.every((i) => !cellSet.has(i) && !(grid.terrain[i] & (TERRAIN.water | TERRAIN.existing)) && (grid.layer[i] === 0 || grid.kindAt(i) === 'area'))
      return ok && !hitsItem(p, r)
    }
    return disc.every((i) => cellSet.has(i)) && !hitsItem(p, r)
  }
  const trees = displaced.filter(isProtectedTree).length
  if (trees > 0) flag('environment', `Building here removes ${trees} protected tree${trees > 1 ? 's' : ''}.`)
  const items = reasons.length === 0 ? generateBlockItems(shape, free) : []
  if (shape.kind === 'area' && reasons.length === 0 && items.length === 0 && shape.type !== 'grassland') notes.push(`No room for ${AREA_TYPES[shape.type].label.toLowerCase()} props here.`)

  return { ok: reasons.length === 0, reasons, violations, notes, cells, cost, displaced, items }
}
