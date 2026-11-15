import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl'

export const BLOCKS_SOURCE_ID = 'construction-blocks'
export const PREVIEW_SOURCE_ID = 'construction-preview'
export const HIGHLIGHT_LAYER_ID = 'construction-highlight'

/** Width in metres from the feature's `w` property → line width in pixels (≈0.107 m/px at z20, halving per zoom). */
const metresProp = (extra = 0): ExpressionSpecification => [
  'interpolate',
  ['exponential', 2],
  ['zoom'],
  14,
  ['max', 0.5, ['/', ['+', ['get', 'w'], extra], 6.8]],
  20,
  ['/', ['+', ['get', 'w'], extra], 0.107],
]
const isPolygon: ExpressionSpecification = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false]
const isLine: ExpressionSpecification = ['==', ['geometry-type'], 'LineString']
/** Preview colour by placement state: ok, warn (breaks a siting rule but can be built) or bad. */
const byState = (ok: string, warn: string, bad: string): ExpressionSpecification => ['match', ['get', 'state'], 'ok', ok, 'warn', warn, bad]
const kind = (k: string): ExpressionSpecification => ['==', ['get', 'kind'], k]

/** Built blocks; inserted below the basemap roads, above the park surfaces. */
export const BLOCK_LAYERS: LayerSpecification[] = [
  { id: 'construction-areas', type: 'fill', source: BLOCKS_SOURCE_ID, filter: kind('area'), paint: { 'fill-color': ['get', 'color'], 'fill-outline-color': ['get', 'color'] } },
  { id: 'construction-facilities', type: 'fill', source: BLOCKS_SOURCE_ID, filter: kind('facility'), paint: { 'fill-color': ['get', 'color'] } },
  {
    id: 'construction-path-edges',
    type: 'line',
    source: BLOCKS_SOURCE_ID,
    filter: kind('path'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'edge'], 'line-width': metresProp(0.6) },
  },
  {
    id: 'construction-paths',
    type: 'line',
    source: BLOCKS_SOURCE_ID,
    filter: kind('path'),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': metresProp() },
  },
]

/** Preview and selection; drawn above the 3D objects so they stay visible. */
export const PREVIEW_LAYERS: LayerSpecification[] = [
  {
    id: HIGHLIGHT_LAYER_ID,
    type: 'line',
    source: BLOCKS_SOURCE_ID,
    filter: ['==', ['get', 'id'], ''],
    paint: { 'line-color': '#e53935', 'line-width': 3, 'line-opacity': 0.9 },
  },
  {
    id: 'construction-preview-fill',
    type: 'fill',
    source: PREVIEW_SOURCE_ID,
    filter: isPolygon,
    paint: { 'fill-color': byState('#2e7d32', '#f9a825', '#d32f2f'), 'fill-opacity': 0.4 },
  },
  {
    id: 'construction-preview-outline',
    type: 'line',
    source: PREVIEW_SOURCE_ID,
    filter: isPolygon,
    paint: { 'line-color': byState('#1b5e20', '#e65100', '#b71c1c'), 'line-width': 2 },
  },
  {
    id: 'construction-preview-line',
    type: 'line',
    source: PREVIEW_SOURCE_ID,
    filter: isLine,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': byState('#2e7d32', '#f9a825', '#d32f2f'), 'line-opacity': 0.5, 'line-width': metresProp() },
  },
  {
    id: 'construction-preview-points',
    type: 'circle',
    source: PREVIEW_SOURCE_ID,
    filter: ['==', ['geometry-type'], 'Point'],
    // Polygon corners are white; items a placement would remove are red; the object picked for removal gets a red ring.
    paint: {
      'circle-radius': ['case', ['has', 'target'], 10, 4],
      'circle-color': ['case', ['has', 'displaced'], '#d32f2f', ['has', 'target'], 'rgba(229,57,53,0.25)', '#ffffff'],
      'circle-stroke-color': ['case', ['has', 'displaced'], '#ffffff', ['has', 'target'], '#e53935', '#1b5e20'],
      'circle-stroke-width': ['case', ['has', 'target'], 3, 2],
    },
  },
]
