import { ENVIRONMENT, environmentScore } from '../construction/compliance'
import { sourcesHref } from '../construction/sources'
import { useCitizenStore } from '../store/citizenStore'

/** Gauges for the park as a whole, top-left over the map. */
export function MetersPanel() {
  const m = useCitizenStore((s) => s.meters)
  const evaluating = useCitizenStore((s) => s.evaluating)
  const env = m ? environmentScore(m.greenShare, m.co2TonnesPerYear) : null
  return (
    <div className={`meters ${evaluating ? 'is-updating' : ''}`}>
      <h2 className="meters__title">Meter</h2>
      <Meter label="Average happiness" value={m ? `${Math.round(m.happiness)}%` : '–'} share={m ? m.happiness / 100 : 0} color="#f2c230" />
      <Meter
        label="Environmental score"
        value={env === null ? '–' : `${env} / 100`}
        share={env === null ? 0 : env / 100}
        color={env !== null && env < ENVIRONMENT.threshold ? '#e0a030' : '#6aa84f'}
        hint={`Green space and CO₂ absorbed. Below ${ENVIRONMENT.threshold} costs a star when you finalize.`}
        source={sourcesHref('environment-score')}
      />
      <Meter label="Safety" value={m ? `${Math.round(m.safeShare * 100)}%` : '–'} share={m?.safeShare ?? 0} color="#5b8fd1" hint="Share of path length away from streets and parking" />
    </div>
  )
}

function Meter({ label, value, share, color, hint, source }: { label: string; value: string; share: number; color: string; hint?: string; source?: string }) {
  return (
    <div className="meter" title={hint}>
      <div className="meter__body">
        <div className="meter__row">
          <span>
            {label}
            {source && (
              <a className="meter__source" href={source} target="_blank" rel="noopener noreferrer" aria-label={`Sources for ${label}`} title="Sources">
                ⓘ
              </a>
            )}
          </span>
          <strong>{value}</strong>
        </div>
        <div className="meter__bar">
          <div style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: color }} />
        </div>
      </div>
    </div>
  )
}
