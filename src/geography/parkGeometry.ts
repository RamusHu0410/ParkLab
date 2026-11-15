import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { Ring, Vec2 } from '../utils/geometry2d'
import { lngLatToLocal } from './projection'

export interface AreaFeature {
  ring: Ring
  /** Source feature id, e.g. "way/171477483" or the Markham OBJECTID. */
  sourceId: string
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

  return {
    outer: one('park_outer_boundary'),
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
