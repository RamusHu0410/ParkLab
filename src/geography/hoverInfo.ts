import type { Map as MapLibreMap, MapGeoJSONFeature, PointLike } from 'maplibre-gl'
import type { FloatingMarker } from '../scene/markerOverlay'
import { CATEGORY_STYLE, INTERACTIVE_LAYER_IDS, type ParkCategory } from './parkLayers'

const BASEMAP_BUILDING_LAYERS = ['building-3d', 'building']

const escapeHtml = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function describePark(f: MapGeoJSONFeature): string {
  const p = f.properties
  const rows = [`<strong>${escapeHtml(CATEGORY_STYLE[p.category as ParkCategory]?.label ?? p.category)}</strong>`]
  if (p.PARK_NAME && p.USE_TYPE) rows.push(`${escapeHtml(p.PARK_NAME)} · ${escapeHtml(p.USE_TYPE)}`)
  if (p.Shape__Area) rows.push(`Area: ${Math.round(p.Shape__Area).toLocaleString()} m²`)
  if (p['osm:sport']) rows.push(`Sport: ${escapeHtml(p['osm:sport'])}`)
  if (p['osm:surface']) rows.push(`Surface: ${escapeHtml(p['osm:surface'])}`)
  if (p['osm:access']) rows.push(`Access: ${escapeHtml(p['osm:access'])}`)
  if (p.name) rows.splice(1, 0, escapeHtml(p.name))
  const source =
    p.verification === 'official' ? 'Official: City of Markham' : p.verification === 'proposed' ? 'Proposed addition (not in the real park)' : 'OpenStreetMap (community-mapped, unverified)'
  rows.push(`<em>${source}</em>`)
  return rows.join('<br/>')
}

function describeBuilding(building: MapGeoJSONFeature, landmark: FloatingMarker | undefined): string {
  const h = building.properties.render_height
  const rows = [`<strong>${escapeHtml(landmark ? `${landmark.icon} ${landmark.name}` : 'Building')}</strong>`]
  if (landmark) rows.push(escapeHtml(landmark.kind))
  if (h) rows.push(`Height: ~${Math.round(h)} m`)
  rows.push('<em>OpenStreetMap</em>')
  return rows.join('<br/>')
}

/**
 * HTML for whatever is under the cursor: buildings first, then park features.
 * `landmarkFor` finds the named place inside a building (from the floating icons).
 */
export function hoverInfoAt(map: MapLibreMap, point: PointLike, landmarkFor: (buildingId: MapGeoJSONFeature['id']) => FloatingMarker | undefined): string | null {
  const existing = (ids: string[]) => ids.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none')

  const [building] = map.queryRenderedFeatures(point, { layers: existing(BASEMAP_BUILDING_LAYERS) })
  if (building) return describeBuilding(building, landmarkFor(building.id))

  const hits = map.queryRenderedFeatures(point, { layers: existing(INTERACTIVE_LAYER_IDS) })
  // Most specific first: facilities, then streams/paths, then zones, then the park itself.
  const rank = (f: MapGeoJSONFeature) => INTERACTIVE_LAYER_IDS.indexOf(f.layer.id)
  const best = hits.sort((a, b) => rank(a) - rank(b))[0]
  return best ? describePark(best) : null
}
