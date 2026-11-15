import proj4 from 'proj4'

/**
 * Coordinate systems
 * - Geographic data (GeoJSON, MapLibre): WGS84 lon/lat, EPSG:4326.
 * - Simulation geometry: UTM Zone 17N (EPSG:32617), shifted to a local origin
 *   near Wismer Park so numbers stay small (metres, float32-safe).
 *
 * The local frame is rotated to follow the park's street grid, so that
 * construction grids line up with the park edges:
 *   x = metres along Bur Oak Avenue, +x towards Mingay Avenue (ENE)
 *   y = height above ground (metres, up)
 *   z = metres across Bur Oak Avenue, -z into the park towards Castlemore Ave (NNW)
 * This matches the Three.js convention (y up, -z "forward").
 *
 * Because the frame is rotated, local x/z are NOT east/north offsets. Always
 * convert through localToLngLat() when placing objects on the map.
 * The UTM scale factor here is ~0.99984, so local distances read ~0.016%
 * short of true ground distance (16 cm per km).
 */

export const WGS84 = 'EPSG:4326'
export const UTM17N = 'EPSG:32617'

proj4.defs(UTM17N, '+proj=utm +zone=17 +datum=WGS84 +units=m +no_defs +type=crs')

/** Initial map centre from the roadmap; also the local origin for the simulation. */
export const PARK_ORIGIN_LNGLAT: [number, number] = [-79.27979, 43.89938]

const toUtm = proj4(WGS84, UTM17N)

export function lngLatToUtm([lng, lat]: [number, number]): [number, number] {
  return toUtm.forward([lng, lat]) as [number, number]
}

export function utmToLngLat([e, n]: [number, number]): [number, number] {
  return toUtm.inverse([e, n]) as [number, number]
}

export const PARK_ORIGIN_UTM = lngLatToUtm(PARK_ORIGIN_LNGLAT)

/**
 * UTM grid azimuth (degrees clockwise from grid north) of the local +x axis.
 * Measured from the City of Markham park boundary along Bur Oak Avenue: its two
 * long edges (271 m and 259 m) run at 71.28°–71.30°. In true-north terms this is
 * 72.47° (UTM meridian convergence here is +1.19°).
 * The Mingay Avenue edge runs at ~165°, about 4° off perpendicular, so local
 * z follows Mingay only approximately.
 */
export const LOCAL_X_GRID_AZIMUTH_DEG = 71.29

const az = (LOCAL_X_GRID_AZIMUTH_DEG * Math.PI) / 180
/** Local +x and "into the park" (-z) as unit vectors in UTM (east, north). */
const AXIS_X: [number, number] = [Math.sin(az), Math.cos(az)]
const AXIS_IN: [number, number] = [-Math.cos(az), Math.sin(az)]

/** WGS84 lon/lat (+ optional height) to local scene metres [x, y, z]. */
export function lngLatToLocal([lng, lat]: [number, number], height = 0): [number, number, number] {
  const [e, n] = lngLatToUtm([lng, lat])
  const dE = e - PARK_ORIGIN_UTM[0]
  const dN = n - PARK_ORIGIN_UTM[1]
  return [dE * AXIS_X[0] + dN * AXIS_X[1], height, -(dE * AXIS_IN[0] + dN * AXIS_IN[1])]
}

/** Local scene metres [x, y, z] back to WGS84 lon/lat. Height (y) is ignored. */
export function localToLngLat([x, , z]: [number, number, number]): [number, number] {
  const inward = -z
  return utmToLngLat([
    PARK_ORIGIN_UTM[0] + x * AXIS_X[0] + inward * AXIS_IN[0],
    PARK_ORIGIN_UTM[1] + x * AXIS_X[1] + inward * AXIS_IN[1],
  ])
}

/** Planar area (m²) of a lon/lat ring, computed in UTM with the shoelace formula. */
export function ringAreaM2(ring: [number, number][]): number {
  const pts = ring.map(lngLatToUtm)
  let sum = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

/**
 * Ellipsoidal (WGS84) ground distance in metres, Vincenty inverse formula.
 * Accurate to well under a millimetre at park scale. Haversine is not used
 * because its spherical Earth is off by up to ~0.5% at this latitude.
 */
export function geodesicDistanceM([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const a = 6_378_137
  const f = 1 / 298.257223563
  const b = a * (1 - f)
  const rad = Math.PI / 180
  const L = (lng2 - lng1) * rad
  const U1 = Math.atan((1 - f) * Math.tan(lat1 * rad))
  const U2 = Math.atan((1 - f) * Math.tan(lat2 * rad))
  const [sinU1, cosU1, sinU2, cosU2] = [Math.sin(U1), Math.cos(U1), Math.sin(U2), Math.cos(U2)]

  let lambda = L
  let sinSigma = 0, cosSigma = 1, sigma = 0, cos2Alpha = 1, cos2SigmaM = 0
  for (let i = 0; i < 200; i++) {
    const sinL = Math.sin(lambda)
    const cosL = Math.cos(lambda)
    sinSigma = Math.hypot(cosU2 * sinL, cosU1 * sinU2 - sinU1 * cosU2 * cosL)
    if (sinSigma === 0) return 0
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosL
    sigma = Math.atan2(sinSigma, cosSigma)
    const sinAlpha = (cosU1 * cosU2 * sinL) / sinSigma
    cos2Alpha = 1 - sinAlpha ** 2
    cos2SigmaM = cos2Alpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cos2Alpha
    const C = (f / 16) * cos2Alpha * (4 + f * (4 - 3 * cos2Alpha))
    const prev = lambda
    lambda = L + (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)))
    if (Math.abs(lambda - prev) < 1e-12) break
  }
  const u2 = (cos2Alpha * (a * a - b * b)) / (b * b)
  const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)))
  const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)))
  const dSigma =
    B * sinSigma * (cos2SigmaM + (B / 4) * (cosSigma * (-1 + 2 * cos2SigmaM ** 2) - (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)))
  return b * A * (sigma - dSigma)
}
