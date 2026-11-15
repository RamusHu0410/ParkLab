import { useCitizenStore } from '../store/citizenStore'

/** Below the meters: shows on each citizen card what the player could add for them. */
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
          <p>Each citizen card now suggests what you could add to the park for them.</p>
        </div>
      )}
    </div>
  )
}
