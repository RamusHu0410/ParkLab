import { create } from 'zustand'
import { pointInRing } from '../utils/geometry2d'
import { AREA_TYPES, basketballFacility, type BlockShape, type ConstructionBlock, FACILITY_TYPES, PATH_TYPES } from '../construction/blocks'
import { type Facility, facilityRing } from '../construction/facilities'
import { LEVEL } from '../construction/level'
import { type GridTerrain, ParkGrid } from '../construction/parkGrid'
import { itemRadius, type PlacementPlan, planPlacement } from '../construction/placement'
import type { ConstructionTool, PlacedItem } from '../construction/types'
import type { CitizenRequest } from '../citizens/types'
import type { ParkStats, SimulationState } from '../simulation/types'

/** Starting funds of the current level (data/level/1_wismer_park.json). */
export const STARTING_BUDGET = LEVEL.startingFunds

/**
 * One undoable construction action. `amount` is what was charged (build, demolish)
 * or refunded (remove). Demolish ops remove things that were in the park before the player started.
 */
export type HistoryEntry =
  | { op: 'build' | 'remove'; block: ConstructionBlock; amount: number }
  | { op: 'demolishItem'; item: PlacedItem; amount: number }
  | { op: 'demolishFacility'; facility: Facility; items: PlacedItem[]; amount: number }

export interface ParkState {
  budget: number
  placedItems: PlacedItem[]
  /** Courts, fields and rinks (existing OSM ones, proposed additions and built basketball courts). */
  facilities: Facility[]
  /** Construction blocks built by the player, in build order. */
  blocks: ConstructionBlock[]
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  /** Increases whenever the construction grid changes. */
  gridVersion: number
  tool: ConstructionTool
  /** Asset id chosen for the 'place' tool. */
  selectedAssetId: string | null
  selectedItemId: string | null
  requests: CitizenRequest[]
  /** Facility id → number of citizens using it. Its icon is shown only while in use. */
  facilitiesInUse: Record<string, number>
  simulation: SimulationState
  setTool: (tool: ConstructionTool) => void
  selectAsset: (assetId: string | null) => void
  selectItem: (itemId: string | null) => void
  /** Replaces all items, e.g. with the generated starting layout. */
  loadLayout: (items: Omit<PlacedItem, 'id'>[], facilities?: Facility[]) => void
  /** Adds an item and returns its generated id. */
  addItem: (item: Omit<PlacedItem, 'id'>) => string
  removeItem: (itemId: string) => void
  spend: (amount: number) => boolean
  /** Checks a construction without changing anything. Null until the grid exists. */
  previewBlock: (shape: BlockShape) => PlacementPlan | null
  /** Validates and builds; returns the plan (with the new block id when built). */
  buildBlock: (shape: BlockShape) => (PlacementPlan & { blockId?: string }) | null
  /** Removes a block and refunds part of its cost (LEVEL.economy.removalRefundRate). */
  removeBlock: (blockId: string) => boolean
  /** Demolishes an object that is not part of a constructed block (LEVEL.economy.existingRemoval.itemCost). */
  demolishItem: (itemId: string) => boolean
  /** Demolishes an existing court or field and its fixtures, freeing its ground for building. */
  demolishFacility: (facilityId: string) => boolean
  /** Block whose generated objects include this item, if any. */
  blockOfItem: (itemId: string) => ConstructionBlock | null
  undo: () => boolean
  redo: () => boolean
  startUsingFacility: (facilityId: string) => void
  stopUsingFacility: (facilityId: string) => void
  setRunning: (running: boolean) => void
  reset: () => void
}

let nextId = 1
const newItemId = () => `item-${nextId++}`
let nextBlockId = 1

let grid: ParkGrid | null = null
/** Builds the construction grid from the park terrain; call once the park map is loaded. */
export function initConstructionGrid(terrain: GridTerrain): ParkGrid {
  grid = new ParkGrid(terrain)
  grid.rebuild(useParkStore.getState().blocks)
  useParkStore.setState((s) => ({ gridVersion: s.gridVersion + 1, simulation: { ...s.simulation, stats: computeStats(s.blocks, s.placedItems) } }))
  return grid
}
export const getConstructionGrid = () => grid

const zero = <K extends string>(keys: Record<K, unknown>) => Object.fromEntries(Object.keys(keys).map((k) => [k, 0])) as Record<K, number>

function computeStats(blocks: readonly ConstructionBlock[], items: readonly PlacedItem[]): ParkStats {
  const stats: ParkStats = { pathM2: zero(PATH_TYPES), areaM2: zero(AREA_TYPES), facilities: zero(FACILITY_TYPES), blocks: blocks.length, items: items.length }
  const owned = grid?.ownedCells() ?? new Map<string, number[]>()
  for (const b of blocks) {
    const n = owned.get(b.id)?.length ?? 0
    if (b.shape.kind === 'path') stats.pathM2[b.shape.type] += n
    else if (b.shape.kind === 'area') stats.areaM2[b.shape.type] += n
    else stats.facilities[b.shape.type]++
  }
  return stats
}

