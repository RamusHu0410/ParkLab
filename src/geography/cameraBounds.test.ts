import { LngLat } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { INITIAL_CAMERA } from './constants'
import { CAMERA_CENTER_BOUNDS_LOCAL, clampCameraCenter, makeTransformConstrain } from './cameraBounds'
import { lngLatToLocal, localToLngLat } from './projection'

describe('camera bounds', () => {
  it('leaves the start view and the park centre untouched', () => {
    expect(clampCameraCenter([...INITIAL_CAMERA.center])).toEqual([...INITIAL_CAMERA.center])
    const centre = localToLngLat([0, 0, 0])
    expect(clampCameraCenter(centre)).toEqual(centre)
  })

  it('pulls a far-away centre back to the edge of the allowed area', () => {
    const [x, , z] = lngLatToLocal(clampCameraCenter([-79.35, 43.95])) // ~7 km NW
    const b = CAMERA_CENTER_BOUNDS_LOCAL
    expect(x).toBeCloseTo(b.minX, 3)
    expect(z).toBeCloseTo(b.minZ, 3)
  })

  it('clamps along one axis only when only one is out of range', () => {
    const [x, , z] = lngLatToLocal(clampCameraCenter(localToLngLat([2000, 0, 100])))
    expect(x).toBeCloseTo(CAMERA_CENTER_BOUNDS_LOCAL.maxX, 3)
    expect(z).toBeCloseTo(100, 3)
  })

  it('enforces the minimum zoom', () => {
    const constrain = makeTransformConstrain(16.1)
    expect(constrain(new LngLat(-79.28, 43.899), 14).zoom).toBe(16.1)
    expect(constrain(new LngLat(-79.28, 43.899), 18).zoom).toBe(18)
  })
})
