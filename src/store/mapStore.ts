import { create } from 'zustand'

export interface MapCamera {
  lng: number
  lat: number
  zoom: number
  pitch: number
  bearing: number
}

export type MapStatus = 'idle' | 'loading' | 'ready' | 'error'

/** View state for the geographic map. Kept apart from ParkState, which holds simulation data. */
interface MapState {
  status: MapStatus
  error: string | null
  camera: MapCamera | null
  showLocalGrid: boolean
  show3dBuildings: boolean
  resetView: () => void

  setStatus: (status: MapStatus, error?: string) => void
  setCamera: (camera: MapCamera) => void
  toggleLocalGrid: () => void
  toggle3dBuildings: () => void
  setResetView: (fn: () => void) => void
}

export const useMapStore = create<MapState>()((set) => ({
  status: 'idle',
  error: null,
  camera: null,
  showLocalGrid: false,
  show3dBuildings: true,
  resetView: () => {},

  setStatus: (status, error) => set({ status, error: error ?? null }),
  setCamera: (camera) => set({ camera }),
  toggleLocalGrid: () => set((s) => ({ showLocalGrid: !s.showLocalGrid })),
  toggle3dBuildings: () => set((s) => ({ show3dBuildings: !s.show3dBuildings })),
  setResetView: (resetView) => set({ resetView }),
}))
