import { create } from 'zustand'
import { type AreaType, type BlockShape, blockLabel, type FacilityType, PATH_TYPES, type PathType } from '../construction/blocks'
import { catalogEntry } from '../construction/catalog'
import { LEVEL } from '../construction/level'
import type { PlacementPlan } from '../construction/placement'
import type { Vec2 } from '../utils/geometry2d'
import { useParkStore } from './parkStore'

/** browse: the map behaves normally; the others are the construction modes. */
export type EditorMode = 'browse' | 'path' | 'area' | 'facility' | 'remove'
export type AreaTool = 'brush' | 'polygon'

/** Something the Remove tool can delete: a constructed block, or an object or facility that was already in the park. */
export interface RemoveTarget {
  type: 'block' | 'item' | 'facility'
  id: string
}
export const sameTarget = (a: RemoveTarget | null, b: RemoveTarget | null) => a === b || (!!a && !!b && a.type === b.type && a.id === b.id)

export interface EditorMessage {
  text: string
  tone: 'ok' | 'error'
}

/** UI state of the park editor (the construction dock under the map). */
export interface EditorState {
  panelOpen: boolean
  mode: EditorMode
  pathType: PathType
  pathWidth: number
  areaType: AreaType
  areaTool: AreaTool
  brushRadius: number
  facilityType: FacilityType
  /** Facility rotation, radians from local +x (street-aligned at 0). */
  facilityAngle: number
  /** Shape being drawn or hovered, or waiting for confirmation when `fixed`. */
  draft: BlockShape | null
  fixed: boolean
  plan: PlacementPlan | null
  /** Corners of a polygon being drawn. */
  polygon: Vec2[]
  hoverTarget: RemoveTarget | null
  /** Chosen for removal, waiting for confirmation. */
  removeTarget: RemoveTarget | null
  message: EditorMessage | null
  setPanelOpen: (open: boolean) => void
  setMode: (mode: EditorMode) => void
  set: (patch: Partial<Pick<EditorState, 'pathType' | 'pathWidth' | 'areaType' | 'areaTool' | 'brushRadius' | 'facilityType' | 'facilityAngle'>>) => void
  setDraft: (draft: BlockShape | null, fixed?: boolean) => void
  setPolygon: (polygon: Vec2[]) => void
  setHoverTarget: (t: RemoveTarget | null) => void
  setRemoveTarget: (t: RemoveTarget | null) => void
  /** Builds the pending draft or removes the pending block. */
  confirm: () => void
  cancel: () => void
  undo: () => void
  redo: () => void
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`
const cleared = { draft: null, fixed: false, plan: null, polygon: [], removeTarget: null }

export const useEditorStore = create<EditorState>()((set, get) => ({
  panelOpen: true,
  mode: 'browse',
  pathType: 'walking_trail',
  pathWidth: PATH_TYPES.walking_trail.defaultWidth,
  areaType: 'woodland',
  areaTool: 'brush',
  brushRadius: 5,
  facilityType: 'playground',
  facilityAngle: 0,
  ...cleared,
  hoverTarget: null,
  message: null,
  setPanelOpen: (panelOpen) => set(panelOpen ? { panelOpen } : { panelOpen, mode: 'browse', ...cleared, hoverTarget: null }),
  setMode: (mode) => set({ mode, ...cleared, hoverTarget: null, message: null }),
  set: (patch) => {
    if (patch.pathType && !('pathWidth' in patch)) patch = { ...patch, pathWidth: PATH_TYPES[patch.pathType].defaultWidth }
    set(patch)
    // Re-check a pending draft with the new settings.
    const { draft, fixed } = get()
    if (!draft) return
    let next: BlockShape = draft
    if (draft.kind === 'path') next = { ...draft, type: get().pathType, width: get().pathWidth }
    else if (draft.kind === 'area') next = draft.mode === 'brush' ? { ...draft, type: get().areaType, radius: get().brushRadius } : { ...draft, type: get().areaType }
    else if (draft.kind === 'facility' && (patch.facilityAngle !== undefined || patch.facilityType)) next = fixed ? { ...draft, angle: get().facilityAngle } : draft
    if (next !== draft) get().setDraft(next, fixed)
  },
  setDraft: (draft, fixed = false) => set({ draft, fixed, plan: draft ? useParkStore.getState().previewBlock(draft) : null, message: null }),
  setPolygon: (polygon) => set({ polygon }),
  setHoverTarget: (t) => !sameTarget(get().hoverTarget, t) && set({ hoverTarget: t }),
  setRemoveTarget: (removeTarget) => set({ removeTarget, message: null }),
  confirm: () => {
    const { draft, fixed, removeTarget, mode } = get()
    const park = useParkStore.getState()
    if (removeTarget) {
      const info = describeTarget(removeTarget)
      const ok =
        removeTarget.type === 'block' ? park.removeBlock(removeTarget.id) : removeTarget.type === 'item' ? park.demolishItem(removeTarget.id) : park.demolishFacility(removeTarget.id)
      if (ok && info) {
        const money_ = info.refund > 0 ? `refunded ${money(info.refund)}` : `demolition cost ${money(info.cost)}`
        set({ ...cleared, hoverTarget: null, message: { tone: 'ok', text: `Removed ${info.label.toLowerCase()}; ${money_}.` } })
      } else set({ message: { tone: 'error', text: 'Not enough funds to demolish this.' } })
      return
    }
    if (!draft || !fixed) return
    const r = park.buildBlock(draft)
    if (r?.blockId) {
      set({ ...cleared, message: { tone: 'ok', text: `Built ${blockLabel(draft).toLowerCase()} for ${money(r.cost)}.` } })
      // Keep a facility preview under the cursor so the next one can be placed straight away.
      if (mode === 'facility') set({ draft: null })
    } else set({ plan: r, message: { tone: 'error', text: r?.reasons[0] ?? 'Cannot build here.' } })
  },
  cancel: () => set({ ...cleared, message: null }),
  undo: () => {
    const ok = useParkStore.getState().undo()
    set({ ...cleared, message: ok ? { tone: 'ok', text: 'Undone.' } : { tone: 'error', text: 'Nothing to undo, or not enough funds.' } })
  },
  redo: () => {
    const ok = useParkStore.getState().redo()
    set({ ...cleared, message: ok ? { tone: 'ok', text: 'Redone.' } : { tone: 'error', text: 'Nothing to redo, or not enough funds.' } })
  },
}))

/** Label and money for a removal target: constructed blocks refund part of their cost, existing things cost demolition. */
export function describeTarget(t: RemoveTarget): { label: string; refund: number; cost: number; detail?: string } | null {
  const park = useParkStore.getState()
  if (t.type === 'block') {
    const b = park.blocks.find((x) => x.id === t.id)
    if (!b) return null
    const refund = Math.round(b.cost * LEVEL.economy.removalRefundRate)
    return {
      label: blockLabel(b.shape),
      refund,
      cost: 0,
      detail: `${Math.round(LEVEL.economy.removalRefundRate * 100)}% of ${money(b.cost)}${b.displaced.length ? `; ${b.displaced.length} objects it replaced come back` : ''}`,
    }
  }
  if (t.type === 'item') {
    const it = park.placedItems.find((x) => x.id === t.id)
    if (!it) return null
    let label = it.assetId.replace(/_/g, ' ')
    try {
      label = catalogEntry(it.assetId).label
    } catch {
      /* not in the catalogue: use the asset id */
    }
    return { label, refund: 0, cost: LEVEL.economy.existingRemoval.itemCost }
  }
  const f = park.facilities.find((x) => x.id === t.id)
  return f ? { label: f.name, refund: 0, cost: LEVEL.economy.existingRemoval.facilityCost, detail: 'its ground becomes free to build on' } : null
}
