import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl'
import type { FloatingMarker } from '../scene/markerOverlay'
import { pointInRing } from '../utils/geometry2d'
import { CAMERA_CENTER_BOUNDS_LOCAL } from './cameraBounds'
import { lngLatToLocal } from './projection'

/** A named place inside a building, shown as a floating icon above the roof. */
export interface Landmark {
  key: string
  name: string
  kind: string
  icon: string
  lngLat: [number, number]
  /** Roof height of the building it sits in, metres. */
  roofHeight: number
  buildingId: string | number | undefined
}

const ICONS: Record<string, string> = {
  school: '🏫',
  kindergarten: '🧸',
  college: '🎓',
  place_of_worship: '⛪',
  hospital: '🏥',
  clinic: '🩺',
  dentist: '🦷',
  pharmacy: '💊',
  doctors: '🩺',
  library: '📚',
  post: '📮',
  fire_station: '🚒',
  police: '🚓',
  shop: '🛍️',
  grocery: '🛒',
  convenience: '🏪',
  supermarket: '🛒',
  bakery: '🥐',
  restaurant: '🍽️',
  fast_food: '🍔',
  cafe: '☕',
  ice_cream: '🍦',
  bank: '🏦',
  fuel: '⛽',
  community_centre: '🏛️',
  town_hall: '🏛️',
  sports_centre: '🏅',
  swimming_pool: '🏊',
}

/** Icons float this far above the roof, in metres. */
const FLOAT_ABOVE_ROOF_M = 7

export const landmarkToMarker = (l: Landmark): FloatingMarker => ({
  key: l.key,
  icon: l.icon,
  name: l.name,
  kind: l.kind,
  lngLat: l.lngLat,
  height: l.roofHeight + FLOAT_ABOVE_ROOF_M,
  buildingId: l.buildingId ?? undefined,
})

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

/** Building footprints don't carry names in OpenMapTiles; take them from the POI inside. */
export function collectLandmarks(map: MapLibreMap): Landmark[] {
  const pois = map.querySourceFeatures('openmaptiles', { sourceLayer: 'poi' })
  const buildings = map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' })
  const b = CAMERA_CENTER_BOUNDS_LOCAL
  // Building pieces are split across tiles; group them by id.
  const rings: { id: MapGeoJSONFeature['id']; ring: number[][]; h: number }[] = []
  for (const f of buildings) {
    const g = f.geometry
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    for (const p of polys) rings.push({ id: f.id, ring: p[0], h: Number(f.properties.render_height) || 0 })
  }

  const seen = new Map<string, Landmark>()
  for (const f of pois) {
    const name = f.properties.name as string | undefined
    if (!name || f.geometry.type !== 'Point') continue
    const lngLat = f.geometry.coordinates as [number, number]
    const [x, , z] = lngLatToLocal(lngLat)
    // Only within the area the camera can reach (plus a margin for the view's edges).
    if (x < b.minX - 400 || x > b.maxX + 400 || z < b.minZ - 400 || z > b.maxZ + 300) continue
    const host = rings.find((r) => pointInRing(lngLat, r.ring as [number, number][]))
    if (!host) continue
    const cls = String(f.properties.subclass || f.properties.class || '')
    const icon = ICONS[cls] ?? ICONS[String(f.properties.class)] ?? '📍'
    const key = `${name}|${host.id}`
    if (seen.has(key)) continue
    seen.set(key, { key, name, kind: titleCase(cls || 'place'), icon, lngLat, roofHeight: host.h, buildingId: host.id })
  }
  return [...seen.values()]
}
