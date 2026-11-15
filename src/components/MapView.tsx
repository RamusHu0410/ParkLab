import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../geography/maplibreSetup'
import type { FeatureCollection } from 'geojson'
import { useEffect, useRef } from 'react'
import { runCitizens } from '../citizens/runCitizens'
import { facilityRing, type ParkCorner, parkCorner, planFacilities } from '../construction/facilities'
import { attachConstructionEditor } from '../construction/editorController'
import { generateInitialLayout } from '../construction/initialLayout'
import { makeTransformConstrain } from '../geography/cameraBounds'
import { BLOCK_LAYERS, BLOCKS_SOURCE_ID, PREVIEW_LAYERS, PREVIEW_SOURCE_ID } from '../geography/constructionLayers'
import { BASEMAP_STYLE_URL, CAMERA_LIMITS, INITIAL_CAMERA, INTRO_END, INTRO_FINAL, INTRO_FLIGHT_MS, INTRO_START, PARK_MAP_URL } from '../geography/constants'
import { hoverInfoAt } from '../geography/hoverInfo'
import { collectLandmarks, type Landmark } from '../geography/landmarks'
import { buildLocalGrid } from '../geography/localGrid'
import { type ParkGeometry, parseParkGeometry } from '../geography/parkGeometry'
import { localToLngLat } from '../geography/projection'
import {
  BASEMAP_POI_LAYERS,
  BUILDING_STYLE,
  LOCAL_GRID_LAYERS,
  LOCAL_GRID_SOURCE_ID,
  PARK_BOUNDARY_LAYERS,
  PARK_FILL_LAYERS,
  PARK_LINE_LAYERS,
  PARK_SOURCE_ID,
  PROPOSED_FILL_LAYER,
  PROPOSED_SOURCE_ID,
} from '../geography/parkLayers'
import { facilityMarkers } from '../scene/facilityMarkers'
import { violationMarkers } from '../scene/violationMarkers'
import { CLEARANCE_M } from '../construction/rules'
import { MarkerOverlay } from '../scene/markerOverlay'
import { ParkWorld } from '../scene/three/ParkWorld'
import { createThreeLayer } from '../scene/three/threeLayer'
import { buildWelcomeGate, GATE } from '../scene/three/welcomeGate'
import { type ParkGrid, TERRAIN } from '../construction/parkGrid'
import { itemRadius } from '../construction/placement'
import type { PlacedItem } from '../construction/types'
import { pointAlong, polylineLength, type Vec2 } from '../utils/geometry2d'
import { useEditorStore } from '../store/editorStore'
import { useMapStore } from '../store/mapStore'
import { initConstructionGrid, useParkStore } from '../store/parkStore'

/** First basemap layer of each group, used to slot our layers into the right z-order. */
const BEFORE_ROADS = 'tunnel_motorway_link_casing'
const BEFORE_BUILDINGS = 'building'
const BEFORE_3D_BUILDINGS = 'building-3d'

const GATE_CORNERS: ParkCorner[] = ['castlemore-mingay', 'burOak-mingay', 'castlemore-royRainey', 'burOak-royRainey']
/** How far from a park corner a gate may move to find open ground (m). */
const GATE_SEARCH_M = 40

/**
 * Puts a "Wismer Park Welcomes you" gate at each corner of the park, on the
 * nearest open ground that doesn't overlap paths, objects, facilities or another
 * gate. A corner with no free ground within GATE_SEARCH_M gets no gate.
 * Each gate faces out of the park, towards the street corner, and its footprint is reserved in the grid.
 */
