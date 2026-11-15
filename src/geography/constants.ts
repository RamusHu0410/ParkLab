import { PARK_ORIGIN_LNGLAT } from './projection'

/** Park boundary and features (FeatureCollection, WGS84 lon/lat). Built by scripts/build-park-geojson.mjs. */
export const PARK_MAP_URL = '/maps/wismer-park.geojson'

/** Value of PARK_NAME for the City of Markham features that make up the playable park. */
export const PARK_NAME = 'Wismer Park'

/** OpenFreeMap basemap (OpenStreetMap vector tiles, OpenMapTiles schema). */
export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

export const INITIAL_CAMERA = {
  center: PARK_ORIGIN_LNGLAT,
  zoom: 16,
  pitch: 50,
  bearing: -15,
} as const

export const CAMERA_LIMITS = {
  minZoom: 13,
  maxZoom: 20,
  maxPitch: 70,
  /** Keeps the camera within ~4 km of the park. [west, south], [east, north] */
  maxBounds: [
    [-79.33, 43.865],
    [-79.23, 43.935],
  ] as [[number, number], [number, number]],
}
