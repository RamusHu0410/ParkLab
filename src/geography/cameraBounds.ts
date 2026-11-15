import { LngLat } from 'maplibre-gl'
import { lngLatToLocal, localToLngLat } from './projection'

/**
 * Area the camera centre may move within, in local metres (frame aligned with
 * Bur Oak Ave, see projection.ts). The park itself spans x -347..328 and
 * z -152..176. The margins keep the surrounding streets in view; the extra room
 * to the south (+z) is needed because the tilted start view looks north at the
 * park from a centre about 215 m south of Bur Oak Ave (z ≈ 392).
 */
export const CAMERA_CENTER_BOUNDS_LOCAL = {
  minX: -550,
  maxX: 530,
  minZ: -400,
  maxZ: 480,
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Clamps a lon/lat camera centre into CAMERA_CENTER_BOUNDS_LOCAL. */
export function clampCameraCenter([lng, lat]: [number, number]): [number, number] {
  const [x, , z] = lngLatToLocal([lng, lat])
  const b = CAMERA_CENTER_BOUNDS_LOCAL
  const cx = clamp(x, b.minX, b.maxX)
  const cz = clamp(z, b.minZ, b.maxZ)
  if (cx === x && cz === z) return [lng, lat]
  return localToLngLat([cx, 0, cz])
}

/**
 * MapLibre transformConstrain callback. Unlike maxBounds, which fits the whole
 * viewport inside the bounds and would force the camera to zoom in, this only
 * limits the camera centre and the minimum zoom.
 */
export function makeTransformConstrain(minZoom: number) {
  return (lngLat: LngLat, zoom: number) => ({
    center: LngLat.convert(clampCameraCenter([lngLat.lng, lngLat.lat])),
    zoom: Math.max(zoom, minZoom),
  })
}
