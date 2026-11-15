import { MercatorCoordinate } from 'maplibre-gl'
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { localToMercatorMatrix } from './localFrame'
import { localToLngLat } from './projection'

describe('local → Mercator matrix (3D objects on the map)', () => {
  const m = localToMercatorMatrix()
  const metresPerUnit = 1 / MercatorCoordinate.fromLngLat(localToLngLat([0, 0, 0])).meterInMercatorCoordinateUnits()

  it.each([
    [0, 0],
    [300, 150],
    [-350, -150],
    [530, 480],
    [-550, -400],
  ])('places local (%d, %d) within 5 cm of the exact geographic position', (x, z) => {
    const approx = new Vector3(x, 0, z).applyMatrix4(m)
    const exact = MercatorCoordinate.fromLngLat(localToLngLat([x, 0, z]))
    const errM = Math.hypot(approx.x - exact.x, approx.y - exact.y) * metresPerUnit
    expect(errM).toBeLessThan(0.05)
  })

  it('maps 1 local metre up to 1 metre of altitude', () => {
    const top = new Vector3(0, 10, 0).applyMatrix4(m)
    const base = new Vector3(0, 0, 0).applyMatrix4(m)
    expect((top.z - base.z) * metresPerUnit).toBeCloseTo(10, 6)
  })
})
