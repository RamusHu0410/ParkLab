import { create } from 'zustand'
import type { Facility } from '../construction/facilities'
import type { ConstructionTool, PlacedItem } from '../construction/types'
import type { CitizenRequest } from '../citizens/types'
import type { SimulationState } from '../simulation/types'

export const STARTING_BUDGET = 50_000

export interface ParkState {
  budget: number
  placedItems: PlacedItem[]
  /** Courts, fields and rinks (existing OSM ones and proposed additions). */
  facilities: Facility[]
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
  startUsingFacility: (facilityId: string) => void
  stopUsingFacility: (facilityId: string) => void
  setRunning: (running: boolean) => void
  reset: () => void
}

let nextId = 1
const newItemId = () => `item-${nextId++}`

const initialState = () => ({
  budget: STARTING_BUDGET,
  placedItems: [] as PlacedItem[],
  facilities: [] as Facility[],
  tool: 'select' as ConstructionTool,
  selectedAssetId: null,
  selectedItemId: null,
  requests: [] as CitizenRequest[],
  facilitiesInUse: {} as Record<string, number>,
  simulation: { running: false, day: 1, satisfaction: 50 },
})

export const useParkStore = create<ParkState>()((set, get) => ({
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

  reset: () => set(initialState()),
}))
