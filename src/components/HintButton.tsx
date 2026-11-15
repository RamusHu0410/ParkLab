import { useCitizenStore } from '../store/citizenStore'

/** Below the meters: reveals the exact requirements behind each citizen's request. */
export function HintButton() {
  const open = useCitizenStore((s) => s.showHints)
  const toggle = useCitizenStore((s) => s.toggleHints)
  return (
    <div className="hint-box">
      <button className={`hint-button ${open ? 'hint-button--on' : ''}`} onClick={toggle} aria-pressed={open}>
        <span className="hint-button__icon">💡</span>
        {open ? 'Hide hints' : 'Hint'}
      </button>
      {open && (
        <div className="hint-card" role="note">
          <p>Each citizen card now shows exactly what they need, your park’s current numbers and how they’re measured.</p>
          <p>
            <span className="hint-card__mark hint-card__mark--pass">✓</span> met · <span className="hint-card__mark hint-card__mark--fail">✗</span> not met ·{' '}
            <span className="hint-card__mark">○</span> bonus
          </p>
        </div>
      )}
    </div>
  )
}
