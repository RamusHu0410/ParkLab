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
  it('is a valid FeatureCollection containing Wismer Park', () => {
    const geo = JSON.parse(fs.readFileSync(path.join(publicDir, PARK_MAP_URL), 'utf8'))
    expect(geo.type).toBe('FeatureCollection')
    const park = geo.features.filter((f: { properties: { PARK_NAME: string } }) => f.properties.PARK_NAME === PARK_NAME)
    expect(park.length).toBe(3)
  })
})
