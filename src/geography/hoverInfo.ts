import type { Map as MapLibreMap, MapGeoJSONFeature, PointLike } from 'maplibre-gl'
import { CATEGORY_STYLE, INTERACTIVE_LAYER_IDS, type ParkCategory } from './parkLayers'

/** Basemap (OpenFreeMap Liberty) layers that can be hovered. */
const BASEMAP_POI_LAYERS = ['poi_r20', 'poi_r7', 'poi_r1', 'poi_transit']
const BASEMAP_BUILDING_LAYERS = ['building-3d', 'building']

const escapeHtml = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

function pointInRing([x, y]: number[], ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function polygonsOf(f: MapGeoJSONFeature): number[][][] {
  const g = f.geometry
  if (g.type === 'Polygon') return [g.coordinates[0]]
  if (g.type === 'MultiPolygon') return g.coordinates.map((p) => p[0])
  return []
}

function describePark(f: MapGeoJSONFeature): string {
  const p = f.properties
  const rows = [`<strong>${escapeHtml(CATEGORY_STYLE[p.category as ParkCategory]?.label ?? p.category)}</strong>`]
  if (p.PARK_NAME && p.USE_TYPE) rows.push(`${escapeHtml(p.PARK_NAME)} · ${escapeHtml(p.USE_TYPE)}`)
  if (p.Shape__Area) rows.push(`Area: ${Math.round(p.Shape__Area).toLocaleString()} m²`)
  if (p['osm:sport']) rows.push(`Sport: ${escapeHtml(p['osm:sport'])}`)
  if (p['osm:surface']) rows.push(`Surface: ${escapeHtml(p['osm:surface'])}`)
  if (p['osm:access']) rows.push(`Access: ${escapeHtml(p['osm:access'])}`)
  rows.push(`<em>${p.verification === 'official' ? 'Official: City of Markham' : 'OpenStreetMap (community-mapped, unverified)'}</em>`)
  return rows.join('<br/>')
}

function describePoi(f: MapGeoJSONFeature): string {
  const p = f.properties
  const kind = titleCase(p.subclass || p.class || 'Place')
  return [`<strong>${escapeHtml(p.name || kind)}</strong>`, p.name ? escapeHtml(kind) : null, '<em>OpenStreetMap</em>']
    .filter(Boolean)
    .join('<br/>')
}

function describeBuilding(map: MapLibreMap, building: MapGeoJSONFeature): string {
  // OpenMapTiles buildings carry no name, so look for a named POI inside the footprint.
  const rings = polygonsOf(building)
  const poi = map
    .queryRenderedFeatures({ layers: BASEMAP_POI_LAYERS.filter((l) => map.getLayer(l)) })
    .find((p) => p.geometry.type === 'Point' && rings.some((r) => pointInRing(p.geometry.coordinates as number[], r)))
  const h = building.properties.render_height
  const rows = [`<strong>${escapeHtml(poi?.properties.name || 'Building')}</strong>`]
  if (poi?.properties.name) rows.push(escapeHtml(titleCase(poi.properties.subclass || poi.properties.class || 'Building')))
  if (h) rows.push(`Height: ~${Math.round(h)} m${building.properties.hide_3d ? '' : ''}`)
  rows.push('<em>OpenStreetMap</em>')
  return rows.join('<br/>')
}

/**
 * HTML for whatever is under the cursor, in priority order:
 * map icons (POIs) > buildings > park facilities and areas. Null if nothing hoverable.
 */
export function hoverInfoAt(map: MapLibreMap, point: PointLike): string | null {
  const existing = (ids: string[]) => ids.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none')

  const [poi] = map.queryRenderedFeatures(point, { layers: existing(BASEMAP_POI_LAYERS) })
  if (poi) return describePoi(poi)

  const [building] = map.queryRenderedFeatures(point, { layers: existing(BASEMAP_BUILDING_LAYERS) })
  if (building) return describeBuilding(map, building)

  const [park] = map.queryRenderedFeatures(point, { layers: existing(INTERACTIVE_LAYER_IDS) })
  if (park) return describePark(park)

  return null
}
