import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { dist, distToPolyline, distToRingEdge, pointAlong, pointInRing, polylineLength, type Ring, type Vec2 } from '../utils/geometry2d'
import { lngLatToLocal } from './projection'

export interface AreaFeature {
  ring: Ring
  /** Source feature id, e.g. "way/171477483" or the Markham OBJECTID. */
  sourceId: string
}

export interface PathInfo {
  line: Vec2[]
  /** OSM highway tag: path, footway, service... */
  highway: string
  /** OSM surface tag, if mapped. */
  surface?: string
  sourceId: string
}

export interface Street {
  name: string
  /** OpenMapTiles class: primary, secondary, tertiary (arterials) or minor (local streets). */
  cls: string
  line: Vec2[]
}

/** Where a park path meets the park boundary. */
export interface Entrance {
  id: string
  point: Vec2
  /** Street the entrance opens onto. */
  street: string
}

/** Wismer Park geometry in local metres [x, z]. Built from public/maps/wismer-park.geojson. */
export interface ParkGeometry {
  outer: Ring
  parkArea: Ring
  woodlot: Ring
  valley: Ring
  playgrounds: AreaFeature[]
  soccerFields: AreaFeature[]
  tennisCourts: AreaFeature[]
  basketballCourts: AreaFeature[]
  parking: AreaFeature[]
  paths: Vec2[][]
  serviceRoads: Vec2[][]
  /** Open-channel streams only; culverts are underground. */
  streams: Vec2[][]
  pathInfo: PathInfo[]
  streets: Street[]
  destinations: { name: string; ring: Ring }[]
  entrances: Entrance[]
}

const toLocal = (c: number[]): Vec2 => {
  const [x, , z] = lngLatToLocal([c[0], c[1]])
  return [x, z]
}

/** Drops the closing vertex so rings are stored open. */
const openRing = (coords: number[][]): Ring => {
  const r = coords.map(toLocal)
  const [a, b] = [r[0], r[r.length - 1]]
  return a[0] === b[0] && a[1] === b[1] ? r.slice(0, -1) : r
}

type Props = Record<string, unknown> & { category: string }

export function parseParkGeometry(fc: FeatureCollection<Geometry, Props>): ParkGeometry {
  const byCat = (cat: string) => fc.features.filter((f) => f.properties.category === cat)
  const one = (cat: string) => {
    const f = byCat(cat)[0]
    if (!f || f.geometry.type !== 'Polygon') throw new Error(`Park map is missing the "${cat}" polygon`)
    return openRing(f.geometry.coordinates[0])
  }
  const areas = (cat: string): AreaFeature[] =>
    byCat(cat)
      .filter((f): f is Feature<Extract<Geometry, { type: 'Polygon' }>, Props> => f.geometry.type === 'Polygon')
      .map((f) => ({ ring: openRing(f.geometry.coordinates[0]), sourceId: String(f.properties.osm_id ?? f.properties.OBJECTID) }))
  const lines = (cat: string): Vec2[][] =>
    byCat(cat).flatMap((f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates.map(toLocal)] : []))

  const pathInfo: PathInfo[] = byCat('path').flatMap((f) =>
    f.geometry.type === 'LineString'
      ? [{ line: f.geometry.coordinates.map(toLocal), highway: String(f.properties['osm:highway'] ?? 'path'), surface: f.properties['osm:surface'] as string | undefined, sourceId: String(f.properties.osm_id) }]
      : [],
  )
  const streets: Street[] = byCat('street').flatMap((f) =>
    f.geometry.type === 'LineString' ? [{ name: String(f.properties.name), cls: String(f.properties.street_class), line: f.geometry.coordinates.map(toLocal) }] : [],
  )
  const destinations = areas('destination').map((a, i) => ({ name: String(byCat('destination')[i].properties.name), ring: a.ring }))
  const outer = one('park_outer_boundary')

  return {
    outer,
    pathInfo,
    streets,
    destinations,
    entrances: findEntrances(pathInfo.map((p) => p.line), outer, streets),
    parkArea: one('park_area'),
    woodlot: one('woodlot'),
    valley: one('valley'),
    playgrounds: areas('playground'),
    soccerFields: areas('sports_field'),
    tennisCourts: areas('tennis_court'),
    basketballCourts: areas('basketball_court'),
    parking: areas('parking'),
    paths: lines('path'),
    serviceRoads: lines('service_road'),
    streams: lines('stream'),
  }
}

/**
 * Entrances are where paths leave the park (crossing the boundary) or end
 * within 8 m of it. Points closer than 15 m are merged. Each is named after the
 * nearest street.
 */
export function findEntrances(paths: Vec2[][], outer: Ring, streets: Street[]): Entrance[] {
  const found: Vec2[] = []
  const add = (p: Vec2) => {
    if (!found.some((q) => dist(p, q) < 15)) found.push(p)
  }
  for (const line of paths) {
    const L = polylineLength(line)
    let prev = pointAlong(line, 0).p
    let prevIn = pointInRing(prev, outer)
    for (let d = 1; d <= L; d += 1) {
      const p = pointAlong(line, d).p
      const inside = pointInRing(p, outer)
      if (inside !== prevIn) add(inside ? p : prev)
      prev = p
      prevIn = inside
    }
    for (const end of [line[0], line[line.length - 1]]) if (pointInRing(end, outer) && distToRingEdge(end, outer) < 8) add(end)
  }
  return found.map((p, i) => {
    let best = { name: '', d: Infinity }
    for (const s of streets) {
      const d = distToPolyline(p, s.line)
      if (d < best.d) best = { name: s.name, d }
    }
    return { id: `entrance-${i}`, point: p, street: best.name }
  })
}
