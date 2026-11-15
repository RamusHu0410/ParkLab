import { beforeEach, describe, expect, it } from 'vitest'
import { STARTING_BUDGET, useParkStore } from './parkStore'

describe('ParkState', () => {
  beforeEach(() => useParkStore.getState().reset())

  it('starts with the default budget and no items', () => {
    const s = useParkStore.getState()
    expect(s.budget).toBe(STARTING_BUDGET)
    expect(s.placedItems).toEqual([])
    expect(s.tool).toBe('select')
  })

  it('adds and removes items', () => {
    const id = useParkStore.getState().addItem({ assetId: 'park_bench', position: [1, 0, 2], rotationY: 0 })
    expect(useParkStore.getState().placedItems).toHaveLength(1)
    useParkStore.getState().selectItem(id)
    useParkStore.getState().removeItem(id)
    expect(useParkStore.getState().placedItems).toHaveLength(0)
    expect(useParkStore.getState().selectedItemId).toBeNull()
  })

  it('refuses to spend beyond the budget', () => {
    expect(useParkStore.getState().spend(STARTING_BUDGET + 1)).toBe(false)
    expect(useParkStore.getState().spend(1000)).toBe(true)
    expect(useParkStore.getState().budget).toBe(STARTING_BUDGET - 1000)
  })

  it('changes tool and simulation state', () => {
    useParkStore.getState().setTool('place')
    useParkStore.getState().setRunning(true)
    expect(useParkStore.getState().tool).toBe('place')
    expect(useParkStore.getState().simulation.running).toBe(true)
  })
})
