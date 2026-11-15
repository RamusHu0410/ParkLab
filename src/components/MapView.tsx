import * as maplibregl from 'maplibre-gl'
import type { MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../geography/maplibreSetup'
import { useEffect, useRef } from 'react'
import { BASEMAP_STYLE_URL, CAMERA_LIMITS, INITIAL_CAMERA, PARK_MAP_URL } from '../geography/constants'
import { buildLocalGrid } from '../geography/localGrid'
import {
  CATEGORY_STYLE,
  INTERACTIVE_LAYER_IDS,
  LOCAL_GRID_LAYERS,
  LOCAL_GRID_SOURCE_ID,
  PARK_BOUNDARY_LAYERS,
  PARK_FILL_LAYERS,
  PARK_LINE_LAYERS,
  PARK_SOURCE_ID,
  type ParkCategory,
} from '../geography/parkLayers'
import { useMapStore } from '../store/mapStore'

/** First basemap layer of each group, used to slot our layers into the right z-order. */
const BEFORE_ROADS = 'tunnel_motorway_link_casing'
const BEFORE_BUILDINGS = 'building'

function describe(feature: MapGeoJSONFeature): string {
  const p = feature.properties
  const label = CATEGORY_STYLE[p.category as ParkCategory]?.label ?? p.category
  const rows: string[] = [`<strong>${escapeHtml(label)}</strong>`]
  if (p.PARK_NAME) rows.push(`${escapeHtml(p.PARK_NAME)} · ${escapeHtml(p.USE_TYPE)}`)
  if (p.Shape__Area) rows.push(`Area: ${Math.round(p.Shape__Area).toLocaleString()} m²`)
  if (p['osm:sport']) rows.push(`Sport: ${escapeHtml(p['osm:sport'])}`)
  if (p['osm:surface']) rows.push(`Surface: ${escapeHtml(p['osm:surface'])}`)
  if (p['osm:access']) rows.push(`Access: ${escapeHtml(p['osm:access'])}`)
  rows.push(`<em>Source: ${escapeHtml(p.source)} (${escapeHtml(p.verification)})</em>`)
  if (p.osm_id) rows.push(`<small>${escapeHtml(p.osm_id)}</small>`)
  return rows.join('<br/>')
}

function escapeHtml(v: unknown): string {
  return String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const showLocalGrid = useMapStore((s) => s.showLocalGrid)
  const show3dBuildings = useMapStore((s) => s.show3dBuildings)
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
      canvasContextAttributes: { antialias: true },
      attributionControl: { compact: false, customAttribution: 'Park boundaries © City of Markham' },
    })
    mapRef.current = map
    setStatus('loading')

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true, showZoom: true }), 'top-right')
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 160 }), 'bottom-left')

    const syncCamera = () => {
      const c = map.getCenter()
      setCamera({ lng: c.lng, lat: c.lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() })
    }
    map.on('move', syncCamera)

    map.on('load', async () => {
      try {
        const res = await fetch(PARK_MAP_URL)
        if (!res.ok) throw new Error(`${PARK_MAP_URL}: HTTP ${res.status}`)
        map.addSource(PARK_SOURCE_ID, { type: 'geojson', data: await res.json() })
        map.addSource(LOCAL_GRID_SOURCE_ID, { type: 'geojson', data: buildLocalGrid() })

        PARK_FILL_LAYERS.forEach((l) => map.addLayer(l, BEFORE_ROADS))
        PARK_LINE_LAYERS.forEach((l) => map.addLayer(l, BEFORE_BUILDINGS))
        PARK_BOUNDARY_LAYERS.forEach((l) => map.addLayer(l, BEFORE_BUILDINGS))
        LOCAL_GRID_LAYERS.forEach((l) => map.addLayer({ ...l, layout: { ...l.layout, visibility: 'none' } }))

        syncCamera()
        setStatus('ready')
      } catch (err) {
        console.error(err)
        setStatus('error', err instanceof Error ? err.message : String(err))
      }
    })
    map.on('error', (e) => console.error('MapLibre error:', e.error?.message ?? e))

    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
    map.on('click', (e) => {
      const [feature] = map.queryRenderedFeatures(e.point, { layers: INTERACTIVE_LAYER_IDS.filter((id) => map.getLayer(id)) })
      if (!feature) return popup.remove()
      popup.setLngLat(e.lngLat).setHTML(describe(feature)).addTo(map)
    })
    for (const id of INTERACTIVE_LAYER_IDS) {
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''))
    }

    if (import.meta.env.DEV) (window as unknown as { parkMap: maplibregl.Map }).parkMap = map

    return () => {
      popup.remove()
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
    const map = mapRef.current
    if (!map || !loaded || !map.getLayer('building-3d')) return
    map.setLayoutProperty('building-3d', 'visibility', show3dBuildings ? 'visible' : 'none')
  }, [show3dBuildings, loaded])

  // Exposed for the "reset view" button.
  useEffect(() => {
    useMapStore.getState().setResetView(() =>
      mapRef.current?.flyTo({ center: [...INITIAL_CAMERA.center], zoom: INITIAL_CAMERA.zoom, pitch: INITIAL_CAMERA.pitch, bearing: INITIAL_CAMERA.bearing }),
    )
  }, [])

  return <div ref={containerRef} className="map-container" />
}

