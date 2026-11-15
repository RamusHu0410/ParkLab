import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PARK_MAP_URL, PARK_NAME } from '../geography/constants'
import { ASSETS, getAsset } from './assets'

const publicDir = path.resolve(__dirname, '../../public')

describe('asset manifest', () => {
  it('points at files that exist in public/', () => {
    const missing = ASSETS.filter((a) => !fs.existsSync(path.join(publicDir, a.url)))
    expect(missing.map((a) => a.url)).toEqual([])
  })

  it('has unique ids and the expected packs', () => {
    expect(new Set(ASSETS.map((a) => a.id)).size).toBe(ASSETS.length)
    expect(ASSETS.filter((a) => a.pack === 'playground')).toHaveLength(30)
    expect(ASSETS.filter((a) => a.kind === 'character')).toHaveLength(6)
    expect(getAsset('park_bench').sizeM).toEqual([1.6, 0.52, 1.02])
  })
})

describe('park map', () => {
  const geo = JSON.parse(fs.readFileSync(path.join(publicDir, PARK_MAP_URL), 'utf8'))
  type F = { properties: Record<string, string>; geometry: { type: string; coordinates: number[][][] } }

  it('is a valid FeatureCollection containing the 3 official Wismer Park polygons', () => {
    expect(geo.type).toBe('FeatureCollection')
    const park = geo.features.filter((f: F) => f.properties.PARK_NAME === PARK_NAME && f.properties.USE_TYPE)
    expect(park.map((f: F) => f.properties.USE_TYPE).sort()).toEqual(['Park', 'Valley', 'Woodlot'])
    expect(park.every((f: F) => f.properties.verification === 'official')).toBe(true)
  })

  it('keeps the official boundary identical to the City of Markham source (to 1e-7°, ~1 cm)', () => {
    const raw = fs.readFileSync(path.resolve(publicDir, '../Assets/WismerParks.geojson'), 'utf8').trim().replace(/,\s*$/, '')
    const source: F[] = JSON.parse(`[${raw}]`)
    for (const src of source) {
      const out = geo.features.find((f: F) => f.properties.OBJECTID === src.properties.OBJECTID)
      const a = src.geometry.coordinates[0]
      const b = out.geometry.coordinates[0]
      expect(b).toHaveLength(a.length)
      a.forEach((p, i) => {
        expect(Math.abs(p[0] - b[i][0])).toBeLessThan(1e-7)
        expect(Math.abs(p[1] - b[i][1])).toBeLessThan(1e-7)
      })
    }
  })

  it('labels every feature with its source and verification level', () => {
    for (const f of geo.features as F[]) {
      expect(['City of Markham', 'OpenStreetMap']).toContain(f.properties.source)
      expect(['official', 'osm-community']).toContain(f.properties.verification)
      expect(f.properties.category).toBeTruthy()
    }
  })
})
