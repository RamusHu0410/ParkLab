import { useCitizenStore } from '../store/citizenStore'

/** Bottom-left of the map: reveals the exact requirements behind each citizen's request. */
export function HelpButton() {
  const open = useCitizenStore((s) => s.helpOpen)
  const toggle = useCitizenStore((s) => s.toggleHelp)
  return (
    <div className="help-corner">
      {open && (
        <div className="help-card" role="note">
          <strong>Help is on</strong>
          <p>Each citizen card now lists the exact requirements, your park’s current numbers and how they’re measured.</p>
          <p>
            <span className="help-card__mark help-card__mark--pass">✓</span> met · <span className="help-card__mark help-card__mark--fail">✗</span> not met ·{' '}
            <span className="help-card__mark">○</span> bonus
          </p>
        </div>
      )}
      <button className={`help-button ${open ? 'help-button--on' : ''}`} onClick={toggle} aria-pressed={open}>
        <span className="help-button__icon">?</span>
        {open ? 'Hide help' : 'Help'}
      </button>
    </div>
  )
}
