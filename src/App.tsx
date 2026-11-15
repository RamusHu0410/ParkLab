import { DevPanel } from './components/DevPanel'
import { MapPanel } from './components/MapPanel'
import { MapView } from './components/MapView'
import { ParkScene } from './scene/ParkScene'

// The Step 1 R3F test scene stays reachable at ?view=scene until it is merged into the map.
const view = new URLSearchParams(window.location.search).get('view')

export default function App() {
  if (view === 'scene') {
    return (
      <div className="app">
        <ParkScene />
        <DevPanel />
      </div>
    )
  }
  return (
    <div className="app">
      <MapView />
      <MapPanel />
    </div>
  )
}
