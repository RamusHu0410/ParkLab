import { create } from 'zustand'
import type { ConstructionTool, PlacedItem } from '../construction/types'
import type { CitizenRequest } from '../citizens/types'
import type { SimulationState } from '../simulation/types'

export const STARTING_BUDGET = 50_000

export interface ParkState {
  budget: number
  placedItems: PlacedItem[]
  tool: ConstructionTool
  /** Asset id chosen for the 'place' tool. */
  selectedAssetId: string | null
  selectedItemId: string | null
  requests: CitizenRequest[]
  simulation: SimulationState

  setTool: (tool: ConstructionTool) => void
  selectAsset: (assetId: string | null) => void
  selectItem: (itemId: string | null) => void
  /** Adds an item and returns its generated id. */
  addItem: (item: Omit<PlacedItem, 'id'>) => string
  removeItem: (itemId: string) => void
  spend: (amount: number) => boolean
  setRunning: (running: boolean) => void
  reset: () => void
}

let nextId = 1
const newItemId = () => `item-${nextId++}`

const initialState = () => ({
  budget: STARTING_BUDGET,
  placedItems: [] as PlacedItem[],
  tool: 'select' as ConstructionTool,
  selectedAssetId: null,
  selectedItemId: null,
  requests: [] as CitizenRequest[],
  simulation: { running: false, day: 1, satisfaction: 50 },
})

export const useParkStore = create<ParkState>()((set, get) => ({
  ...initialState(),

  setTool: (tool) => set({ tool }),
  selectAsset: (selectedAssetId) => set({ selectedAssetId }),
  selectItem: (selectedItemId) => set({ selectedItemId }),

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

  setRunning: (running) => set((s) => ({ simulation: { ...s.simulation, running } })),

  reset: () => set(initialState()),
}))
