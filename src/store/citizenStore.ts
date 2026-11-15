import { create } from 'zustand'
import type { CitizenStatus } from '../citizens/citizenSim'
import type { RequestResult } from '../citizens/requests'

/** Citizen simulation state for the UI. Updated a few times per second, not every frame. */
/** Park-wide figures shown on the meters panel. */
export interface ParkMeters {
  /** Mean happiness of the citizens' requests, 0–100. */
  happiness: number
  /** Share of the park that is green (lawn, woods, planted), 0–1. */
  greenShare: number
  co2TonnesPerYear: number
  /** Share of path length away from traffic, 0–1. */
  safeShare: number
}

interface CitizenState {
  requests: RequestResult[]
  meters: ParkMeters | null
  setMeters: (m: ParkMeters) => void
  citizens: CitizenStatus[]
  /** True while the requests are being re-checked after a park change. */
  evaluating: boolean
  /** Moves the camera to a citizen (set by the map). */
  focusCitizen: (id: string) => void
  /** Help mode: show each request's exact requirements and how they're measured. */
  helpOpen: boolean
  toggleHelp: () => void
  setRequests: (requests: RequestResult[]) => void
  setCitizens: (citizens: CitizenStatus[]) => void
  setEvaluating: (v: boolean) => void
  setFocusCitizen: (fn: (id: string) => void) => void
}

export const useCitizenStore = create<CitizenState>()((set) => ({
  requests: [],
  meters: null,
  setMeters: (meters) => set({ meters }),
  citizens: [],
  evaluating: false,
  focusCitizen: () => {},
  helpOpen: false,
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
  setRequests: (requests) => set({ requests, evaluating: false }),
  setCitizens: (citizens) => set({ citizens }),
  setEvaluating: (evaluating) => set({ evaluating }),
  setFocusCitizen: (focusCitizen) => set({ focusCitizen }),
}))
