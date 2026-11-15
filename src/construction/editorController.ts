import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import type { ParkGeometry } from '../geography/parkGeometry'
import { BLOCKS_SOURCE_ID, HIGHLIGHT_LAYER_ID, PREVIEW_SOURCE_ID } from '../geography/constructionLayers'
import { lngLatToLocal, localToLngLat } from '../geography/projection'
import { type RemoveTarget, useEditorStore } from '../store/editorStore'
import { getConstructionGrid, useParkStore } from '../store/parkStore'
import { dist, distToRingEdge, pointInRing, type Vec2 } from '../utils/geometry2d'
import { facilityRing } from './facilities'
import { itemRadius } from './placement'
import type { PlacedItem } from './types'
import { AREA_TYPES, type BlockShape, type ConstructionBlock, FACILITY_TYPES, facilityShape, facilityShapeRing, PATH_TYPES, smoothLine, snapToLines } from './blocks'

/** Path ends snap to entrances and path ends within this distance (m)… */
const SNAP_POINT_M = 6
/** …or else onto any existing path within this distance (m). */
const SNAP_LINE_M = 4
const ROTATE_STEP = Math.PI / 12

const ll = ([x, z]: Vec2) => localToLngLat([x, 0, z])
const closed = (ring: Vec2[]) => [...ring, ring[0]].map(ll)

/** Area blocks are drawn from the cells they still own, so cut-outs (paths, skipped ground) show truthfully. */
function cellPolygons(cells: number[]): number[][][][] {
  const grid = getConstructionGrid()!
  const rows = new Map<number, number[]>()
  for (const idx of cells) {
    const j = Math.floor(idx / grid.w)
    const list = rows.get(j)
    if (list) list.push(idx % grid.w)
    else rows.set(j, [idx % grid.w])
  }
  const polys: number[][][][] = []
  for (const [j, is] of rows) {
    is.sort((a, b) => a - b)
    for (let k = 0; k < is.length; ) {
      let e = k
      while (e + 1 < is.length && is[e + 1] === is[e] + 1) e++
      const [x0, x1, z0, z1] = [grid.x0 + is[k], grid.x0 + is[e] + 1, grid.z0 + j, grid.z0 + j + 1]
      polys.push([closed([[x0, z0], [x1, z0], [x1, z1], [x0, z1]])])
      k = e + 1
    }
  }
  return polys
}

function blockFeatures(blocks: readonly ConstructionBlock[]): FeatureCollection {
  const owned = getConstructionGrid()?.ownedCells() ?? new Map<string, number[]>()
  const features: Feature[] = []
  for (const b of blocks) {
    const s = b.shape
    if (s.kind === 'path') {
      const t = PATH_TYPES[s.type]
      features.push({ type: 'Feature', properties: { id: b.id, kind: 'path', color: t.color, edge: t.edge, w: s.width }, geometry: { type: 'LineString', coordinates: s.line.map(ll) } })
    } else if (s.kind === 'area') {
      const cells = owned.get(b.id)
      if (cells?.length) features.push({ type: 'Feature', properties: { id: b.id, kind: 'area', color: AREA_TYPES[s.type].color }, geometry: { type: 'MultiPolygon', coordinates: cellPolygons(cells) } })
    } else {
      features.push({ type: 'Feature', properties: { id: b.id, kind: 'facility', color: FACILITY_TYPES[s.type].color }, geometry: { type: 'Polygon', coordinates: [closed(facilityShapeRing(s))] } })
    }
  }
  return { type: 'FeatureCollection', features }
}

function shapeGeometry(s: BlockShape): { geometry: Geometry; w?: number } {
  if (s.kind === 'path') return { geometry: { type: 'LineString', coordinates: s.line.map(ll) }, w: s.width }
  if (s.kind === 'facility') return { geometry: { type: 'Polygon', coordinates: [closed(facilityShapeRing(s))] } }
  if (s.mode === 'polygon') return { geometry: { type: 'Polygon', coordinates: [closed(s.ring)] } }
  const stroke = s.stroke.length > 1 ? s.stroke : [s.stroke[0], [s.stroke[0][0] + 0.01, s.stroke[0][1]] as Vec2]
  return { geometry: { type: 'LineString', coordinates: stroke.map(ll) }, w: s.radius * 2 }
}

/**
 * Turns mouse input on the map into construction shapes (drag to draw paths and
 * brush strokes, click polygon corners, hover and click to place facilities or
 * pick a block to remove), and draws built blocks and the placement preview.
 */
