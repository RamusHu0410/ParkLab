/** Park boundary and features (FeatureCollection, WGS84 lon/lat). Built by scripts/build-park-geojson.mjs. */
export const PARK_MAP_URL = '/maps/wismer-park.geojson'

/** Value of PARK_NAME for the City of Markham features that make up the playable park. */
export const PARK_NAME = 'Wismer Park'

/** OpenFreeMap basemap (OpenStreetMap vector tiles, OpenMapTiles schema). */
export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

/**
 * Start view, chosen by the user: the whole park visible from the south over Bur Oak Ave.
 * Its zoom is also the furthest the player can zoom out (CAMERA_LIMITS.minZoom).
 */
export const INITIAL_CAMERA = {
  center: [-79.2789, 43.89588] as [number, number],
  zoom: 16.1,
  pitch: 50,
  bearing: -15,
} as const

export const CAMERA_LIMITS = {
  minZoom: INITIAL_CAMERA.zoom,
  maxZoom: 20,
  maxPitch: 70,
  // Panning range is limited by geography/cameraBounds.ts (camera centre clamp).
}
