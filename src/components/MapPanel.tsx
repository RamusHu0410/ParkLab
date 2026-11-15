import { lngLatToLocal } from '../geography/projection'
import { useMapStore } from '../store/mapStore'

export function MapPanel() {
  const status = useMapStore((s) => s.status)
  const error = useMapStore((s) => s.error)
  const camera = useMapStore((s) => s.camera)
  const showLocalGrid = useMapStore((s) => s.showLocalGrid)
  const show3dBuildings = useMapStore((s) => s.show3dBuildings)
  const showIcons = useMapStore((s) => s.showIcons)
  const { toggleLocalGrid, toggle3dBuildings, toggleIcons, resetView, rotateBy } = useMapStore.getState()
  const local = camera ? lngLatToLocal([camera.lng, camera.lat]) : null

  return (
    <div className="map-panel">
      <strong>Wismer Park</strong>
      <div className="map-panel__status" data-status={status}>
        {status === 'error' ? `Map error: ${error}` : status === 'ready' ? 'Hover over buildings and park features for details' : 'Loading map…'}
      </div>

      <label>
        <input type="checkbox" checked={show3dBuildings} onChange={toggle3dBuildings} /> 3D buildings
      </label>
      <label>
        <input type="checkbox" checked={showIcons} onChange={toggleIcons} /> Icons
      </label>
      <label>
        <input type="checkbox" checked={showLocalGrid} onChange={toggleLocalGrid} /> Local 100 m grid
      </label>
      <div className="map-panel__rotate">
        <button onClick={() => rotateBy(-30)} title="Turn camera left 30°">⟲ Turn left</button>
        <button onClick={() => rotateBy(30)} title="Turn camera right 30°">Turn right ⟳</button>
      </div>
      <button onClick={() => resetView()}>Reset view</button>
      <small className="map-panel__hint">Turn: right-drag or Ctrl+drag · Tilt: drag up/down while turning · Keys: Shift+arrows</small>

      {camera && local && (
        <div className="map-panel__camera">
          {camera.lat.toFixed(5)}, {camera.lng.toFixed(5)} · z{camera.zoom.toFixed(1)} · pitch {camera.pitch.toFixed(0)}° · bearing{' '}
          {camera.bearing.toFixed(0)}°
          <br />
          local x {local[0].toFixed(1)} m, z {local[2].toFixed(1)} m
        </div>
      )}
    </div>
  )
}