export function attachConstructionEditor(map: MapLibreMap, geo: ParkGeometry): () => void {
  const editor = useEditorStore
  const toLocal = (e: MapMouseEvent): Vec2 => {
    const [x, , z] = lngLatToLocal([e.lngLat.lng, e.lngLat.lat])
    return [x, z]
  }

  // Snap targets: OSM path ends near the boundary are the park entrances.
  const entrances = geo.paths.flatMap((l) => [l[0], l[l.length - 1]]).filter((p) => distToRingEdge(p, geo.outer) < 15)
  const snap = (p: Vec2): Vec2 => {
    const builtPaths = useParkStore.getState().blocks.flatMap((b) => (b.shape.kind === 'path' ? [b.shape.line] : []))
    const ends = [...entrances, ...geo.paths.flatMap((l) => [l[0], l[l.length - 1]]), ...builtPaths.flatMap((l) => [l[0], l[l.length - 1]])]
    let best: Vec2 | null = null
    for (const q of ends) if (dist(p, q) < SNAP_POINT_M && (!best || dist(p, q) < dist(p, best))) best = q
    return best ?? snapToLines(p, [...geo.paths, ...builtPaths], SNAP_LINE_M)
  }

  /** What the Remove tool points at: an object, else a constructed block, else an existing court or field. */
  const pickTarget = (p: Vec2): RemoveTarget | null => {
    const park = useParkStore.getState()
    let best: PlacedItem | null = null
    let bestD = Infinity
    for (const it of park.placedItems) {
      const d = dist(p, [it.position[0], it.position[2]])
      if (d < Math.max(itemRadius(it), 1.2) && d < bestD) [best, bestD] = [it, d]
    }
    if (best) {
      const owner = park.blockOfItem(best.id)
      return owner ? { type: 'block', id: owner.id } : { type: 'item', id: best.id }
    }
    const block = getConstructionGrid()?.blockAt(p)
    if (block) return { type: 'block', id: block.id }
    const f = park.facilities.find((x) => !x.id.startsWith('block-') && pointInRing(p, facilityRing(x)))
    return f ? { type: 'facility', id: f.id } : null
  }

  let stroke: Vec2[] | null = null
  let frame = 0
  const pathFrom = (raw: Vec2[], final: boolean): BlockShape => {
    const s = editor.getState()
    const pts = [snap(raw[0]), ...raw.slice(1, -1), final ? snap(raw[raw.length - 1]) : raw[raw.length - 1]]
    return { kind: 'path', type: s.pathType, width: s.pathWidth, line: smoothLine(raw.length > 1 ? pts : [pts[0]]) }
  }
  const strokeShape = (raw: Vec2[], final: boolean): BlockShape => {
    const s = editor.getState()
    return s.mode === 'path' ? pathFrom(raw, final) : { kind: 'area', type: s.areaType, mode: 'brush', stroke: smoothLine(raw, 1), radius: s.brushRadius }
  }
  const drawsStrokes = () => {
    const s = editor.getState()
    return s.mode === 'path' || (s.mode === 'area' && s.areaTool === 'brush')
  }

  const onDown = (e: MapMouseEvent) => {
    if (e.originalEvent.button !== 0 || !drawsStrokes()) return
    e.preventDefault()
    map.dragPan.disable()
    stroke = [toLocal(e)]
    editor.getState().setDraft(strokeShape(stroke, false))
  }
  const onMove = (e: MapMouseEvent) => {
    const s = editor.getState()
    const p = toLocal(e)
    if (s.mode === 'browse') return
    if (stroke) {
      if (dist(p, stroke[stroke.length - 1]) < 0.5) return
      stroke.push(p)
      // Re-check at most once per frame while dragging.
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => stroke && editor.getState().setDraft(strokeShape(stroke, false)))
      return
    }
    if (s.mode === 'facility' && !s.fixed) {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => editor.getState().setDraft(facilityShape(s.facilityType, p, editor.getState().facilityAngle)))
    } else if (s.mode === 'area' && s.areaTool === 'polygon' && s.polygon.length > 0 && !s.fixed) {
      s.setDraft({ kind: 'area', type: s.areaType, mode: 'polygon', ring: [...s.polygon, p] })
    } else if (s.mode === 'remove') {
      const t = pickTarget(p)
      s.setHoverTarget(t)
      map.getCanvas().style.cursor = t ? 'pointer' : ''
    }
  }
  const onUp = (e: MapMouseEvent) => {
    if (!stroke) return
    stroke.push(toLocal(e))
    cancelAnimationFrame(frame)
    editor.getState().setDraft(strokeShape(stroke, true), true)
    stroke = null
    map.dragPan.enable()
  }
  const onClick = (e: MapMouseEvent) => {
    const s = editor.getState()
    const p = toLocal(e)
    if (s.mode === 'facility') {
      cancelAnimationFrame(frame)
      s.setDraft(facilityShape(s.facilityType, p, s.facilityAngle), true)
    } else if (s.mode === 'remove') {
      s.setRemoveTarget(pickTarget(p))
    } else if (s.mode === 'area' && s.areaTool === 'polygon') {
      if (s.fixed) s.cancel()
      const corners = s.fixed ? [] : s.polygon
      // Clicking the first corner closes the polygon.
      if (corners.length >= 3 && dist(p, corners[0]) < 3) return finishPolygon()
      const next = [...corners, p]
      s.setPolygon(next)
      s.setDraft({ kind: 'area', type: s.areaType, mode: 'polygon', ring: next })
    }
  }
  const finishPolygon = () => {
    const s = editor.getState()
    // A double-click also fired two clicks at the same spot; drop the duplicate.
    const corners = s.polygon.filter((p, i, a) => i === 0 || dist(p, a[i - 1]) > 0.5)
    if (corners.length < 3) return
    s.setDraft({ kind: 'area', type: s.areaType, mode: 'polygon', ring: corners }, true)
    s.setPolygon([])
  }
  const onDblClick = (e: MapMouseEvent) => {
    const s = editor.getState()
    if (s.mode !== 'area' || s.areaTool !== 'polygon') return
    e.preventDefault()
    finishPolygon()
  }
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.('input[type=text], textarea')) return
    const s = editor.getState()
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      return e.shiftKey ? s.redo() : s.undo()
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      return s.redo()
    }
    if (s.mode === 'browse') return
    if (e.key === 'Escape') s.cancel()
    else if (e.key === 'Enter') s.confirm()
    else if (s.mode === 'facility' && e.key.toLowerCase() === 'r') {
      const angle = s.facilityAngle + (e.shiftKey ? -ROTATE_STEP : ROTATE_STEP)
      s.set({ facilityAngle: angle })
      const d = editor.getState().draft
      if (d?.kind === 'facility') s.setDraft({ ...d, angle }, s.fixed)
    }
  }

  map.on('mousedown', onDown)
  map.on('mousemove', onMove)
  map.on('mouseup', onUp)
  map.on('click', onClick)
  map.on('dblclick', onDblClick)
  window.addEventListener('keydown', onKey)

  // Rendering.
  const blocksSource = () => map.getSource(BLOCKS_SOURCE_ID) as GeoJSONSource | undefined
  const previewSource = () => map.getSource(PREVIEW_SOURCE_ID) as GeoJSONSource | undefined
  const drawBlocks = () => blocksSource()?.setData(blockFeatures(useParkStore.getState().blocks))
  const drawPreview = () => {
    const s = editor.getState()
    const features: Feature[] = []
    if (s.draft) {
      const { geometry, w } = shapeGeometry(s.draft)
      features.push({ type: 'Feature', properties: { valid: s.plan?.ok ?? false, w: w ?? 0 }, geometry })
    }
    for (const p of s.polygon) features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: ll(p) } })
    for (const it of s.plan?.displaced ?? []) features.push({ type: 'Feature', properties: { displaced: true }, geometry: { type: 'Point', coordinates: ll([it.position[0], it.position[2]]) } })
    const target = s.removeTarget ?? (s.mode === 'remove' ? s.hoverTarget : null)
    const park = useParkStore.getState()
    if (target?.type === 'item') {
      const it = park.placedItems.find((x) => x.id === target.id)
      if (it) features.push({ type: 'Feature', properties: { target: true }, geometry: { type: 'Point', coordinates: ll([it.position[0], it.position[2]]) } })
    } else if (target?.type === 'facility') {
      const f = park.facilities.find((x) => x.id === target.id)
      if (f) features.push({ type: 'Feature', properties: { valid: false }, geometry: { type: 'Polygon', coordinates: [closed(facilityRing(f))] } })
    }
    previewSource()?.setData({ type: 'FeatureCollection', features })
    const highlight = target?.type === 'block' ? target.id : ''
    if (map.getLayer(HIGHLIGHT_LAYER_ID)) map.setFilter(HIGHLIGHT_LAYER_ID, ['==', ['get', 'id'], highlight])
  }
  drawBlocks()
  drawPreview()
  const unsubPark = useParkStore.subscribe((s, prev) => {
    if (s.gridVersion !== prev.gridVersion || s.blocks !== prev.blocks) {
      drawBlocks()
      drawPreview()
    }
  })
  const unsubEditor = editor.subscribe((s, prev) => {
    if (s.draft !== prev.draft || s.plan !== prev.plan || s.polygon !== prev.polygon || s.hoverTarget !== prev.hoverTarget || s.removeTarget !== prev.removeTarget || s.mode !== prev.mode) drawPreview()
    // Double-click zoom would fight polygon drawing.
    if (s.mode !== prev.mode) {
      if (s.mode === 'area') map.doubleClickZoom.disable()
      else map.doubleClickZoom.enable()
      map.getCanvas().style.cursor = s.mode === 'browse' || s.mode === 'remove' ? '' : 'crosshair'
    }
  })

  return () => {
    cancelAnimationFrame(frame)
    map.off('mousedown', onDown)
    map.off('mousemove', onMove)
    map.off('mouseup', onUp)
    map.off('click', onClick)
    map.off('dblclick', onDblClick)
    window.removeEventListener('keydown', onKey)
    unsubPark()
    unsubEditor()
  }
}
