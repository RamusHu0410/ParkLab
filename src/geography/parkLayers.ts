import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl'

export const PARK_SOURCE_ID = 'wismer-park'
/** Facilities added by design (not in the real park). */
export const PROPOSED_SOURCE_ID = 'proposed-facilities'
export const LOCAL_GRID_SOURCE_ID = 'local-grid'

/** Feature categories written by scripts/build-park-geojson.mjs, with the labels used in hover tooltips. */
export const CATEGORY_STYLE = {
  park_outer_boundary: { label: 'Wismer Park' },
  park_area: { label: 'Park lawn' },
  woodlot: { label: 'Woodlot' },
  valley: { label: 'Stream valley' },
  adjacent_school: { label: 'Adjacent school site' },
  wood: { label: 'Woods' },
  playground: { label: 'Playground' },
  sports_field: { label: 'Soccer field' },
  tennis_court: { label: 'Tennis court' },
  basketball_court: { label: 'Basketball court' },
  parking: { label: 'Parking' },
  water: { label: 'Water' },
  stream: { label: 'Stream' },
  stream_culvert: { label: 'Stream (underground culvert)' },
  path: { label: 'Path' },
  service_road: { label: 'Service road' },
  fence: { label: 'Fence' },
  ice_rink: { label: 'Synthetic ice rink' },
  multi_sport_court: { label: 'Multi-purpose sports court' },
} as const

export type ParkCategory = keyof typeof CATEGORY_STYLE

/** Cute pastel palette for the map surfaces. */
export const SURFACE = {
  lawn: '#b5e08f',
  woodlotFloor: '#a3d67e',
  valleyFloor: '#a9dba0',
  soccer: '#9dd96b',
  soccerLines: '#ffffff',
  tennis: '#6cc4b4',
  basketball: '#f2a26b',
  playground: '#ffd9a0',
  parking: '#dcdde6',
  path: '#f4dfb4',
  pathEdge: '#dcb77c',
  serviceRoad: '#e8e4dc',
  stream: '#7ccbf2',
  boundary: '#7cc06a',
} as const

const cat = (...c: ParkCategory[]): ExpressionSpecification => ['match', ['get', 'category'], c, true, false]
const polygon: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon']
/** Real-world width in metres → line width in pixels at each zoom (≈0.107 m/px at z20, halving per zoom level). */
const metres = (m: number): ExpressionSpecification => ['interpolate', ['exponential', 2], ['zoom'], 14, Math.max(0.5, m / 6.8), 20, m / 0.107]
/** Same, with a different width per category ({ category: metres }, plus a default). */
const metresByCategory = (widths: Record<string, number>, fallback: number): ExpressionSpecification => {
  const at = (div: number) => ['match', ['get', 'category'], ...Object.entries(widths).flatMap(([k, m]) => [k, Math.max(0.5, m / div)]), Math.max(0.5, fallback / div)]
  return ['interpolate', ['exponential', 2], ['zoom'], 14, at(6.8), 20, at(0.107)] as unknown as ExpressionSpecification
}

/** Ground surfaces; inserted below the basemap's roads. */
export const PARK_FILL_LAYERS: LayerSpecification[] = [
  {
    id: 'park-ground',
    type: 'fill',
    source: PARK_SOURCE_ID,
    filter: cat('park_outer_boundary'),
    paint: { 'fill-color': SURFACE.lawn, 'fill-antialias': true },
  },
  {
    id: 'park-zones',
    type: 'fill',
    source: PARK_SOURCE_ID,
    filter: cat('woodlot', 'valley'),
    paint: { 'fill-color': ['match', ['get', 'category'], 'woodlot', SURFACE.woodlotFloor, SURFACE.valleyFloor] },
  },
  {
    id: 'park-facilities',
    type: 'fill',
    source: PARK_SOURCE_ID,
    filter: ['all', polygon, cat('playground', 'sports_field', 'tennis_court', 'basketball_court', 'parking')],
    paint: {
      'fill-color': [
        'match',
        ['get', 'category'],
        'playground', SURFACE.playground,
        'sports_field', SURFACE.soccer,
        'tennis_court', SURFACE.tennis,
        'basketball_court', SURFACE.basketball,
        SURFACE.parking,
      ],
    },
  },
]

/** Footprints of proposed facilities: base colour under the 3D surfaces, and hover target. The rink is rounded, so its square footprint stays lawn-coloured. */
export const PROPOSED_FILL_LAYER: LayerSpecification = {
  id: 'proposed-facilities',
  type: 'fill',
  source: PROPOSED_SOURCE_ID,
  paint: {
    'fill-color': ['match', ['get', 'category'], 'basketball_court', SURFACE.basketball, 'sports_field', SURFACE.soccer, 'ice_rink', SURFACE.lawn, '#3c9d9b'],
  },
}

/** Lines; inserted above roads, below 3D buildings and labels. */
export const PARK_LINE_LAYERS: LayerSpecification[] = [
  {
    id: 'park-facility-lines',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: ['all', polygon, cat('sports_field', 'tennis_court', 'basketball_court', 'playground', 'parking')],
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'category'], 'playground', '#f3b867', '#ffffff'],
      'line-width': metresByCategory({ playground: 0.6 }, 0.15),
      'line-opacity': 0.95,
    },
  },
  {
    id: 'park-streams',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: cat('stream'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': SURFACE.stream, 'line-width': metres(2.5) },
  },
  {
    id: 'park-path-edges',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: cat('path', 'service_road'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': SURFACE.pathEdge, 'line-width': metresByCategory({ service_road: 5 }, 2.8) },
  },
  {
    id: 'park-paths',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: cat('path', 'service_road'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'category'], 'service_road', SURFACE.serviceRoad, SURFACE.path],
      'line-width': metresByCategory({ service_road: 4.2 }, 2.2),
    },
  },
]

/** Soft green park outline. */
export const PARK_BOUNDARY_LAYERS: LayerSpecification[] = [
  {
    id: 'park-boundary',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: cat('park_outer_boundary'),
    layout: { 'line-join': 'round' },
    paint: { 'line-color': SURFACE.boundary, 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 2, 20, 5] },
  },
]

export const LOCAL_GRID_LAYERS: LayerSpecification[] = [
  {
    id: 'local-grid-lines',
    type: 'line',
    source: LOCAL_GRID_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: {
      'line-color': ['case', ['get', 'axis'], '#d6336c', '#495057'],
      'line-width': ['case', ['get', 'axis'], 2, 0.8],
      'line-opacity': 0.7,
    },
  },
  {
    id: 'local-grid-origin',
    type: 'circle',
    source: LOCAL_GRID_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 6, 'circle-color': '#d6336c', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
  },
]

/** Layers whose features show a hover tooltip, most specific first. */
export const INTERACTIVE_LAYER_IDS = ['proposed-facilities', 'park-facilities', 'park-streams', 'park-paths', 'park-zones', 'park-ground']

/** Basemap symbol layers replaced by floating landmark icons. */
export const BASEMAP_POI_LAYERS = ['poi_r20', 'poi_r7', 'poi_r1', 'poi_transit']

/**
 * Surrounding (basemap) buildings: plain white and see-through, so the city
 * stays as context and the park is what draws the eye.
 */
export const BUILDING_STYLE = { color: '#ffffff', opacity: 0.55 } as const
