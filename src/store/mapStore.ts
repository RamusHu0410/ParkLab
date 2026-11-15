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
  showIcons: boolean
  resetView: () => void
  /** Turns the camera by `deg` degrees (positive = clockwise). */
  rotateBy: (deg: number) => void

  setStatus: (status: MapStatus, error?: string) => void
  setCamera: (camera: MapCamera) => void
  toggleLocalGrid: () => void
  toggle3dBuildings: () => void
  toggleIcons: () => void
  setResetView: (fn: () => void) => void
  setRotateBy: (fn: (deg: number) => void) => void
}

export const useMapStore = create<MapState>()((set) => ({
  status: 'idle',
  error: null,
  camera: null,
  showLocalGrid: false,
  show3dBuildings: true,
  showIcons: true,
  resetView: () => {},
  rotateBy: () => {},

  setStatus: (status, error) => set({ status, error: error ?? null }),
  setCamera: (camera) => set({ camera }),
  toggleLocalGrid: () => set((s) => ({ showLocalGrid: !s.showLocalGrid })),
  toggle3dBuildings: () => set((s) => ({ show3dBuildings: !s.show3dBuildings })),
  toggleIcons: () => set((s) => ({ showIcons: !s.showIcons })),
  setResetView: (resetView) => set({ resetView }),
  setRotateBy: (rotateBy) => set({ rotateBy }),
}))
