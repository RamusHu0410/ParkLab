import { useEffect, useState } from 'react'
import type { CitizenStatus, Movement } from '../citizens/citizenSim'
import { PORTRAIT_BACKGROUND, REPRESENTATIVE_LOOKS } from '../citizens/looks'
import type { RequestResult } from '../citizens/requests'
import { renderPortrait } from '../scene/three/portraits'
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
    <span className="portrait" style={{ background: PORTRAIT_BACKGROUND[id] ?? '#ffe7b3' }}>
      {src ? <img src={src} alt="" /> : <span className="portrait__fallback">{fallback}</span>}
    </span>
  )
}

const MOVEMENT_LABEL: Record<Movement, string> = { idle: 'Idle', walking: 'Walking', arrived: 'At destination', stuck: 'Stuck' }

function HappinessBar({ value }: { value: number }) {
  const mood = value >= 80 ? '😄' : value >= 55 ? '🙂' : value >= 30 ? '😐' : '😟'
  return (
    <div className="happiness" title={`Happiness ${value}/100`}>
      <span className="happiness__face">{mood}</span>
      <div className="happiness__track">
        <div className="happiness__fill" style={{ width: `${value}%`, background: value >= 80 ? '#5cb85c' : value >= 55 ? '#9ccc65' : value >= 30 ? '#ffb74d' : '#ef6c6c' }} />
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
      <ul className="criteria">
        {r.criteria.map((c) => (
          <li key={c.label} className={c.pass ? 'criteria--pass' : 'criteria--fail'}>
            <span className="criteria__mark">{c.pass ? '✓' : c.bonus ? '○' : '✗'}</span>
            <span className="criteria__label">
              {c.label}
              {c.bonus && <em> (bonus)</em>}
            </span>
            <span className="criteria__value">
              {c.value} <small>/ {c.target}</small>
            </span>
            <span className="criteria__bar">
              <span style={{ width: `${Math.round(c.progress * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      )}
      <CitizenLine c={citizen} />
      {help && r.notes.length > 0 && (
        <details className="request-card__notes">
          <summary>How this is measured</summary>
          {r.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </details>
      )}
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
