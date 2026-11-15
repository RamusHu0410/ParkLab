import { beforeEach, describe, expect, it } from 'vitest'
import { getConstructionGrid, initConstructionGrid, STARTING_BUDGET, useParkStore } from '../store/parkStore'
import { type BlockShape, facilityShape, smoothLine } from './blocks'
import { LEVEL } from './level'

// A 200 × 100 m park with a woodlot in the west, a stream in the east and an existing court in the middle.
const terrain = {
  outer: [[0, 0], [200, 0], [200, 100], [0, 100]] as [number, number][],
  woodlot: [[0, 0], [40, 0], [40, 100], [0, 100]] as [number, number][],
  streams: [[[180, 0], [180, 100]]] as [number, number][][],
  existing: [{ id: 'court', ring: [[90, 40], [110, 40], [110, 60], [90, 60]] as [number, number][] }],
}

const path = (line: [number, number][], width = 2): BlockShape => ({ kind: 'path', type: 'walking_trail', line, width })
const store = () => useParkStore.getState()

describe('construction system', () => {
  beforeEach(() => {
    store().reset()
    initConstructionGrid(terrain)
  })

  it('draws a path: marks cells, charges per m² and adds furniture', () => {
    const r = store().buildBlock(path([[50, 20], [150, 20]], 3))
    expect(r?.ok).toBe(true)
    const grid = getConstructionGrid()!
    expect(grid.kindAt(grid.indexAt([100, 20]))).toBe('path')
    expect(grid.kindAt(grid.indexAt([100, 23]))).toBeNull()
    const cells = store().blocks[0].cells.length
    expect(cells).toBeGreaterThan(280)
    expect(store().budget).toBe(STARTING_BUDGET - cells * LEVEL.costs.path.walking_trail.perSquareMetre)
    expect(store().placedItems.some((i) => i.assetId === 'park_bench')).toBe(true)
    expect(store().simulation.stats.pathM2.walking_trail).toBe(cells)
  })

  it('rejects invalid placements without changing the park', () => {
    expect(store().buildBlock(path([[150, 50], [250, 50]]))?.reasons[0]).toMatch(/boundary/)
    expect(store().buildBlock(path([[170, 10], [190, 10]]))?.reasons[0]).toMatch(/stream/)
    expect(store().buildBlock(path([[80, 50], [120, 50]]))?.reasons[0]).toMatch(/existing/)
    expect(store().buildBlock(facilityShape('playground', [20, 50]))?.reasons[0]).toMatch(/woodlot/)
    expect(store().buildBlock(facilityShape('playground', [100, 50]))?.ok).toBe(false)
    expect(store().budget).toBe(STARTING_BUDGET)
    expect(store().blocks).toHaveLength(0)
  })

  it('rejects placements over budget', () => {
    useParkStore.setState({ budget: 100 })
    const r = store().buildBlock(facilityShape('playground', [140, 50]))
    expect(r?.ok).toBe(false)
    expect(r?.reasons[0]).toMatch(/available/)
  })

  it('places a facility block with its equipment and rejects overlaps', () => {
    const r = store().buildBlock(facilityShape('basketball_court', [140, 75]))
    expect(r?.ok).toBe(true)
    expect(store().placedItems.filter((i) => i.assetId === 'Sport_Basketball_Hoop')).toHaveLength(2)
    expect(store().facilities).toHaveLength(1)
    expect(store().budget).toBe(STARTING_BUDGET - LEVEL.costs.facility.basketball_court.flat)
    expect(store().buildBlock(facilityShape('playground', [145, 75]))?.reasons.join()).toMatch(/overlaps another facility/)
    expect(store().buildBlock(path([[140, 60], [140, 90]]))?.reasons.join()).toMatch(/facility/)
  })

  it('paints areas only on free ground and lets a path cut through them', () => {
    const area: BlockShape = { kind: 'area', type: 'flower_garden', mode: 'polygon', ring: [[30, 10], [70, 10], [70, 30], [30, 30]] }
    const r = store().buildBlock(area)!
    expect(r.ok).toBe(true)
    // The flower garden is not allowed in the woodlot (x < 40), so those cells are skipped.
    expect(r.cells.length).toBe(30 * 20)
    expect(r.notes.length).toBe(1)
    const flowers = store().placedItems.length
    expect(flowers).toBeGreaterThan(0)
    // A path through the garden takes its cells and removes flowers in the way.
    store().buildBlock(path([[45, 20], [65, 20]], 3))
    expect(store().simulation.stats.areaM2.flower_garden).toBeLessThan(600)
    const grid = getConstructionGrid()!
    expect(grid.kindAt(grid.indexAt([55, 20]))).toBe('path')
    // Removing the path gives the ground back to the garden.
    store().removeBlock(store().blocks[1].id)
    expect(grid.kindAt(grid.indexAt([55, 20]))).toBe('area')
    expect(store().simulation.stats.areaM2.flower_garden).toBe(600)
    expect(store().placedItems.filter((i) => i.assetId !== 'park_bench' && i.assetId !== 'trash_can').length).toBe(flowers)
  })

  it('removes existing items under a new path and restores them on removal', () => {
    const bench = store().addItem({ assetId: 'park_bench', position: [100, 0, 20], rotationY: 0 })
    store().buildBlock(path([[60, 20], [140, 20]]))
    expect(store().placedItems.some((i) => i.id === bench)).toBe(false)
    const cost = store().blocks[0].cost
    const before = store().budget
    store().removeBlock(store().blocks[0].id)
    expect(store().placedItems.some((i) => i.id === bench)).toBe(true)
    expect(store().budget).toBe(before + Math.round(cost * LEVEL.economy.removalRefundRate))
    expect(getConstructionGrid()!.kindAt(getConstructionGrid()!.indexAt([100, 20]))).toBeNull()
  })

  it('undoes and redoes construction with a full refund', () => {
    store().buildBlock(facilityShape('picnic_area', [140, 20]))
    store().undo()
    expect(store().budget).toBe(STARTING_BUDGET)
    expect(store().blocks).toHaveLength(0)
    expect(store().placedItems).toHaveLength(0)
    store().redo()
    expect(store().blocks).toHaveLength(1)
    expect(store().budget).toBe(STARTING_BUDGET - LEVEL.costs.facility.picnic_area.flat)
  })

  it('joins paths: overlapping cells are not charged twice', () => {
    store().buildBlock(path([[60, 20], [140, 20]]))
    const before = store().budget
    const r = store().buildBlock(path([[100, 20], [100, 35]]))!
    expect(r.ok).toBe(true)
    expect(before - store().budget).toBeLessThan(r.cells.length * LEVEL.costs.path.walking_trail.perSquareMetre)
  })

  it('smooths a drawn trace into a continuous line keeping its end points', () => {
    const line = smoothLine([[0, 0], [0.5, 0], [5, 0], [5, 5], [10, 5]])
    expect(line[0]).toEqual([0, 0])
    expect(line.at(-1)).toEqual([10, 5])
    expect(line.length).toBeGreaterThan(4)
  })

  it('demolishes existing objects for a fee, with undo', () => {
    const tree = store().addItem({ assetId: 'round_tree', position: [60, 0, 60], rotationY: 0 })
    expect(store().demolishItem(tree)).toBe(true)
    expect(store().placedItems).toHaveLength(0)
    expect(store().budget).toBe(STARTING_BUDGET - LEVEL.economy.existingRemoval.itemCost)
    store().undo()
    expect(store().placedItems.map((i) => i.id)).toEqual([tree])
    expect(store().budget).toBe(STARTING_BUDGET)
  })

  it('demolishes an existing court and frees its ground', () => {
    useParkStore.setState({ facilities: [{ id: 'court', kind: 'basketball_court', name: 'Court', center: [100, 50], angle: 0, length: 20, width: 20, basis: 'osm' }] })
    const hoop = store().addItem({ assetId: 'Sport_Basketball_Hoop', position: [105, 0, 50], rotationY: 0 })
    expect(store().buildBlock(facilityShape('picnic_area', [100, 50]))?.ok).toBe(false)
    expect(store().demolishFacility('court')).toBe(true)
    expect(store().facilities).toHaveLength(0)
    expect(store().placedItems.some((i) => i.id === hoop)).toBe(false)
    expect(store().buildBlock(facilityShape('picnic_area', [100, 50]))?.ok).toBe(true)
    store().undo()
    store().undo()
    expect(store().facilities).toHaveLength(1)
    expect(store().placedItems.some((i) => i.id === hoop)).toBe(true)
    expect(store().buildBlock(facilityShape('picnic_area', [100, 50]))?.ok).toBe(false)
  })

  it('does not demolish objects that belong to a constructed block on their own', () => {
    store().buildBlock(facilityShape('playground', [140, 50]))
    const swing = store().placedItems.find((i) => i.assetId === 'swing_set')!
    expect(store().demolishItem(swing.id)).toBe(false)
    expect(store().blockOfItem(swing.id)?.id).toBe(store().blocks[0].id)
  })
})
