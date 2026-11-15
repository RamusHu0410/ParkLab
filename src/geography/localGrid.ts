import type { FeatureCollection, LineString, Point } from 'geojson'
import { localToLngLat } from './projection'

/**
 * Debug overlay: a grid of local simulation metres (UTM 17N, park origin)
 * converted back to lon/lat. If the grid squares measure `spacing` metres
 * against the map's scale bar, local metres and the map agree.
 */
export function buildLocalGrid(halfExtent = 600, spacing = 100): FeatureCollection<LineString | Point> {
  const features: FeatureCollection<LineString | Point>['features'] = []
  const steps = Math.round((2 * halfExtent) / spacing)
  // Sample along each line so any projection curvature would show up.
  const samples = 12

  for (let i = 0; i <= steps; i++) {
    const v = -halfExtent + i * spacing
    const axis = v === 0
    const eastWest: [number, number][] = []
    const northSouth: [number, number][] = []
    for (let s = 0; s <= samples; s++) {
      const t = -halfExtent + (s * 2 * halfExtent) / samples
      eastWest.push(localToLngLat([t, 0, v]))
      northSouth.push(localToLngLat([v, 0, t]))
    }
    features.push({ type: 'Feature', properties: { axis, local: `z=${v}` }, geometry: { type: 'LineString', coordinates: eastWest } })
    features.push({ type: 'Feature', properties: { axis, local: `x=${v}` }, geometry: { type: 'LineString', coordinates: northSouth } })
  }
  features.push({ type: 'Feature', properties: { origin: true }, geometry: { type: 'Point', coordinates: localToLngLat([0, 0, 0]) } })
  return { type: 'FeatureCollection', features }
}
