import type { Map as MapLibreMap } from 'maplibre-gl'
import type { ParkGeometry } from '../geography/parkGeometry'
import { localToLngLat } from '../geography/projection'
import type { ParkWorld } from '../scene/three/ParkWorld'
import { buildSnapshot, co2UptakeTonnes, landUse, type ParkSnapshot, pathNextToTraffic } from '../simulation/parkMetrics'
import { type ParkMeters, useCitizenStore } from '../store/citizenStore'
import { getConstructionGrid, useParkStore } from '../store/parkStore'
import { CitizenSim } from './citizenSim'
import { type Baseline, evaluateRequests, makeBaseline, type RequestResult } from './requests'

/** Park changes are batched: requests are re-checked this long after the last edit (ms). */
const REEVALUATE_DELAY_MS = 250
/** How often citizen positions/activities are copied to the panel (ms). */
const STATUS_INTERVAL_MS = 500

/**
 * Starts the citizen simulation and request checks for the loaded park.
 * Returns a function that stops it.
 */
export function runCitizens(map: MapLibreMap, world: ParkWorld, geo: ParkGeometry): () => void {
  const store = useCitizenStore.getState()
  const sim = new CitizenSim({
    addAgent: (id, assetId, scale, tint) => world.addAgent(id, assetId, scale, tint),
    setAgent: (id, x, z, yaw, clip, timeScale) => world.setAgent(id, x, z, yaw, clip, timeScale),
    startUsingFacility: (id) => useParkStore.getState().startUsingFacility(id),
    stopUsingFacility: (id) => useParkStore.getState().stopUsingFacility(id),
  })
  let baseline: Baseline | null = null

  const snapshot = (): ParkSnapshot => {
    const s = useParkStore.getState()
    return buildSnapshot(geo, s.placedItems, s.facilities, s.blocks, getConstructionGrid()?.ownedCells())
  }
  const evaluate = () => {
    const snap = snapshot()
    // "Unused land removed" compares with the park as it was when the level started.
    baseline ??= makeBaseline(snap)
    sim.setSnapshot(snap)
    const requests = evaluateRequests(snap, baseline)
    store.setRequests(requests)
    store.setMeters(parkMeters(snap, requests))
  }
  evaluate()

  let timer: number | undefined
  const unsubscribe = useParkStore.subscribe((s, prev) => {
    if (s.placedItems === prev.placedItems && s.facilities === prev.facilities && s.blocks === prev.blocks && s.gridVersion === prev.gridVersion) return
    useCitizenStore.getState().setEvaluating(true)
    window.clearTimeout(timer)
    timer = window.setTimeout(evaluate, REEVALUATE_DELAY_MS)
  })

  const prevBefore = world.beforeUpdate
  world.beforeUpdate = (dt) => {
    prevBefore(dt)
    sim.update(dt)
  }
  const statusTimer = window.setInterval(() => store.setCitizens(sim.statuses), STATUS_INTERVAL_MS)
  store.setCitizens(sim.statuses)

  store.setFocusCitizen((id) => {
    const p = sim.positionOf(id)
    if (p) map.flyTo({ center: localToLngLat([p[0], 0, p[1]]), zoom: Math.max(map.getZoom(), 19), duration: 1200 })
  })

  if (import.meta.env.DEV) Object.assign(window, { citizenSim: sim, parkSnapshot: snapshot })

  return () => {
    window.clearTimeout(timer)
    window.clearInterval(statusTimer)
    unsubscribe()
    world.beforeUpdate = prevBefore
    sim.dispose()
  }
}

/** Park-wide figures for the meters panel. */
function parkMeters(snap: ParkSnapshot, requests: RequestResult[]): ParkMeters {
  const land = landUse(snap)
  const traffic = pathNextToTraffic(snap)
  return {
    happiness: requests.length ? requests.reduce((a, r) => a + r.happiness, 0) / requests.length : 0,
    greenShare: land.parkM2 ? land.greenM2 / land.parkM2 : 0,
    co2TonnesPerYear: co2UptakeTonnes(snap),
    safeShare: traffic.totalM ? 1 - traffic.unsafeM / traffic.totalM : 1,
  }
}