const initialState = () => ({
  budget: STARTING_BUDGET,
  placedItems: [] as PlacedItem[],
  facilities: [] as Facility[],
  blocks: [] as ConstructionBlock[],
  undoStack: [] as HistoryEntry[],
  redoStack: [] as HistoryEntry[],
  gridVersion: 0,
  tool: 'select' as ConstructionTool,
  selectedAssetId: null,
  selectedItemId: null,
  requests: [] as CitizenRequest[],
  facilitiesInUse: {} as Record<string, number>,
  simulation: { running: false, day: 1, satisfaction: 50, stats: computeStats([], []) },
})

export const useParkStore = create<ParkState>()((set, get) => {
  /** Puts a block (back) into the park, charging `charge`. */
  const apply = (block: ConstructionBlock, charge: number): boolean => {
    const s = get()
    if (!grid || charge > s.budget) return false
    const blocks = [...s.blocks, block]
    grid.rebuild(blocks)
    const g = grid
    // Re-applied blocks may have props on ground that a later path or facility now owns.
    const blocked = (it: PlacedItem) =>
      g.discCells([it.position[0], it.position[2]], itemRadius(it)).some((i) => {
        const k = g.kindAt(i)
        return (k === 'path' || k === 'facility') && g.blockAt(g.center(i))?.id !== block.id
      })
    const own = block.shape.kind === 'area' ? block.items.filter((it) => !blocked(it)) : block.items
    const gone = new Set(block.displaced.map((d) => d.id))
    const placedItems = [...s.placedItems.filter((it) => !gone.has(it.id)), ...own]
    set({
      budget: s.budget - charge,
      blocks,
      placedItems,
      facilities: block.facility ? [...s.facilities, block.facility] : s.facilities,
      gridVersion: s.gridVersion + 1,
      simulation: { ...s.simulation, stats: computeStats(blocks, placedItems) },
    })
    return true
  }

  /** Takes a block out of the park, crediting `credit`, and restores what it displaced. */
  const unapply = (blockId: string, credit: number): ConstructionBlock | null => {
    const s = get()
    const block = s.blocks.find((b) => b.id === blockId)
    if (!block || !grid) return null
    const ownIds = new Set(block.items.map((i) => i.id))
    // Items of this block that a later block displaced must not come back with that block.
    const blocks = s.blocks.filter((b) => b.id !== blockId).map((b) => (b.displaced.some((d) => ownIds.has(d.id)) ? { ...b, displaced: b.displaced.filter((d) => !ownIds.has(d.id)) } : b))
    grid.rebuild(blocks)
    const g = grid
    const present = new Set(s.placedItems.map((i) => i.id))
    const restorable = block.displaced.filter(
      (it) =>
        !present.has(it.id) &&
        !g.discCells([it.position[0], it.position[2]], itemRadius(it)).some((i) => g.kindAt(i) === 'path' || g.kindAt(i) === 'facility'),
    )
    const placedItems = [...s.placedItems.filter((it) => !ownIds.has(it.id)), ...restorable]
    set({
      budget: s.budget + credit,
      blocks,
      placedItems,
      facilities: block.facility ? s.facilities.filter((f) => f.id !== block.facility!.id) : s.facilities,
      selectedItemId: s.selectedItemId && ownIds.has(s.selectedItemId) ? null : s.selectedItemId,
      gridVersion: s.gridVersion + 1,
      simulation: { ...s.simulation, stats: computeStats(blocks, placedItems) },
    })
    return block
  }

  const afterChange = (patch: Partial<ParkState>) => {
    const s = { ...get(), ...patch }
    set({ ...patch, gridVersion: get().gridVersion + 1, simulation: { ...s.simulation, stats: computeStats(s.blocks, s.placedItems) } })
  }

  /** Performs a history entry (first time or redo). */
  const run = (entry: HistoryEntry): boolean => {
    const s = get()
    switch (entry.op) {
      case 'build':
        return apply(entry.block, entry.amount)
      case 'remove':
        return unapply(entry.block.id, entry.amount) !== null
      case 'demolishItem':
        if (entry.amount > s.budget) return false
        afterChange({ budget: s.budget - entry.amount, placedItems: s.placedItems.filter((i) => i.id !== entry.item.id), selectedItemId: s.selectedItemId === entry.item.id ? null : s.selectedItemId })
        return true
      case 'demolishFacility': {
        if (entry.amount > s.budget) return false
        const gone = new Set(entry.items.map((i) => i.id))
        grid?.setExistingRemoved(entry.facility.id, true)
        afterChange({ budget: s.budget - entry.amount, facilities: s.facilities.filter((f) => f.id !== entry.facility.id), placedItems: s.placedItems.filter((i) => !gone.has(i.id)) })
        return true
      }
    }
  }

  /** Reverts a history entry (undo). Undoing a build refunds LEVEL.economy.undoRefundRate of it; undoing a removal takes the refund back. */
  const revert = (entry: HistoryEntry): boolean => {
    const s = get()
    switch (entry.op) {
      case 'build':
        return unapply(entry.block.id, Math.round(entry.amount * LEVEL.economy.undoRefundRate)) !== null
      case 'remove':
        return apply(entry.block, entry.amount)
      case 'demolishItem':
        afterChange({ budget: s.budget + entry.amount, placedItems: [...s.placedItems, entry.item] })
        return true
      case 'demolishFacility':
        grid?.setExistingRemoved(entry.facility.id, false)
        afterChange({ budget: s.budget + entry.amount, facilities: [...s.facilities, entry.facility], placedItems: [...s.placedItems, ...entry.items] })
        return true
    }
  }

  return {
    ...initialState(),
    setTool: (tool) => set({ tool }),
    selectAsset: (selectedAssetId) => set({ selectedAssetId }),
    selectItem: (selectedItemId) => set({ selectedItemId }),
    loadLayout: (items, facilities) =>
      set((s) => ({ placedItems: items.map((it) => ({ ...it, id: newItemId() })), facilities: facilities ?? s.facilities, selectedItemId: null })),
    addItem: (item) => {
      const id = newItemId()
      set((s) => ({ placedItems: [...s.placedItems, { ...item, id }] }))
      return id
    },
    removeItem: (itemId) =>
      set((s) => ({
        placedItems: s.placedItems.filter((i) => i.id !== itemId),
        selectedItemId: s.selectedItemId === itemId ? null : s.selectedItemId,
      })),
    spend: (amount) => {
      if (amount < 0 || get().budget < amount) return false
      set((s) => ({ budget: s.budget - amount }))
      return true
    },
    previewBlock: (shape) => (grid ? planPlacement(shape, { grid, items: get().placedItems, budget: get().budget }) : null),
    buildBlock: (shape) => {
      const plan = get().previewBlock(shape)
      if (!plan || !plan.ok) return plan
      const id = `block-${nextBlockId++}`
      const block: ConstructionBlock = {
        id,
        shape,
        cost: plan.cost,
        cells: plan.cells,
        items: plan.items.map((it) => ({ ...it, id: newItemId() })),
        displaced: plan.displaced,
        facility: shape.kind === 'facility' && shape.type === 'basketball_court' ? basketballFacility(shape, id) : undefined,
      }
      if (!apply(block, plan.cost)) return { ...plan, ok: false, reasons: ['Not enough funds.'] }
      set((s) => ({ undoStack: [...s.undoStack, { op: 'build', block, amount: plan.cost }], redoStack: [] }))
      return { ...plan, blockId: id }
    },
    removeBlock: (blockId) => {
      const target = get().blocks.find((b) => b.id === blockId)
      if (!target) return false
      const refund = Math.round(target.cost * LEVEL.economy.removalRefundRate)
      const block = unapply(blockId, refund)
      if (!block) return false
      set((s) => ({ undoStack: [...s.undoStack, { op: 'remove', block, amount: refund }], redoStack: [] }))
      return true
    },
    blockOfItem: (itemId) => get().blocks.find((b) => b.items.some((i) => i.id === itemId)) ?? null,
    demolishItem: (itemId) => {
      const item = get().placedItems.find((i) => i.id === itemId)
      if (!item || get().blockOfItem(itemId)) return false
      const entry: HistoryEntry = { op: 'demolishItem', item, amount: LEVEL.economy.existingRemoval.itemCost }
      if (!run(entry)) return false
      set((s) => ({ undoStack: [...s.undoStack, entry], redoStack: [] }))
      return true
    },
    demolishFacility: (facilityId) => {
      const facility = get().facilities.find((f) => f.id === facilityId)
      if (!facility || get().blocks.some((b) => b.facility?.id === facilityId)) return false
      // Its fixtures (hoops) and anything else standing on the surface go with it.
      const ring = facilityRing(facility)
      const items = get().placedItems.filter((it) => !get().blockOfItem(it.id) && pointInRing([it.position[0], it.position[2]], ring))
      const entry: HistoryEntry = { op: 'demolishFacility', facility, items, amount: LEVEL.economy.existingRemoval.facilityCost }
      if (!run(entry)) return false
      set((s) => ({ undoStack: [...s.undoStack, entry], redoStack: [] }))
      return true
    },
    undo: () => {
      const entry = get().undoStack.at(-1)
      if (!entry || !revert(entry)) return false
      set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, entry] }))
      return true
    },
    redo: () => {
      const entry = get().redoStack.at(-1)
      if (!entry || !run(entry)) return false
      set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, entry] }))
      return true
    },
    startUsingFacility: (id) => set((s) => ({ facilitiesInUse: { ...s.facilitiesInUse, [id]: (s.facilitiesInUse[id] ?? 0) + 1 } })),
    stopUsingFacility: (id) =>
      set((s) => {
        const n = (s.facilitiesInUse[id] ?? 0) - 1
        const next = { ...s.facilitiesInUse }
        if (n > 0) next[id] = n
        else delete next[id]
        return { facilitiesInUse: next }
      }),
    setRunning: (running) => set((s) => ({ simulation: { ...s.simulation, running } })),
    reset: () => {
      set(initialState())
      grid?.rebuild([])
    },
  }
})
