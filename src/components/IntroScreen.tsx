import { type ReactNode, useState } from 'react'
import { LEVEL } from '../construction/level'
import { RULES, type RuleId } from '../construction/rules'
import { sourcesHref } from '../construction/sources'
import { INTRO_FLIGHT_MS } from '../geography/constants'
import { useMapStore } from '../store/mapStore'
import { AreaIcon, FacilityIcon, PathIcon } from './buildIcons'
import { LandingPage } from './LandingPage'

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

/** Tutorial pages, read in order before the level list opens. */
const STEPS: { title: string; art: ReactNode; body: ReactNode }[] = [
  {
    title: 'Welcome to ParkLab',
    art: (
      <>
        <PathIcon type="walking_trail" />
        <AreaIcon type="woodland" />
        <FacilityIcon type="playground" />
        <AreaIcon type="flower_garden" />
      </>
    ),
    body: (
      <p>
        You are the park designer. The people living nearby have asked the City to improve their park, and it is your job to plan the new design within the
        budget.
      </p>
    ),
  },
  {
    title: 'Listen to the residents',
    art: <span className="intro__emoji">🧑‍🤝‍🧑</span>,
    body: (
      <ul className="intro__list">
        <li>
          <strong>Requests</strong> (right): each resident says what they want. A card is ticked ✓ once the park meets it.
        </li>
        <li>
          <strong>💡 Hint</strong> suggests what you could add for each resident.
        </li>
        <li>
          <strong>Meters</strong> (top left): happiness, the environmental score and safety update as you build.
        </li>
      </ul>
    ),
  },
  {
    title: 'Build your park',
    art: (
      <>
        <PathIcon type="accessible_path" />
        <AreaIcon type="picnic_lawn" />
        <FacilityIcon type="basketball_court" />
      </>
    ),
    body: (
      <ul className="intro__list">
        <li>
          <strong>Paths</strong>: drag on the map to draw a trail.
        </li>
        <li>
          <strong>Areas</strong>: paint with the brush or click polygon corners to plant woodland, gardens or lawns.
        </li>
        <li>
          <strong>Facilities</strong>: click to place a playground, court or plaza. <kbd>R</kbd> rotates it.
        </li>
        <li>
          <strong>Remove</strong>: click something to take it away.
        </li>
        <li>
          <kbd>Enter</kbd> builds, <kbd>Esc</kbd> cancels, <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> undoes. You start with {money(LEVEL.startingFunds)}.
        </li>
      </ul>
    ),
  },
  {
    title: 'Follow the government rules',
    art: <span className="intro__emoji intro__emoji--warn">!</span>,
    body: (
      <>
        <ul className="intro__list">
          {(Object.entries(RULES) as [RuleId, (typeof RULES)[RuleId]][]).map(([id, r]) => (
            <li key={id}>
              <a href={sourcesHref(id)} target="_blank" rel="noopener noreferrer">
                <strong>{r.label}</strong>
              </a>
              : {r.summary}
            </li>
          ))}
        </ul>
        <p className="intro__small">
          You can still build something that breaks a rule, but it gets an orange <span className="intro__mark">!</span> on the map. Fix every one before you finalize, or the
          City rejects the design.
        </p>
      </>
    ),
  },
  {
    title: 'Finalize your design',
    art: <span className="intro__emoji intro__stars">★★★</span>,
    body: (
      <p>
        When you are happy with the park, press <strong>✔ Finalize</strong> at the top. The City checks the rules, then rates your design up to three stars for
        resident happiness and the environment. You can keep designing after seeing the result.
      </p>
    ),
  },
]

/** Slots shown on the level list; only the first has a level yet. */
const LEVEL_SLOTS = 6

/**
 * Entry screen: the title page, the tutorial pages, then the level list.
 * Choosing Wismer Park flies the camera to the welcome gate and the screen fades away.
 */
export function IntroScreen() {
  const open = useMapStore((s) => s.introOpen)
  const ready = useMapStore((s) => s.status === 'ready')
  const [landing, setLanding] = useState(true)
  const [step, setStep] = useState(0)
  const [leaving, setLeaving] = useState(false)
  if (!open) return null
  if (landing) {
    const leaveLanding = (to: number) => {
      setStep(to)
      setLanding(false)
    }
    return <LandingPage onPlay={() => leaveLanding(0)} onLevels={() => leaveLanding(STEPS.length)} />
  }
  const enter = () => {
    setLeaving(true)
    useMapStore.getState().playIntro()
    // Fade out early in the flight so the player watches the camera arrive.
    window.setTimeout(() => useMapStore.getState().closeIntro(), Math.min(1200, INTRO_FLIGHT_MS))
  }
  const choosing = step === STEPS.length
  const page = STEPS[step]
  return (
    <div className={`intro ${leaving ? 'is-leaving' : ''}`}>
      {choosing ? (
        <div className="intro__card intro__card--levels">
          <h1>Choose a level</h1>
          <div className="intro__levels">
            <button className="level-card" onClick={enter} disabled={!ready || leaving}>
              <span className="level-card__num">1</span>
              <span className="level-card__art">
                <AreaIcon type="woodland" />
              </span>
              <strong>{LEVEL.name}</strong>
              <span className="level-card__place">Markham, Ontario</span>
              <span className="level-card__funds">{money(LEVEL.startingFunds)}</span>
              <span className="level-card__go">{ready ? 'Play ▸' : 'Loading…'}</span>
            </button>
            {Array.from({ length: LEVEL_SLOTS - 1 }, (_, i) => (
              <div key={i} className="level-card level-card--empty" aria-label={`Level ${i + 2}, not available yet`}>
                <span className="level-card__num">{i + 2}</span>
              </div>
            ))}
          </div>
          <button className="intro__back" onClick={() => setStep(STEPS.length - 1)} disabled={leaving}>
            ◂ Back to the tutorial
          </button>
        </div>
      ) : (
        <div className="intro__card">
          <div className="intro__art">{page.art}</div>
          <h1 className={step === 0 ? '' : 'intro__h1--small'}>{page.title}</h1>
          {step === 0 && <p className="intro__place">How to play</p>}
          <div className="intro__body">{page.body}</div>
          <div className="intro__dots" aria-label={`Page ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <span key={i} className={i <= step ? 'is-on' : ''} />
            ))}
          </div>
          <div className="intro__nav">
            <button className="intro__back" onClick={() => (step > 0 ? setStep(step - 1) : setLanding(true))}>
              ◂ Back
            </button>
            <button className="intro__enter" onClick={() => setStep(step + 1)}>
              {step === STEPS.length - 1 ? 'Choose a level ▸' : 'Next ▸'}
            </button>
          </div>
          {step < STEPS.length - 1 && (
            <button className="intro__skip" onClick={() => setStep(STEPS.length)}>
              Skip the tutorial
            </button>
          )}
        </div>
      )}
    </div>
  )
}
