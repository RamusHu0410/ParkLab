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

/** Intro: the camera opens over the park origin… */
export const INTRO_START = {
  center: [-79.27993, 43.89937] as [number, number],
  zoom: 16.5,
  pitch: 50,
  bearing: -15,
} as const
/** …then flies east over the park (local x 124.6 m, z 15.7 m)… */
export const INTRO_END = {
  center: [-79.27825, 43.89958] as [number, number],
  zoom: 17.7,
  pitch: 50,
  bearing: 78,
} as const
/** …and ends looking south over the park centre (local x 19.1 m, z -45.7 m). */
export const INTRO_FINAL = {
  center: [-79.27973, 43.89982] as [number, number],
  zoom: 16.3,
  pitch: 50,
  bearing: 167,
} as const
/** Duration of each intro flight leg (ms). */
export const INTRO_FLIGHT_MS = 5000
