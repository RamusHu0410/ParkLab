import type { Facility, FacilityKind } from '../construction/facilities'
import type { PlacedItem } from '../construction/types'
import type { ParkGeometry } from '../geography/parkGeometry'
import { localToLngLat } from '../geography/projection'
import { ringCentroid, type Vec2 } from '../utils/geometry2d'
import type { FloatingMarker } from './markerOverlay'

export const FACILITY_ICONS: Record<FacilityKind | 'playground' | 'parking' | 'picnic' | 'drinking_water', { icon: string; label: string }> = {
  basketball_court: { icon: '🏀', label: 'Basketball court' },
  soccer_field: { icon: '⚽', label: 'Soccer field' },
  tennis_court: { icon: '🎾', label: 'Tennis court' },
  ice_rink: { icon: '⛸️', label: 'Synthetic ice rink' },
  multi_sport_court: { icon: '🏟️', label: 'Multi-purpose sports court' },
  playground: { icon: '🛝', label: 'Playground' },
  parking: { icon: '🅿️', label: 'Parking' },
  picnic: { icon: '🧺', label: 'Gazebo & picnic area' },
  drinking_water: { icon: '🚰', label: 'Drinking fountain' },
}

const marker = (key: string, kind: keyof typeof FACILITY_ICONS, p: Vec2, height: number, name?: string): FloatingMarker => ({
  key,
  icon: FACILITY_ICONS[kind].icon,
  name: name ?? FACILITY_ICONS[kind].label,
  kind,
  lngLat: localToLngLat([p[0], 0, p[1]]),
  height,
  compact: true,
})

/**
 * Small icons over park facilities, shown only for facilities a citizen is using
 * (`inUse`, keyed by facility id) and never more than one per facility.
 * Keys: facility ids, `playground-<i>`, `parking-<i>`, and item ids for the gazebo and fountains.
 */
export function facilityMarkers(geo: ParkGeometry, facilities: Facility[], items: PlacedItem[], inUse: Record<string, number>): FloatingMarker[] {
  return allFacilityMarkers(geo, facilities, items).filter((m) => (inUse[m.key] ?? 0) > 0)
}

export function allFacilityMarkers(geo: ParkGeometry, facilities: Facility[], items: PlacedItem[]): FloatingMarker[] {
  const list: FloatingMarker[] = facilities.map((f) => marker(f.id, f.kind, f.center, f.kind === 'basketball_court' || f.kind === 'multi_sport_court' ? 6 : 5, f.name))
  geo.playgrounds.forEach((p, i) => list.push(marker(`playground-${i}`, 'playground', ringCentroid(p.ring), 5)))
  geo.parking.forEach((p, i) => list.push(marker(`parking-${i}`, 'parking', ringCentroid(p.ring), 4)))
  for (const it of items) {
    if (it.assetId === 'gazebo') list.push(marker(it.id, 'picnic', [it.position[0], it.position[2]], 7))
    if (it.assetId === 'drinking_fountain') list.push(marker(it.id, 'drinking_water', [it.position[0], it.position[2]], 3))
  }
  // One icon per facility.
  return [...new Map(list.map((m) => [m.key, m])).values()]
}
