import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { planFacilities } from '../construction/facilities'
import { generateInitialLayout } from '../construction/initialLayout'
import type { PlacedItem } from '../construction/types'
import { parseParkGeometry } from '../geography/parkGeometry'
import { allFacilityMarkers, facilityMarkers } from './facilityMarkers'

const geo = parseParkGeometry(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/maps/wismer-park.geojson'), 'utf8')))
const facilities = planFacilities(geo)
const items: PlacedItem[] = generateInitialLayout(geo, facilities).map((it, i) => ({ ...it, id: `item-${i}` }))

describe('facility icons', () => {
  it('shows nothing while no facility is in use', () => {
    expect(facilityMarkers(geo, facilities, items, {})).toEqual([])
  })

  it('shows exactly one icon for each facility in use', () => {
    const [a, b] = facilities
    const shown = facilityMarkers(geo, facilities, items, { [a.id]: 3, [b.id]: 1, 'playground-0': 2 })
    expect(shown.map((m) => m.key).sort()).toEqual([a.id, b.id, 'playground-0'].sort())
  })

  it('has unique keys', () => {
    const keys = allFacilityMarkers(geo, facilities, items).map((m) => m.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
