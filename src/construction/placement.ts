import { dist, polylineLength, type Vec2 } from '../utils/geometry2d'
import { AREA_TYPES, type BlockShape, blockLabel, generateBlockItems } from './blocks'
import { catalogEntry } from './catalog'
import { LEVEL } from './level'
import { type ParkGrid, TERRAIN } from './parkGrid'
import type { PlacedItem } from './types'

/** Result of checking a construction action; shown as the preview and applied on confirm. */
export interface PlacementPlan {
  ok: boolean
  /** Why the placement is rejected (empty when ok). */
  reasons: string[]
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

/**
 * Checks a shape against the playable boundary, terrain restrictions,
 * collisions and the budget, and works out what building it would do.
 */
export function planPlacement(shape: BlockShape, ctx: PlacementContext): PlacementPlan {
  const { grid } = ctx
  const reasons: string[] = []
  const notes: string[] = []
  const { cells: covered, beyondGrid } = grid.cellsOf(shape)
  const has = (flag: number) => covered.some((i) => grid.terrain[i] & flag)
  const anyKind = (k: 'path' | 'area' | 'facility') => covered.some((i) => grid.kindAt(i) === k)
  let cells = covered
  let charged = covered.length

  if (shape.kind === 'path') {
    if (polylineLength(shape.line) < 2) reasons.push('Drag further to draw a path.')
    if (beyondGrid > 0 || has(TERRAIN.outside)) reasons.push('The path leaves the park boundary.')
    if (has(TERRAIN.water)) reasons.push('The path crosses a stream.')
    if (has(TERRAIN.existing)) reasons.push('The path runs through an existing court, field, playground or parking lot.')
    if (anyKind('facility')) reasons.push('The path runs through a facility.')
    // Joining an existing path is free where they overlap.
    charged = covered.filter((i) => grid.kindAt(i) !== 'path').length
    if (covered.length > 0 && charged === 0) reasons.push('This ground is already paved.')
  } else if (shape.kind === 'facility') {
    if (beyondGrid > 0 || has(TERRAIN.outside)) reasons.push('The facility is outside the park boundary.')
    if (has(TERRAIN.woodlot | TERRAIN.valley)) reasons.push('Facilities cannot be built in the protected woodlot or valley.')
    if (has(TERRAIN.water)) reasons.push('The facility sits on a stream.')
    if (has(TERRAIN.existing) || anyKind('facility')) reasons.push('The facility overlaps another facility.')
    if (anyKind('path')) reasons.push('The facility overlaps a path.')
  } else {
    if (shape.mode === 'polygon' && shape.ring.length < 3) reasons.push('A polygon needs at least 3 corners.')
    const natural = shape.type === 'woodland' || shape.type === 'habitat'
    const blocked = TERRAIN.outside | TERRAIN.water | TERRAIN.existing | (natural ? 0 : TERRAIN.woodlot | TERRAIN.valley)
    cells = covered.filter((i) => !(grid.terrain[i] & blocked) && grid.layer[i] === 0)
    charged = cells.length
    const skipped = covered.length - cells.length + beyondGrid
    if (cells.length === 0 && reasons.length === 0) reasons.push('Nothing to paint here: the ground is outside the park, protected or already built on.')
    else if (skipped > 0) notes.push(`${skipped} m² skipped (outside the park, ${natural ? '' : 'protected woodlot/valley, '}water or already built on).`)
  }

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
      const ok = disc.every((i) => !cellSet.has(i) && !(grid.terrain[i] & (TERRAIN.outside | TERRAIN.water | TERRAIN.existing)) && (grid.layer[i] === 0 || grid.kindAt(i) === 'area'))
      return ok && !hitsItem(p, r)
    }
    return disc.every((i) => cellSet.has(i)) && !hitsItem(p, r)
  }
  const items = reasons.length === 0 ? generateBlockItems(shape, free) : []
  if (shape.kind === 'area' && reasons.length === 0 && items.length === 0 && shape.type !== 'grassland') notes.push(`No room for ${AREA_TYPES[shape.type].label.toLowerCase()} props here.`)

  return { ok: reasons.length === 0, reasons, notes, cells, cost, displaced, items }
}
