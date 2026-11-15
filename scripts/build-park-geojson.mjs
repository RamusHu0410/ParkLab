// Builds public/maps/wismer-park.geojson from:
//   1. Assets/WismerParks.geojson        City of Markham Parks dataset (official)
//   2. data/osm/wismer-overpass.json     OpenStreetMap via Overpass (community-mapped)
//   3. data/osm/wismer-streets.json      named streets around the park (OpenStreetMap via OpenFreeMap tiles)
// Run with: node scripts/build-park-geojson.mjs
//
// Every output feature carries:
//   source        "City of Markham" | "OpenStreetMap"
//   verification  "official"        | "osm-community"
//   category      what the simulator should treat it as (see CATEGORY below)
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const MARKHAM_FILE = path.join(root, 'Assets/WismerParks.geojson')
const OSM_FILE = path.join(root, 'data/osm/wismer-overpass.json')
const STREETS_FILE = path.join(root, 'data/osm/wismer-streets.json')
const OUT_FILE = path.join(root, 'public/maps/wismer-park.geojson')

const round = (n) => Math.round(n * 1e7) / 1e7
const roundCoords = (c) => (typeof c[0] === 'number' ? c.map(round) : c.map(roundCoords))

// ---- 1. City of Markham (the file is a comma-separated list of Features) ----
const raw = fs.readFileSync(MARKHAM_FILE, 'utf8').trim().replace(/,\s*$/, '')
const markham = JSON.parse(`[${raw}]`)

const MARKHAM_CATEGORY = { Park: 'park_area', Woodlot: 'woodlot', Valley: 'valley', School: 'adjacent_school' }
const markhamFeatures = markham.map((f) => ({
  type: 'Feature',
  properties: {
    ...f.properties,
    category: MARKHAM_CATEGORY[f.properties.USE_TYPE] ?? 'other',
    source: 'City of Markham',
    verification: 'official',
  },
  geometry: { ...f.geometry, coordinates: roundCoords(f.geometry.coordinates) },
}))

const parkRings = markham.filter((f) => f.properties.PARK_NAME === 'Wismer Park').map((f) => f.geometry.coordinates[0])

const inRing = ([x, y], ring) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const inPark = (pt) => parkRings.some((r) => inRing(pt, r))

// Outer boundary of the whole park: the three Markham polygons share edges
// vertex-for-vertex, so the outer ring is the chain of edges used only once.
function outerBoundary(rings) {
  const key = (p) => `${p[0]},${p[1]}`
  const edgeCount = new Map()
  const edges = []
  for (const r of rings) {
    for (let i = 0; i < r.length - 1; i++) {
      const [a, b] = [r[i], r[i + 1]]
      if (key(a) === key(b)) continue
      const k = [key(a), key(b)].sort().join('|')
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1)
      edges.push({ a, b, k })
    }
  }
  const outer = edges.filter((e) => edgeCount.get(e.k) === 1)
  const next = new Map()
  for (const e of outer) {
    next.set(key(e.a), [...(next.get(key(e.a)) ?? []), e.b])
    next.set(key(e.b), [...(next.get(key(e.b)) ?? []), e.a])
  }
  if ([...next.values()].some((n) => n.length !== 2)) throw new Error('Park polygons do not form a single outer ring')
  const ring = [outer[0].a]
  let prev = null
  let cur = outer[0].a
  for (;;) {
    const options = next.get(key(cur))
    const nxt = prev && key(options[0]) === key(prev) ? options[1] : options[0]
    ring.push(nxt)
    if (key(nxt) === key(ring[0])) break
    prev = cur
    cur = nxt
    if (ring.length > outer.length + 1) throw new Error('Outer ring did not close')
  }
  if (ring.length - 1 !== outer.length) throw new Error('Outer edges form more than one ring')
  return ring
}

const parkOuterFeature = {
  type: 'Feature',
  properties: {
    PARK_NAME: 'Wismer Park',
    category: 'park_outer_boundary',
    source: 'City of Markham',
    verification: 'official',
    derivation: 'Dissolved from the Park, Woodlot and Valley polygons (unshared edges only).',
  },
  geometry: { type: 'Polygon', coordinates: [roundCoords(outerBoundary(parkRings))] },
}
markhamFeatures.push(parkOuterFeature)

// ---- 2. OpenStreetMap ----
const osm = JSON.parse(fs.readFileSync(OSM_FILE, 'utf8'))

function categorize(t) {
  if (t.leisure === 'park') return null // the park outline itself comes from Markham
  if (t.leisure === 'playground') return 'playground'
  if (t.leisure === 'pitch') return t.sport === 'tennis' ? 'tennis_court' : t.sport === 'basketball' ? 'basketball_court' : 'sports_field'
  if (t.natural === 'water' || t.water) return 'water'
  if (t.waterway) return t.tunnel ? 'stream_culvert' : 'stream'
  if (t.natural === 'wood' || t.landuse === 'forest') return 'wood'
  if (t.highway === 'footway' && (t.footway === 'sidewalk' || t.footway === 'crossing')) return null
  if (['footway', 'path', 'cycleway', 'pedestrian', 'steps', 'track', 'bridleway'].includes(t.highway)) return 'path'
  if (t.highway === 'service') return 'service_road'
  if (t.amenity === 'parking') return 'parking'
  if (t.barrier === 'fence') return 'fence'
  if (t.amenity === 'bench' || t.amenity === 'waste_basket' || t.amenity === 'drinking_water' || t.amenity === 'toilets' || t.amenity === 'shelter') return `amenity_${t.amenity}`
  return null
}

