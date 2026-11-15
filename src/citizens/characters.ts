import { CHARACTER_SCALE } from '../construction/catalog'
import type { PlacedItem } from '../construction/types'
import type { ParkGeometry } from '../geography/parkGeometry'
import type { CitizenSpec } from '../scene/three/ParkWorld'
import { polylineLength } from '../utils/geometry2d'

/**
 * Ground speed (m/s) that matches each model's Walk clip at scale 1 and normal
 * playback. Measured from the clip: a planted foot slides back 0.411 m (child
 * 0.267 m) during the 57% of the 1 s cycle it is on the ground.
 */
export const WALK_STRIDE_SPEED: Record<string, number> = {
  Person_Man_Blue: 0.721,
  Person_Woman_Pink: 0.721,
  Person_Worker_Yellow: 0.721,
  Person_Basketball_Blue: 0.721,
  Person_Basketball_Orange: 0.721,
  Person_Child_Orange: 0.468,
}

/** Walk clip playback speed. 1.3× gives adults ~1.0 m/s, a relaxed park stroll. */
const WALK_TIME_SCALE = 1.3

export function walkingCitizen(id: string, assetId: string, route: [number, number][]): CitizenSpec {
  const scale = CHARACTER_SCALE[assetId] ?? 1
  return { id, assetId, scale, clip: 'Walk', route, timeScale: WALK_TIME_SCALE, speed: WALK_STRIDE_SPEED[assetId] * scale * WALK_TIME_SCALE }
}

export function idleCitizen(id: string, assetId: string, position: [number, number], yaw: number): CitizenSpec {
  return { id, assetId, scale: CHARACTER_SCALE[assetId] ?? 1, clip: 'Idle', position, yaw }
}

/**
 * A few citizens to check the character assets in the real park: walkers on the
 * three longest paths and people standing in front of benches. Basketball
 * players are not used yet (their Dribble/Shoot clips are reserved for later).
 */
export function demoCitizens(geo: ParkGeometry, items: PlacedItem[]): CitizenSpec[] {
  const longest = [...geo.paths].sort((a, b) => polylineLength(b) - polylineLength(a)).slice(0, 3)
  const walkers = ['Person_Woman_Pink', 'Person_Man_Blue', 'Person_Child_Orange']
  const specs = longest.map((route, i) => walkingCitizen(`walker-${i}`, walkers[i], route))

  const benches = items.filter((i) => i.assetId === 'park_bench').slice(0, 2)
  const standers = ['Person_Worker_Yellow', 'Person_Woman_Pink']
  benches.forEach((b, i) => {
    // 1.2 m in front of the bench, looking the same way as the seat.
    const fx = Math.sin(b.rotationY)
    const fz = Math.cos(b.rotationY)
    specs.push(idleCitizen(`idle-${i}`, standers[i], [b.position[0] + fx * 1.2, b.position[2] + fz * 1.2], b.rotationY))
  })
  return specs
}
