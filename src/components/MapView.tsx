import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../geography/maplibreSetup'
import type { FeatureCollection } from 'geojson'
import { useEffect, useRef } from 'react'
import { demoCitizens } from '../citizens/characters'
import { facilityRing, planFacilities } from '../construction/facilities'
import { generateInitialLayout } from '../construction/initialLayout'
import { makeTransformConstrain } from '../geography/cameraBounds'
import { BASEMAP_STYLE_URL, CAMERA_LIMITS, INITIAL_CAMERA, PARK_MAP_URL } from '../geography/constants'
import { hoverInfoAt } from '../geography/hoverInfo'
import { collectLandmarks, landmarkToMarker } from '../geography/landmarks'
import { buildLocalGrid } from '../geography/localGrid'
import { parseParkGeometry } from '../geography/parkGeometry'
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
import { MarkerOverlay } from '../scene/markerOverlay'
import { ParkWorld } from '../scene/three/ParkWorld'
import { createThreeLayer } from '../scene/three/threeLayer'
import { useMapStore } from '../store/mapStore'
import { useParkStore } from '../store/parkStore'

/** First basemap layer of each group, used to slot our layers into the right z-order. */
const BEFORE_ROADS = 'tunnel_motorway_link_casing'
const BEFORE_BUILDINGS = 'building'
const BEFORE_3D_BUILDINGS = 'building-3d'

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
      center: [...INITIAL_CAMERA.center],
      zoom: INITIAL_CAMERA.zoom,
      pitch: INITIAL_CAMERA.pitch,
      bearing: INITIAL_CAMERA.bearing,
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
        PARK_LINE_LAYERS.forEach((l) => map.addLayer(l, BEFORE_BUILDINGS))
        PARK_BOUNDARY_LAYERS.forEach((l) => map.addLayer(l, BEFORE_BUILDINGS))
        LOCAL_GRID_LAYERS.forEach((l) => map.addLayer({ ...l, layout: { ...l.layout, visibility: 'none' } }))

        // Quiet basemap: white translucent buildings, and no flat POI icons (replaced by floating landmarks).
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
        const w = world
        const syncPark = (s = useParkStore.getState()) => {
          w.setItems(s.placedItems)
          w.setFacilities(s.facilities)
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
        unsubscribeItems = useParkStore.subscribe((s, prev) => {
          if (s.placedItems !== prev.placedItems || s.facilities !== prev.facilities || s.facilitiesInUse !== prev.facilitiesInUse) syncPark(s)
        })
        void w.setCitizens(demoCitizens(geo, useParkStore.getState().placedItems))

        syncCamera()
        setStatus('ready')
      } catch (err) {
        console.error(err)
        setStatus('error', err instanceof Error ? err.message : String(err))
      }
    })
    map.on('error', (e) => console.error('MapLibre error:', e.error?.message ?? e))

    // Landmarks come from the vector tiles, so refresh them as tiles load.
    let landmarkTimer: number | undefined
    map.on('idle', () => {
      window.clearTimeout(landmarkTimer)
      landmarkTimer = window.setTimeout(() => {
        overlay.setMarkers('buildings', collectLandmarks(map).map(landmarkToMarker))
        map.triggerRepaint()
      }, 50)
    })

    // Hover tooltip for buildings and park features.
    const tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '260px', className: 'hover-tooltip' })
    let lastHtml: string | null = null
    map.on('mousemove', (e) => {
      if (useMapStore.getState().status !== 'ready' || map.isMoving()) return
      const html = hoverInfoAt(map, e.point, (id) => overlay.findByBuilding(id ?? undefined))
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
    const { setResetView, setRotateBy } = useMapStore.getState()
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
