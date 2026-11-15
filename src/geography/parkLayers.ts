import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl'

export const PARK_SOURCE_ID = 'wismer-park'
export const LOCAL_GRID_SOURCE_ID = 'local-grid'

/** Feature categories written by scripts/build-park-geojson.mjs, with display info for the legend. */
export const CATEGORY_STYLE = {
  park_outer_boundary: { label: 'Park boundary (City of Markham)', color: '#0f6b2f' },
  park_area: { label: 'Park (City of Markham)', color: '#9fd18b' },
  woodlot: { label: 'Woodlot (City of Markham)', color: '#3f7f3a' },
  valley: { label: 'Valley (City of Markham)', color: '#6fa58f' },
  adjacent_school: { label: 'Adjacent school site', color: '#9aa0a6' },
  wood: { label: 'Wood (OSM)', color: '#4c8c46' },
  playground: { label: 'Playground (OSM)', color: '#f2a03d' },
  sports_field: { label: 'Soccer field (OSM)', color: '#c9e27a' },
  tennis_court: { label: 'Tennis court (OSM)', color: '#4aa3a2' },
  basketball_court: { label: 'Basketball court (OSM)', color: '#d1663f' },
  parking: { label: 'Parking (OSM)', color: '#b7b7c2' },
  water: { label: 'Water (OSM)', color: '#5aa9e6' },
  stream: { label: 'Stream (OSM)', color: '#2f86d6' },
  stream_culvert: { label: 'Stream in culvert (OSM)', color: '#2f86d6' },
  path: { label: 'Path (OSM)', color: '#8a5a2b' },
  service_road: { label: 'Service road (OSM)', color: '#777777' },
  fence: { label: 'Fence (OSM)', color: '#5b5b5b' },
} as const

export type ParkCategory = keyof typeof CATEGORY_STYLE

const cat = (...c: ParkCategory[]): ExpressionSpecification => ['match', ['get', 'category'], c, true, false]

const colorByCategory: ExpressionSpecification = [
  'match',
  ['get', 'category'],
  ...Object.entries(CATEGORY_STYLE).flatMap(([k, v]) => [k, v.color]),
  '#ff00ff',
] as unknown as ExpressionSpecification

const isParkPart: ExpressionSpecification = ['all', ['==', ['get', 'PARK_NAME'], 'Wismer Park'], ['has', 'USE_TYPE']]
const isParkOuter: ExpressionSpecification = ['==', ['get', 'category'], 'park_outer_boundary']

/** Polygon fills; inserted below the basemap's roads. */
export const PARK_FILL_LAYERS: LayerSpecification[] = [
  {
    id: 'park-official-fill',
    type: 'fill',
    source: PARK_SOURCE_ID,
    filter: cat('park_area', 'woodlot', 'valley', 'adjacent_school'),
    paint: { 'fill-color': colorByCategory, 'fill-opacity': ['match', ['get', 'category'], 'adjacent_school', 0.12, 0.45] },
  },
  {
    id: 'park-osm-fill',
    type: 'fill',
    source: PARK_SOURCE_ID,
    filter: ['all', ['==', ['geometry-type'], 'Polygon'], cat('wood', 'playground', 'sports_field', 'tennis_court', 'basketball_court', 'parking', 'water')],
    paint: { 'fill-color': colorByCategory, 'fill-opacity': ['match', ['get', 'category'], 'wood', 0.25, 0.85] },
  },
]

/** Lines and outlines; inserted above roads, below 3D buildings and labels. */
export const PARK_LINE_LAYERS: LayerSpecification[] = [
  {
    id: 'park-osm-facility-outline',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: ['all', ['==', ['geometry-type'], 'Polygon'], cat('playground', 'sports_field', 'tennis_court', 'basketball_court', 'parking')],
    paint: { 'line-color': '#ffffff', 'line-width': 1.2 },
  },
  {
    id: 'park-streams',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: cat('stream'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': colorByCategory, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.5, 19, 5] },
  },
  {
    id: 'park-culverts',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: cat('stream_culvert'),
    paint: { 'line-color': colorByCategory, 'line-width': 2, 'line-dasharray': [1, 1.5], 'line-opacity': 0.7 },
  },
  {
    id: 'park-paths',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: cat('path', 'service_road'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': colorByCategory,
      'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 19, 4],
      'line-dasharray': ['literal', [2, 1]],
    },
  },
  {
    id: 'park-fences',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: cat('fence'),
    paint: { 'line-color': colorByCategory, 'line-width': 1.5 },
  },
  {
    id: 'park-official-subdivisions',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: isParkPart,
    paint: { 'line-color': '#1f5f1f', 'line-width': 1.2, 'line-dasharray': [3, 2], 'line-opacity': 0.8 },
  },
  {
    id: 'park-school-outline',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: cat('adjacent_school'),
    paint: { 'line-color': '#6b7075', 'line-width': 1.5, 'line-dasharray': [2, 2] },
  },
]

/** Outer park boundary, dissolved from the three Markham polygons by the build script. */
export const PARK_BOUNDARY_LAYERS: LayerSpecification[] = [
  {
    id: 'park-boundary-halo',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: isParkOuter,
    paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.8 },
  },
  {
    id: 'park-boundary',
    type: 'line',
    source: PARK_SOURCE_ID,
    filter: isParkOuter,
    paint: { 'line-color': '#0f6b2f', 'line-width': 3.5 },
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

/** Layers that open a feature-info popup on click. */
export const INTERACTIVE_LAYER_IDS = ['park-osm-fill', 'park-streams', 'park-paths', 'park-official-fill']