const osmFeatures = []
const skipped = {}
for (const el of osm.elements) {
  const t = el.tags ?? {}
  const category = categorize(t)
  if (!category) continue

  let geometry
  let vertices
  if (el.type === 'node') {
    vertices = [[el.lon, el.lat]]
    geometry = { type: 'Point', coordinates: vertices[0] }
  } else if (el.type === 'way' && el.geometry) {
    vertices = el.geometry.map((p) => [p.lon, p.lat])
    const closed = vertices.length > 3 && vertices[0][0] === vertices.at(-1)[0] && vertices[0][1] === vertices.at(-1)[1]
    const isArea = closed && !['path', 'service_road', 'stream', 'stream_culvert', 'fence'].includes(category)
    geometry = isArea ? { type: 'Polygon', coordinates: [vertices] } : { type: 'LineString', coordinates: vertices }
  } else {
    continue
  }

  const insideCount = vertices.filter(inPark).length
  if (insideCount === 0) {
    skipped[category] = (skipped[category] ?? 0) + 1
    continue
  }

  osmFeatures.push({
    type: 'Feature',
    properties: {
      category,
      source: 'OpenStreetMap',
      verification: 'osm-community',
      osm_id: `${el.type}/${el.id}`,
      // "inside": every vertex inside the park; "crosses": partly inside (kept unclipped)
      park_relation: insideCount === vertices.length ? 'inside' : 'crosses',
      ...Object.fromEntries(Object.entries(t).map(([k, v]) => [`osm:${k}`, v])),
    },
    geometry: { ...geometry, coordinates: roundCoords(geometry.coordinates) },
  })
}

// ---- 3. Reference features for the simulation (not drawn on the map) ----
// Streets within ~250 m of the park, for entrances and traffic-safety checks.
const parkBox = (() => {
  const xs = parkRings.flat().map((p) => p[0])
  const ys = parkRings.flat().map((p) => p[1])
  const pad = 0.0032 // ≈ 250 m
  return { w: Math.min(...xs) - pad, e: Math.max(...xs) + pad, s: Math.min(...ys) - pad / 1.4, n: Math.max(...ys) + pad / 1.4 }
})()
const nearPark = ([x, y]) => x >= parkBox.w && x <= parkBox.e && y >= parkBox.s && y <= parkBox.n
const streetsSrc = JSON.parse(fs.readFileSync(STREETS_FILE, 'utf8'))
const streetFeatures = []
for (const f of streetsSrc.features) {
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : []
  for (const line of lines) {
    if (!line.some(nearPark)) continue
    streetFeatures.push({
      type: 'Feature',
      properties: { category: 'street', name: f.properties.name, street_class: f.properties.class, source: 'OpenStreetMap', verification: 'osm-community' },
      geometry: { type: 'LineString', coordinates: roundCoords(line) },
    })
  }
}
// Named destinations outside the park that citizens head for.
const DESTINATIONS = { 'way/220406701': 'Bur Oak Secondary School' }
const destinationFeatures = osm.elements
  .filter((el) => DESTINATIONS[`${el.type}/${el.id}`] && el.geometry)
  .map((el) => ({
    type: 'Feature',
    properties: { category: 'destination', name: DESTINATIONS[`${el.type}/${el.id}`], osm_id: `${el.type}/${el.id}`, source: 'OpenStreetMap', verification: 'osm-community' },
    geometry: { type: 'Polygon', coordinates: [roundCoords(el.geometry.map((p) => [p.lon, p.lat]))] },
  }))

const out = {
  type: 'FeatureCollection',
  name: 'WismerPark',
  metadata: {
    description: 'Wismer Park (Markham, ON): official City of Markham park polygons plus OpenStreetMap features that touch them.',
    crs: 'EPSG:4326 (WGS84 lon/lat)',
    sources: {
      'City of Markham': 'City of Markham Parks dataset (Assets/WismerParks.geojson). Treated as authoritative for boundaries.',
      OpenStreetMap: `Overpass API, OSM base ${osm.osm3s?.timestamp_osm_base}. © OpenStreetMap contributors, ODbL. Community-mapped; not verified against an official site map.`,
      streets: streetsSrc.metadata?.source,
    },
    generatedAt: new Date().toISOString(),
  },
  features: [...markhamFeatures, ...osmFeatures, ...streetFeatures, ...destinationFeatures],
}

fs.writeFileSync(OUT_FILE, JSON.stringify(out))
const counts = {}
for (const f of out.features) counts[`${f.properties.source}: ${f.properties.category}`] = (counts[`${f.properties.source}: ${f.properties.category}`] ?? 0) + 1
console.log(`Wrote ${out.features.length} features to ${path.relative(root, OUT_FILE)}`)
console.table(counts)
console.log('Outside park (skipped):', skipped)
