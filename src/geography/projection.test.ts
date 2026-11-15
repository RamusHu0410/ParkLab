import fs from 'node:fs'
import path from 'node:path'
import { MercatorCoordinate } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { geodesicDistanceM, lngLatToLocal, lngLatToUtm, localToLngLat, PARK_ORIGIN_LNGLAT, PARK_ORIGIN_UTM, ringAreaM2 } from './projection'

const geo = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/maps/wismer-park.geojson'), 'utf8'))
interface OfficialFeature {
  properties: { source: string; USE_TYPE: string; EASTING: number; NORTHING: number; Shape__Area: number }
  geometry: { coordinates: [number, number][][] }
}
const official: OfficialFeature[] = geo.features.filter(
  (f: OfficialFeature) => f.properties.source === 'City of Markham' && f.properties.USE_TYPE,
)
const officialCases = official.map((f) => [f.properties.USE_TYPE, f] as [string, OfficialFeature])

function utmCentroid(ring: [number, number][]): [number, number] {
  const pts = ring.map(lngLatToUtm)
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const c = x1 * y2 - x2 * y1
    a += c
    cx += (x1 + x2) * c
    cy += (y1 + y2) * c
  }
  a /= 2
  return [cx / (6 * a), cy / (6 * a)]
}

describe('UTM 17N projection', () => {
  it('puts the park origin where expected', () => {
    expect(PARK_ORIGIN_UTM[0]).toBeCloseTo(638150, -1)
    expect(PARK_ORIGIN_UTM[1]).toBeCloseTo(4862135.5, -1)
    expect(lngLatToLocal(PARK_ORIGIN_LNGLAT)).toEqual([0, 0, -0])
  })

  it.each(officialCases)(
    '%s centroid matches City of Markham EASTING/NORTHING within 1.5 m',
    (_name, f) => {
      const [e, n] = utmCentroid(f.geometry.coordinates[0])
      // Remaining ~1 m offset is consistent across all polygons: the dataset is NAD83, we use WGS84.
      expect(Math.abs(e - f.properties.EASTING)).toBeLessThan(1.5)
      expect(Math.abs(n - f.properties.NORTHING)).toBeLessThan(1.5)
    },
  )

  it.each(officialCases)(
    '%s area matches City of Markham Shape__Area within 0.1%%',
    (_name, f) => {
      const area = ringAreaM2(f.geometry.coordinates[0])
      expect(Math.abs(area / f.properties.Shape__Area - 1)).toBeLessThan(0.001)
    },
  )
})

describe('geodesic reference', () => {
  it('matches the WGS84 meridian-arc series for 1° centred on 43.9° N', () => {
    // 111132.954 - 559.822·cos(2φ) + 1.175·cos(4φ) m per degree of latitude.
    const phi = (43.9 * Math.PI) / 180
    const expected = 111_132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi)
    expect(Math.abs(geodesicDistanceM([-79.28, 43.4], [-79.28, 44.4]) - expected)).toBeLessThan(1)
  })
})

describe('dissolved park boundary', () => {
  it('encloses exactly the area of the Park, Woodlot and Valley polygons', () => {
    const outer = geo.features.find((f: { properties: { category: string } }) => f.properties.category === 'park_outer_boundary')
    const parts = official.filter((f) => f.properties.USE_TYPE !== 'School').reduce((s, f) => s + f.properties.Shape__Area, 0)
    expect(Math.abs(ringAreaM2(outer.geometry.coordinates[0]) / parts - 1)).toBeLessThan(0.0001)
  })
})

describe('local metre frame', () => {
  it('round-trips lon/lat to local and back within 1 mm', () => {
    for (const [x, z] of [[0, 0], [500, -300], [-450, 250], [800, 800]]) {
      const back = lngLatToLocal(localToLngLat([x, 0, z]))
      expect(Math.hypot(back[0] - x, back[2] - z)).toBeLessThan(0.001)
    }
  })

  it('preserves ground distances to within 0.05% across the park (UTM scale factor ~0.99984)', () => {
    // Park extremes, roughly 700 m apart.
    const a: [number, number] = [-79.28407, 43.89722]
    const b: [number, number] = [-79.27551, 43.90155]
    const [ax, , az] = lngLatToLocal(a)
    const [bx, , bz] = lngLatToLocal(b)
    const local = Math.hypot(bx - ax, bz - az)
    const geodesic = geodesicDistanceM(a, b)
    expect(geodesic).toBeGreaterThan(700)
    expect(Math.abs(local / geodesic - 1)).toBeLessThan(0.0005)
  })

  it('agrees with MapLibre Web Mercator when converted through lon/lat', () => {
    // The 3D integration path: local metres -> lon/lat -> MercatorCoordinate.
    const origin = MercatorCoordinate.fromLngLat(localToLngLat([0, 0, 0]))
    const east = MercatorCoordinate.fromLngLat(localToLngLat([100, 0, 0]))
    const metres = Math.hypot(east.x - origin.x, east.y - origin.y) / origin.meterInMercatorCoordinateUnits()
    expect(metres).toBeCloseTo(100, 0)
  })

  it('aligns local +x with the straight park edges along Bur Oak Avenue (within 0.05°)', () => {
    const outer = geo.features.find((f: { properties: { category: string } }) => f.properties.category === 'park_outer_boundary')
    const ring: [number, number][] = outer.geometry.coordinates[0]
    // Long boundary edges south of the park centre and roughly parallel to local x = the Bur Oak frontage.
    const edges = ring.slice(0, -1).map((a, i) => [lngLatToLocal(a), lngLatToLocal(ring[i + 1])])
    const burOak = edges.filter(([a, b]) => {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2])
      const angle = Math.abs((Math.atan2(b[2] - a[2], b[0] - a[0]) * 180) / Math.PI) % 180
      return len > 50 && a[2] > 0 && (angle < 10 || angle > 170)
    })
    const totalLen = burOak.reduce((s, [a, b]) => s + Math.hypot(b[0] - a[0], b[2] - a[2]), 0)
    expect(totalLen).toBeGreaterThan(500)
    for (const [a, b] of burOak) {
      const angle = (Math.atan2(b[2] - a[2], b[0] - a[0]) * 180) / Math.PI
      const offAxis = Math.min(Math.abs(angle), 180 - Math.abs(angle))
      expect(offAxis).toBeLessThan(0.05)
    }
  })

  it('points local -z into the park (park centre has negative z relative to Bur Oak edge)', () => {
    const [, , zEdge] = lngLatToLocal([-79.2786, 43.89797])
    const [, , zInside] = lngLatToLocal([-79.2795, 43.8995])
    expect(zInside).toBeLessThan(zEdge)
  })
})
