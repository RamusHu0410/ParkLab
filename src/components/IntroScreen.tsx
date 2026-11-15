import { useState } from 'react'
import { INTRO_FLIGHT_MS } from '../geography/constants'
import { useMapStore } from '../store/mapStore'
import { AreaIcon, FacilityIcon, PathIcon } from './buildIcons'

/** Title screen shown on entry. "Enter" flies the camera to the welcome gate, then the screen goes away. */
export function IntroScreen() {
  const open = useMapStore((s) => s.introOpen)
  const ready = useMapStore((s) => s.status === 'ready')
  const [leaving, setLeaving] = useState(false)
  if (!open) return null

  const enter = () => {
    setLeaving(true)
    useMapStore.getState().playIntro()
    // Fade out early in the flight so the player watches the camera arrive.
    window.setTimeout(() => useMapStore.getState().closeIntro(), Math.min(1200, INTRO_FLIGHT_MS))
  }

  return (
    <div className={`intro ${leaving ? 'is-leaving' : ''}`}>
      <div className="intro__card">
        <div className="intro__art">
          <PathIcon type="walking_trail" />
          <AreaIcon type="woodland" />
          <FacilityIcon type="playground" />
          <AreaIcon type="flower_garden" />
        </div>
        <h1>ParkLab</h1>
        <p className="intro__place">Wismer Park · Markham, Ontario</p>
        <p>Design a park that the people living nearby will love: draw paths, plant woodland and gardens, and build playgrounds and courts.</p>
        <button className="intro__enter" onClick={enter} disabled={!ready || leaving}>
          {ready ? 'Enter the park ▸' : 'Loading the park…'}
        </button>
      </div>
    </div>
  )
}
