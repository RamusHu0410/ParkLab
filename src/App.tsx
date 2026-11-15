import { DevPanel } from './components/DevPanel'
import { ParkScene } from './scene/ParkScene'

export default function App() {
  return (
    <div className="app">
      <ParkScene />
      <DevPanel />
    </div>
  )
}
