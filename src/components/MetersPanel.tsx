import { useCitizenStore } from '../store/citizenStore'

/** Gauges for the park as a whole, top-left over the map. */
export function MetersPanel() {
  const m = useCitizenStore((s) => s.meters)
  const evaluating = useCitizenStore((s) => s.evaluating)
  return (
    <div className={`meters ${evaluating ? 'is-updating' : ''}`}>
      <h2 className="meters__title">Meter</h2>
      <Meter label="Average happiness" value={m ? `${Math.round(m.happiness)}%` : '–'} share={m ? m.happiness / 100 : 0} color="#f2c230" />
      <Meter label="Green space coverage" value={m ? `${Math.round(m.greenShare * 100)}%` : '–'} share={m?.greenShare ?? 0} color="#6aa84f" />
      <Meter
        label="CO₂ absorbed per year"
        value={m ? `${m.co2TonnesPerYear.toLocaleString('en-CA', { maximumFractionDigits: 1 })} t` : '–'}
        // Bar scaled to 100 t/yr, a well-planted park of this size.
        share={m ? m.co2TonnesPerYear / 100 : 0}
        color="#4fa3a5"
      />
      <Meter label="Safety" value={m ? `${Math.round(m.safeShare * 100)}%` : '–'} share={m?.safeShare ?? 0} color="#5b8fd1" hint="Share of path length away from streets and parking" />
    </div>
  )
}

function Meter({ label, value, share, color, hint }: { label: string; value: string; share: number; color: string; hint?: string }) {
  return (
    <div className="meter" title={hint}>
      <div className="meter__body">
        <div className="meter__row">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
        <div className="meter__bar">
          <div style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: color }} />
        </div>
      </div>
    </div>
  )
}
