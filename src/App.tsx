import { ConstructionPanel } from './components/ConstructionPanel'
import { DevPanel } from './components/DevPanel'
import { HintButton } from './components/HintButton'
import { IntroScreen } from './components/IntroScreen'
import { RegulationsPanel } from './components/RegulationsPanel'
import { SourcesPage } from './components/SourcesPage'
import { MetersPanel } from './components/MetersPanel'
import { MapView } from './components/MapView'
import { RequestPanel } from './components/RequestPanel'
import { TopBar } from './components/TopBar'
import { ParkScene } from './scene/ParkScene'
import { useMapStore } from './store/mapStore'

// The Step 1 R3F test scene stays reachable at ?view=scene until it is merged into the map.
const view = new URLSearchParams(window.location.search).get('view')

export default function App() {
  const introActive = useMapStore((st) => st.introActive)
  const introTitle = useMapStore((st) => st.introTitle)
  if (view === 'sources') return <SourcesPage />
  if (view === 'scene') {
    return (
      <div className="app">
        <ParkScene />
        <DevPanel />
      </div>
    )
  }
  return (
    <div className={`app app--editor ${introActive ? 'is-intro' : ''}`}>
      <TopBar />
      <div className="map-row">
        <div className="map-area">
          <MapView />
          <div className="map-hud">
            <MetersPanel />
            <HintButton />
            <RegulationsPanel />
          </div>
        </div>
        <RequestPanel />
      </div>
      <ConstructionPanel />
      <IntroScreen />
      {introTitle && (
        <div className="intro-title" aria-live="polite">
          Wismer Park, Markham
        </div>
      )}
    </div>
  )
}
