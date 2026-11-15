import { useEffect, useState } from 'react'
import type { CitizenStatus, Movement } from '../citizens/citizenSim'
import { PORTRAIT_BACKGROUND, REPRESENTATIVE_LOOKS } from '../citizens/looks'
import type { RequestResult } from '../citizens/requests'
import { renderPortrait } from '../scene/three/portraits'
import { sourcesHref } from '../construction/sources'
import { useCitizenStore } from '../store/citizenStore'

/** Head-and-shoulders render of the representative's 3D model; the emoji shows until it's ready. */
function Portrait({ id, fallback }: { id: string; fallback: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    const look = REPRESENTATIVE_LOOKS[id]
    if (!look) return
    let alive = true
    renderPortrait(look).then((url) => alive && setSrc(url), () => {})
    return () => {
      alive = false
    }
  }, [id])
  return (
    <span className="portrait" style={{ background: PORTRAIT_BACKGROUND[id] ?? '#e3efd9' }}>
      {src ? <img src={src} alt="" /> : <span className="portrait__fallback">{fallback}</span>}
    </span>
  )
}

const MOVEMENT_LABEL: Record<Movement, string> = { idle: 'Idle', walking: 'Walking', arrived: 'At destination', stuck: 'Stuck' }

type Mood = 'delighted' | 'happy' | 'neutral' | 'unhappy'

const MOUTH: Record<Mood, string> = {
  delighted: 'M7 13.5 Q12 19 17 13.5 Z',
  happy: 'M8 14.5 Q12 17.5 16 14.5',
  neutral: 'M8.5 15.5 H15.5',
  unhappy: 'M8 16.5 Q12 13.5 16 16.5',
}

/** Flat face icon for the happiness bar, filled with the bar's colour. */
function MoodFace({ mood, color }: { mood: Mood; color: string }) {
  return (
    <svg className="happiness__face" viewBox="0 0 24 24" width={18} height={18} role="img" aria-label={mood}>
      <circle cx={12} cy={12} r={10.5} fill={color} stroke="#00000026" strokeWidth={1} />
      <circle cx={8.8} cy={9.5} r={1.4} fill="#3b2f2a" />
      <circle cx={15.2} cy={9.5} r={1.4} fill="#3b2f2a" />
      <path
        d={MOUTH[mood]}
        fill={mood === 'delighted' ? '#3b2f2a' : 'none'}
        stroke="#3b2f2a"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HappinessBar({ value }: { value: number }) {
  const mood: Mood = value >= 80 ? 'delighted' : value >= 55 ? 'happy' : value >= 30 ? 'neutral' : 'unhappy'
  const color = { delighted: '#5cb85c', happy: '#9ccc65', neutral: '#ffb74d', unhappy: '#ef6c6c' }[mood]
  return (
    <div className="happiness" title={`Happiness ${value}/100`}>
      <MoodFace mood={mood} color={color} />
      <div className="happiness__track">
        <div className="happiness__fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="happiness__value">{value}</span>
    </div>
  )
}

function CitizenLine({ c }: { c: CitizenStatus | undefined }) {
  if (!c) return null
  return (
    <div className={`citizen-line citizen-line--${c.movement}`}>
      <span className="citizen-line__state">{MOVEMENT_LABEL[c.movement]}</span> {c.activity}
      {c.destination && c.movement === 'walking' && <span className="citizen-line__dest"> → {c.destination}</span>}
    </div>
  )
}

function RequestCard({ r, citizen }: { r: RequestResult; citizen: CitizenStatus | undefined }) {
  const focus = useCitizenStore((s) => s.focusCitizen)
  const help = useCitizenStore((s) => s.showHints)
  return (
    <article className={`request-card ${r.satisfied ? 'request-card--done' : ''}`}>
      <header className="request-card__head">
        <button className="request-card__who" onClick={() => focus(r.citizenId)} title="Show on the map">
          <Portrait id={r.citizenId} fallback={r.icon} />
          <span>
            <strong>{r.name}</strong>
            <small>{r.role}</small>
          </span>
        </button>
        <span className={`badge ${r.satisfied ? 'badge--done' : 'badge--open'}`}>{r.satisfied ? '✓ Satisfied' : 'Open'}</span>
      </header>
      <HappinessBar value={r.happiness} />
      <div className={`speech ${r.satisfied ? 'speech--happy' : ''}`}>
        {r.voice.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {help && (
        <div className="wants">
          <span className="wants__title">💡 Try adding</span>
          <ul>
            {r.suggestions.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      <CitizenLine c={citizen} />
    </article>
  )
}

export function RequestPanel() {
  const requests = useCitizenStore((s) => s.requests)
  const citizens = useCitizenStore((s) => s.citizens)
  const evaluating = useCitizenStore((s) => s.evaluating)
  const focus = useCitizenStore((s) => s.focusCitizen)
  const done = requests.filter((r) => r.satisfied).length
  const avg = requests.length ? Math.round(requests.reduce((s, r) => s + r.happiness, 0) / requests.length) : 0
  const others = citizens.filter((c) => !c.requestId)

  return (
    <aside className="request-panel">
      <header className="request-panel__head">
        <h2>Citizen requests</h2>
        <div className="request-panel__summary">
          {requests.length ? (
            <>
              <span>
                {done}/{requests.length} satisfied
              </span>
              <span>Avg. happiness {avg}</span>
            </>
          ) : (
            <span>Loading the park…</span>
          )}
          {evaluating && <span className="request-panel__checking">Checking…</span>}
          <a className="request-panel__sources" href={sourcesHref('requests')} target="_blank" rel="noopener noreferrer">
            Sources ↗
          </a>
        </div>
      </header>
      <div className="request-panel__list">
        {requests.map((r) => (
          <RequestCard key={r.id} r={r} citizen={citizens.find((c) => c.id === r.citizenId)} />
        ))}
        {others.length > 0 && (
          <details className="also-here">
            <summary>
              <h3>
                Everyone in the park <small>({citizens.length} people)</small>
              </h3>
            </summary>
            {others.map((c) => (
              <button key={c.id} className="also-here__row" onClick={() => focus(c.id)} title="Show on the map">
                <span>{c.icon}</span>
                <span>
                  <strong>{c.name}</strong>{' '}
                  <small>
                    {c.role} · with {requests.find((r) => r.id === c.group)?.name ?? c.group}
                  </small>
                  <CitizenLine c={c} />
                </span>
              </button>
            ))}
          </details>
        )}
      </div>
    </aside>
  )
}