function placeWelcomeGates(world: ParkWorld, grid: ParkGrid, geo: ParkGeometry, items: PlacedItem[]) {
  const pathPoints = geo.paths.flatMap((line) => {
    const pts: { p: Vec2; r: number }[] = []
    const total = polylineLength(line)
    for (let d = 0; d <= total; d += 2) pts.push({ p: pointAlong(line, d).p, r: 2 })
    return pts
  })
  const obstacles = [...items.map((it) => ({ p: [it.position[0], it.position[2]] as Vec2, r: itemRadius(it) + 1 })), ...pathPoints]
  const r = GATE.width / 2 + 1.5
  for (const corner of GATE_CORNERS) {
    const c = parkCorner(geo, corner)
    // Gates may stand at the edge of the woodlot or valley (trees are still avoided as obstacles).
    const spot = grid.findOpenSpot(c, r, obstacles, GATE_SEARCH_M, TERRAIN.outside | TERRAIN.water | TERRAIN.existing)
    if (!spot) {
      console.warn(`No open space for a welcome gate at the ${corner} corner`)
      continue
    }
    const len = Math.hypot(c[0] - spot[0], c[1] - spot[1]) || 1
    const front: Vec2 = [(c[0] - spot[0]) / len, (c[1] - spot[1]) / len]
    const gate = buildWelcomeGate()
    gate.name = `welcome-gate-${corner}`
    gate.position.set(spot[0], 0, spot[1])
    gate.rotation.y = Math.atan2(front[0], front[1])
    world.scene.add(gate)
    obstacles.push({ p: spot, r })
    const along: Vec2 = [front[1], -front[0]]
    const [hw, hd] = [GATE.width / 2 + 1, GATE.depth / 2 + 1]
    grid.reserve(`welcome-gate-${corner}`, [
      [spot[0] + along[0] * hw + front[0] * hd, spot[1] + along[1] * hw + front[1] * hd],
      [spot[0] - along[0] * hw + front[0] * hd, spot[1] - along[1] * hw + front[1] * hd],
      [spot[0] - along[0] * hw - front[0] * hd, spot[1] - along[1] * hw - front[1] * hd],
      [spot[0] + along[0] * hw - front[0] * hd, spot[1] + along[1] * hw - front[1] * hd],
    ])
  }
  world.onChange()
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const overlayRef = useRef<MarkerOverlay | null>(null)
  const showLocalGrid = useMapStore((s) => s.showLocalGrid)
  const show3dBuildings = useMapStore((s) => s.show3dBuildings)
  const showIcons = useMapStore((s) => s.showIcons)
  const loaded = useMapStore((s) => s.status === 'ready')

  useEffect(() => {
    const { setStatus, setCamera } = useMapStore.getState()
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: BASEMAP_STYLE_URL,
      // The intro screen opens here, then flies to INTRO_END.
      center: [...INTRO_START.center],
      zoom: INTRO_START.zoom,
      pitch: INTRO_START.pitch,
      bearing: INTRO_START.bearing,
      ...CAMERA_LIMITS,
      transformConstrain: makeTransformConstrain(CAMERA_LIMITS.minZoom),
      // Rotation: right-drag or Ctrl+drag (mouse/trackpad), two-finger twist (touch), Shift+←/→ (keyboard).
      dragRotate: true,
      touchZoomRotate: true,
      keyboard: true,
      canvasContextAttributes: { antialias: true },
      attributionControl: { compact: false, customAttribution: 'Park boundaries © City of Markham' },
    })
    mapRef.current = map
    setStatus('loading')

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), 'top-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 160 }), 'bottom-left')

    const overlay = new MarkerOverlay(map.getCanvasContainer())
    overlayRef.current = overlay

    const syncCamera = () => {
      const c = map.getCenter()
      setCamera({ lng: c.lng, lat: c.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() })
    }
    map.on('move', syncCamera)

    let world: ParkWorld | null = null
    let unsubscribeItems = () => {}
    let stopCitizens = () => {}
    let detachEditor = () => {}

    map.on('load', async () => {
      try {
        const res = await fetch(PARK_MAP_URL)
        if (!res.ok) throw new Error(`${PARK_MAP_URL}: HTTP ${res.status}`)
        const geojson = (await res.json()) as FeatureCollection
        map.addSource(PARK_SOURCE_ID, { type: 'geojson', data: geojson })
        map.addSource(LOCAL_GRID_SOURCE_ID, { type: 'geojson', data: buildLocalGrid() })

        map.addSource(PROPOSED_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        PARK_FILL_LAYERS.forEach((l) => map.addLayer(l, BEFORE_ROADS))
        map.addLayer(PROPOSED_FILL_LAYER, BEFORE_ROADS)
        map.addSource(BLOCKS_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addSource(PREVIEW_SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        BLOCK_LAYERS.forEach((l) => map.addLayer(l, BEFORE_ROADS))
        PARK_LINE_LAYERS.forEach((l) => map.addLayer(l, BEFORE_BUILDINGS))
        PARK_BOUNDARY_LAYERS.forEach((l) => map.addLayer(l, BEFORE_BUILDINGS))
        LOCAL_GRID_LAYERS.forEach((l) => map.addLayer({ ...l, layout: { ...l.layout, visibility: 'none' } }))

        // Quiet basemap: white translucent buildings, and no POI icons (building names show on hover instead).
        for (const id of BASEMAP_POI_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
        if (map.getLayer('building-3d')) {
          map.setPaintProperty('building-3d', 'fill-extrusion-color', BUILDING_STYLE.color)
          map.setPaintProperty('building-3d', 'fill-extrusion-opacity', BUILDING_STYLE.opacity)
        }

        // 3D park objects and citizens, drawn into the map's WebGL context.
        const geo = parseParkGeometry(geojson as never)
        world = new ParkWorld(geo.outer)
        map.addLayer(createThreeLayer(world, (m) => overlay.update(m, map.getCanvas().clientWidth, map.getCanvas().clientHeight)), BEFORE_3D_BUILDINGS)

        const park = useParkStore.getState()
        if (park.placedItems.length === 0) {
          const facilities = planFacilities(geo)
          park.loadLayout(generateInitialLayout(geo, facilities), facilities)
        }
        // Construction grid: the park ground, with real features that new blocks may not overlap.
        const state = useParkStore.getState()
        const grid = initConstructionGrid({
          outer: geo.outer,
          woodlot: geo.woodlot,
          valley: geo.valley,
          streams: geo.streams,
          existing: [
            ...geo.playgrounds.map((a) => ({ id: `area-${a.sourceId}`, ring: a.ring, clearance: { metres: CLEARANCE_M.playground, what: 'playground fall zone' } })),
            ...geo.parking.map((a) => ({ id: `area-${a.sourceId}`, ring: a.ring })),
            ...state.facilities
              .filter((f) => !f.id.startsWith('block-'))
              .map((f) => ({ id: f.id, ring: facilityRing(f), clearance: { metres: CLEARANCE_M.sports, what: 'sports run-off area' } })),
          ],
        })
        PREVIEW_LAYERS.forEach((l) => map.addLayer(l, BEFORE_3D_BUILDINGS))
        detachEditor = attachConstructionEditor(map, geo)
        placeWelcomeGates(world, grid, geo, state.placedItems)
        const w = world
        // Demolished OSM courts and fields are hidden from the base map layers too.
        const osmFacilities = state.facilities.filter((f) => f.basis === 'osm' && f.sourceId)
        const baseFilters = new Map(['park-facilities', 'park-facility-lines'].map((id) => [id, map.getFilter(id)]))
        let lastRemoved = ''
        const syncPark = (s = useParkStore.getState()) => {
          w.setItems(s.placedItems)
          w.setFacilities(s.facilities)
          const present = new Set(s.facilities.map((f) => f.id))
          const removed = osmFacilities.filter((f) => !present.has(f.id)).map((f) => f.sourceId!)
          if (removed.join() !== lastRemoved) {
            lastRemoved = removed.join()
            for (const [id, base] of baseFilters) map.setFilter(id, ['all', base as never, ['!', ['in', ['get', 'osm_id'], ['literal', removed]]]])
          }
          const proposed = s.facilities.filter((f) => f.basis === 'proposed')
          ;(map.getSource(PROPOSED_SOURCE_ID) as maplibregl.GeoJSONSource).setData({
            type: 'FeatureCollection',
            features: proposed.map((f) => ({
              type: 'Feature',
              properties: { category: f.kind === 'soccer_field' ? 'sports_field' : f.kind, name: f.name, verification: 'proposed', source: 'ParkLab design' },
              geometry: { type: 'Polygon', coordinates: [[...facilityRing(f), facilityRing(f)[0]].map(([x, z]) => localToLngLat([x, 0, z]))] },
            })),
          })
          overlay.setMarkers('facilities', facilityMarkers(geo, s.facilities, s.placedItems, s.facilitiesInUse))
        }
        syncPark()
        // "!" over blocks that break a siting rule.
        overlay.setMarkers('violations', violationMarkers(useParkStore.getState().blocks))
        unsubscribeItems = useParkStore.subscribe((s, prev) => {
          if (s.placedItems !== prev.placedItems || s.facilities !== prev.facilities || s.facilitiesInUse !== prev.facilitiesInUse) syncPark(s)
          if (s.blocks !== prev.blocks) overlay.setMarkers('violations', violationMarkers(s.blocks))
        })
        stopCitizens = runCitizens(map, w, geo)

        syncCamera()
        setStatus('ready')
        // The intro flight starts when the player picks the level on the intro screen.
      } catch (err) {
        console.error(err)
        setStatus('error', err instanceof Error ? err.message : String(err))
      }
    })
    map.on('error', (e) => console.error('MapLibre error:', e.error?.message ?? e))

    // Named places inside buildings (school, church…), used for hover tooltips only; no icons are drawn.
    // They come from the vector tiles, so refresh them as tiles load.
    let landmarks = new Map<string | number, Landmark>()
    let landmarkTimer: number | undefined
    map.on('idle', () => {
      window.clearTimeout(landmarkTimer)
      landmarkTimer = window.setTimeout(() => {
        landmarks = new Map(collectLandmarks(map).flatMap((l) => (l.buildingId == null ? [] : [[l.buildingId, l] as const])))
        map.triggerRepaint()
      }, 50)
    })

    // Hover tooltip for buildings and park features.
    const tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '260px', className: 'hover-tooltip' })
    let lastHtml: string | null = null
    map.on('mousemove', (e) => {
      if (useEditorStore.getState().mode !== 'browse') {
        tooltip.remove()
        lastHtml = null
        return
      }
      if (useMapStore.getState().status !== 'ready' || map.isMoving()) return
      const html = hoverInfoAt(map, e.point, (id) => {
        const l = id == null ? undefined : landmarks.get(id)
        return l && { key: l.key, icon: l.icon, name: l.name, kind: l.kind, lngLat: l.lngLat, height: l.roofHeight }
      })
      map.getCanvas().style.cursor = html ? 'pointer' : ''
      if (!html) {
        tooltip.remove()
        lastHtml = null
        return
      }
      if (html !== lastHtml) tooltip.setHTML(html)
      lastHtml = html
      tooltip.setLngLat(e.lngLat)
      if (!tooltip.isOpen()) tooltip.addTo(map)
    })
    const hideTooltip = () => {
      tooltip.remove()
      lastHtml = null
    }
    map.getCanvas().addEventListener('mouseleave', hideTooltip)
    map.on('movestart', hideTooltip)

    if (import.meta.env.DEV) Object.assign(window, { parkMap: map, parkWorld: () => world })

    return () => {
      window.clearTimeout(landmarkTimer)
      unsubscribeItems()
      stopCitizens()
      detachEditor()
      tooltip.remove()
      overlay.dispose()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    for (const l of LOCAL_GRID_LAYERS) map.setLayoutProperty(l.id, 'visibility', showLocalGrid ? 'visible' : 'none')
  }, [showLocalGrid, loaded])

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    overlay.visible = showIcons
    mapRef.current?.triggerRepaint()
  }, [showIcons])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded || !map.getLayer('building-3d')) return
    map.setLayoutProperty('building-3d', 'visibility', show3dBuildings ? 'visible' : 'none')
  }, [show3dBuildings, loaded])

  // Camera actions for the panel buttons.
  useEffect(() => {
    const { setResetView, setRotateBy, setPlayIntro } = useMapStore.getState()
    // Intro: start view → INTRO_END → INTRO_FINAL.
    setPlayIntro(() => {
      const map = mapRef.current
      if (!map) return
      map.once('moveend', () => {
        useMapStore.getState().setIntroTitle(true)
        map.once('moveend', () => useMapStore.getState().endIntro())
        map.flyTo({ center: [...INTRO_FINAL.center], zoom: INTRO_FINAL.zoom, pitch: INTRO_FINAL.pitch, bearing: INTRO_FINAL.bearing, duration: INTRO_FLIGHT_MS, essential: true })
      })
      map.flyTo({ center: [...INTRO_END.center], zoom: INTRO_END.zoom, pitch: INTRO_END.pitch, bearing: INTRO_END.bearing, duration: INTRO_FLIGHT_MS, essential: true })
    })
    setResetView(() =>
      mapRef.current?.flyTo({ center: [...INITIAL_CAMERA.center], zoom: INITIAL_CAMERA.zoom, pitch: INITIAL_CAMERA.pitch, bearing: INITIAL_CAMERA.bearing }),
    )
    setRotateBy((deg) => {
      const map = mapRef.current
      if (map) map.easeTo({ bearing: map.getBearing() + deg, duration: 400 })
    })
  }, [])

  return <div ref={containerRef} className="map-container" />
}
