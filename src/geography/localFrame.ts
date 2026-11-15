import { MercatorCoordinate } from 'maplibre-gl'
import { Matrix4 } from 'three'
import { localToLngLat } from './projection'

/**
 * Affine matrix from local scene metres (x, y up, z) to MapLibre Web Mercator
 * coordinates (0..1 world units, z = altitude). Built from the exact UTM
 * conversion at the origin plus 100 m along each ground axis, so it includes the
 * frame rotation, UTM convergence and the local Mercator scale. The
 * non-linear residual is a few centimetres at 800 m from the origin (see test).
 */
export function localToMercatorMatrix(): Matrix4 {
  const L = 100
  const o = MercatorCoordinate.fromLngLat(localToLngLat([0, 0, 0]))
  const px = MercatorCoordinate.fromLngLat(localToLngLat([L, 0, 0]))
  const pz = MercatorCoordinate.fromLngLat(localToLngLat([0, 0, L]))
  const up = o.meterInMercatorCoordinateUnits()
  const ex = [(px.x - o.x) / L, (px.y - o.y) / L, 0]
  const ez = [(pz.x - o.x) / L, (pz.y - o.y) / L, 0]
  // prettier-ignore
  return new Matrix4().set(
    ex[0], 0,  ez[0], o.x,
    ex[1], 0,  ez[1], o.y,
    0,     up, 0,     0,
    0,     0,  0,     1,
  )
}
