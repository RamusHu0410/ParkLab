import { CATEGORY_STYLE } from '../geography/parkLayers'
import { lngLatToLocal } from '../geography/projection'
import { useMapStore } from '../store/mapStore'

const LEGEND: (keyof typeof CATEGORY_STYLE)[] = [
  'park_area',
  'woodlot',
  'valley',
  'playground',
  'sports_field',
  'tennis_court',
  'basketball_court',
  'stream',
  'path',
  'parking',
  'adjacent_school',
]

export function MapPanel() {
  const status = useMapStore((s) => s.status)
  const error = useMapStore((s) => s.error)
  const camera = useMapStore((s) => s.camera)
  const showLocalGrid = useMapStore((s) => s.showLocalGrid)
  const show3dBuildings = useMapStore((s) => s.show3dBuildings)
  const { toggleLocalGrid, toggle3dBuildings, resetView } = useMapStore.getState()
  const local = camera ? lngLatToLocal([camera.lng, camera.lat]) : null

  return (
    <div className="map-panel">
      <strong>Wismer Park</strong>
      <div className="map-panel__status" data-status={status}>
        {status === 'error' ? `Map error: ${error}` : status === 'ready' ? 'Map ready' : 'Loading map…'}
      </div>

      <ul className="legend">
        <li>
          <span className="swatch swatch--boundary" /> Park boundary (City of Markham)
        </li>
        {LEGEND.map((k) => (
          <li key={k}>
            <span className="swatch" style={{ background: CATEGORY_STYLE[k].color }} /> {CATEGORY_STYLE[k].label}
          </li>
        ))}
      </ul>

      <label>
        <input type="checkbox" checked={show3dBuildings} onChange={toggle3dBuildings} /> 3D buildings
      </label>
      <label>
        <input type="checkbox" checked={showLocalGrid} onChange={toggleLocalGrid} /> Local 100 m grid (UTM 17N)
      </label>
      <button onClick={() => resetView()}>Reset view</button>

      {camera && local && (
        <div className="map-panel__camera">
          {camera.lat.toFixed(5)}, {camera.lng.toFixed(5)} · z{camera.zoom.toFixed(1)} · pitch {camera.pitch.toFixed(0)}° · bearing{' '}
          {camera.bearing.toFixed(0)}°
          <br />
          local x {local[0].toFixed(1)} m, z {local[2].toFixed(1)} m
        </div>
      )}
      <small>OSM features are community-mapped and not verified against an official site map. Click a feature for details.</small>
    </div>
  )
}
