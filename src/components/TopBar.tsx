import { useEffect, useState } from 'react'
import { AREA_TYPES, FACILITY_TYPES, PATH_TYPES } from '../construction/blocks'
import { auditPark, type Ending, rateDesign, type RuleCheck } from '../construction/compliance'
import { LEVEL } from '../construction/level'
import { useCitizenStore } from '../store/citizenStore'
import { getConstructionGrid, useParkStore } from '../store/parkStore'

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

const ENDINGS: Record<Ending, { title: string; text: string }> = {
  disqualified: {
    title: 'Disqualified',
    text: 'The City of Markham rejected your design: it breaks government construction rules. Fix every violation before resubmitting.',
  },
  unhappy: {
    title: 'The residents are unhappy',
    text: 'The park meets the rules, but most residents feel it ignores what they asked for. Council sends the design back.',
  },
  ordinary: {
    title: 'Design approved',
    text: 'The park opens without fuss. Residents use it, but nobody is talking about it.',
  },
  greatest: {
    title: 'You are the greatest designer!',
    text: 'Wismer Park is the talk of Markham. Residents love it and the City wants you for its next park.',
  },
}

/** Title on the left, Finalize on the right. Finalizing opens the design summary and rating. */
export function TopBar() {
  const [report, setReport] = useState<{ checks: RuleCheck[]; happiness: number } | null>(null)
  const ready = useCitizenStore((s) => s.meters !== null)

  const finalize = () => {
    const grid = getConstructionGrid()
    const meters = useCitizenStore.getState().meters
    if (!grid || !meters) return
    setReport({ checks: auditPark(grid, useParkStore.getState().blocks), happiness: Math.round(meters.happiness) })
  }

  return (
    <>
      <header className="top-bar">
        <h1 className="top-bar__title">
          Wismer Park <span className="top-bar__place">– Markham</span>
        </h1>
        <button className="top-bar__finalize" onClick={finalize} disabled={!ready} title={ready ? 'Submit your design for review' : 'The park is still loading'}>
          ✔ Finalize
        </button>
      </header>
      {report && <FinalReport {...report} onClose={() => setReport(null)} />}
    </>
  )
}

function FinalReport({ checks, happiness, onClose }: { checks: RuleCheck[]; happiness: number; onClose: () => void }) {
  const meters = useCitizenStore((s) => s.meters)
  const requests = useCitizenStore((s) => s.requests)
  const budget = useParkStore((s) => s.budget)
  const stats = useParkStore((s) => s.simulation.stats)
  const { stars, ending } = rateDesign(checks, happiness)
  const story = ENDINGS[ending]
  const satisfied = requests.filter((r) => r.satisfied).length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const built = [
    ...Object.entries(PATH_TYPES).map(([k, t]) => [t.label, stats.pathM2[k as keyof typeof PATH_TYPES], 'm²'] as const),
    ...Object.entries(AREA_TYPES).map(([k, t]) => [t.label, stats.areaM2[k as keyof typeof AREA_TYPES], 'm²'] as const),
    ...Object.entries(FACILITY_TYPES).map(([k, t]) => [t.label, stats.facilities[k as keyof typeof FACILITY_TYPES], ''] as const),
  ].filter(([, n]) => n > 0)

  return (
    <div className="final-report__backdrop" onClick={onClose}>
      <section className={`final-report final-report--${ending}`} role="dialog" aria-modal="true" aria-labelledby="final-report-title" onClick={(e) => e.stopPropagation()}>
        <button className="final-report__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="final-report__stars" aria-label={`${stars} of 3 stars`}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= stars ? 'is-on' : ''}>
              ★
            </span>
          ))}
        </div>
        <h2 id="final-report-title">{story.title}</h2>
        <p className="final-report__story">{story.text}</p>

        <div className="final-report__grid">
          <div>
            <h3>Government rules</h3>
            <ul className="final-report__rules">
              {checks.map((c) => (
                <li key={c.rule} className={c.pass ? 'is-pass' : 'is-fail'}>
                  <span className="final-report__mark">{c.pass ? '✓' : '✗'}</span>
                  <span>
                    <strong>{c.label}</strong>
                    {c.violations.map((v) => (
                      <small key={v.message}>{v.message}</small>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Park summary</h3>
            <dl className="final-report__stats">
              <dt>Average happiness</dt>
              <dd>{happiness}%</dd>
              <dt>Requests satisfied</dt>
              <dd>
                {satisfied}/{requests.length}
              </dd>
              {meters && (
                <>
                  <dt>Green space</dt>
                  <dd>{Math.round(meters.greenShare * 100)}%</dd>
                  <dt>CO₂ absorbed</dt>
                  <dd>{meters.co2TonnesPerYear.toLocaleString('en-CA', { maximumFractionDigits: 1 })} t/yr</dd>
                  <dt>Safety</dt>
                  <dd>{Math.round(meters.safeShare * 100)}%</dd>
                </>
              )}
              <dt>Spent</dt>
              <dd>
                {money(LEVEL.startingFunds - budget)} <small>of {money(LEVEL.startingFunds)}</small>
              </dd>
            </dl>
            <h3>Built</h3>
            {built.length ? (
              <ul className="final-report__built">
                {built.map(([label, n, unit]) => (
                  <li key={label}>
                    {label} <span>{unit ? `${n.toLocaleString()} ${unit}` : `× ${n}`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="final-report__empty">Nothing new was built.</p>
            )}
          </div>
        </div>

        <button className="final-report__back" onClick={onClose}>
          Keep designing
        </button>
      </section>
    </div>
  )
}
