// Downloads OpenStreetMap data around Wismer Park via the Overpass API:
//   node scripts/fetch-osm-features.mjs           park features -> data/osm/wismer-overpass.json
//   node scripts/fetch-osm-features.mjs streets   street network -> data/osm/wismer-streets.json
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const STREETS = process.argv[2] === 'streets'
const outFile = path.join(root, STREETS ? 'data/osm/wismer-streets.json' : 'data/osm/wismer-overpass.json')

// Wismer Park bbox from the City of Markham polygons, padded by ~100 m.
const BBOX = '43.8960,-79.2860,43.9025,-79.2745' // south,west,north,east

// Streets: a wider box so the roads around the park and their junctions are complete.
const STREET_BBOX = '43.8940,-79.2880,43.9045,-79.2725'
const STREET_QUERY = `[out:json][timeout:90];
way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street)$"](${STREET_BBOX});
out geom tags;`

const PARK_QUERY = `[out:json][timeout:90];
(
  nwr["name"~"Wismer",i](${BBOX});
  nwr["leisure"](${BBOX});
  nwr["natural"](${BBOX});
  nwr["landuse"](${BBOX});
  nwr["waterway"](${BBOX});
  nwr["water"](${BBOX});
  nwr["amenity"](${BBOX});
  nwr["sport"](${BBOX});
  nwr["playground"](${BBOX});
  nwr["barrier"](${BBOX});
  way["highway"~"footway|path|cycleway|pedestrian|steps|service|track|bridleway"](${BBOX});
);
out geom tags;`

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

for (let attempt = 0; attempt < 8; attempt++) {
  const url = ENDPOINTS[attempt % ENDPOINTS.length]
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ParkLab/0.1 (education project)' },
      body: new URLSearchParams({ data: STREETS ? STREET_QUERY : PARK_QUERY }),
      signal: AbortSignal.timeout(100_000),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 80)}`)
    const json = JSON.parse(text)
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, JSON.stringify(json, null, 1))
    console.log(`OK from ${url}: ${json.elements.length} elements, OSM base ${json.osm3s?.timestamp_osm_base}`)
    process.exit(0)
  } catch (err) {
    const wait = 2000 * 2 ** Math.min(attempt, 4)
    console.warn(`Attempt ${attempt + 1} via ${url} failed: ${err.message}. Retrying in ${wait / 1000}s`)
    await sleep(wait)
  }
}
console.error('All Overpass attempts failed')
process.exit(1)
