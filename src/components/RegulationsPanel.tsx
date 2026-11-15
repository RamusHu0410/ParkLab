import { useMemo, useState } from 'react'
import { auditPark } from '../construction/compliance'
import { sourcesHref } from '../construction/sources'
import { getConstructionGrid, useParkStore } from '../store/parkStore'

/**
 * Below the Hint button: the five government building regulations, each marked
 * as met or broken for the park as it stands. Updates after every construction change.
 */
export function RegulationsPanel() {
  const blocks = useParkStore((s) => s.blocks)
  const gridVersion = useParkStore((s) => s.gridVersion)
  const [open, setOpen] = useState<string | null>(null)
  const checks = useMemo(() => {
    const grid = getConstructionGrid()
    return grid ? auditPark(grid, blocks) : null
    // gridVersion: demolishing an existing court changes the grid without changing the blocks.
  }, [blocks, gridVersion])
  if (!checks) return null
  const broken = checks.filter((c) => !c.pass).length
  return (
    <section className={`regulations ${broken ? 'has-issues' : ''}`} aria-labelledby="regulations-title">
      <div className="regulations__head">
        <h2 id="regulations-title" className="regulations__title">
          Government regulations
        </h2>
        <a className="regulations__sources" href={sourcesHref()} target="_blank" rel="noopener noreferrer">
          Sources ↗
        </a>
      </div>
      <p className="regulations__status">{broken ? `${broken} of ${checks.length} broken. Fix them before you finalize.` : 'Your design meets every regulation.'}</p>
      <ul className="regulations__list">
        {checks.map((c) => (
          <li key={c.rule} className={`regulations__item ${c.pass ? 'is-pass' : 'is-fail'}`}>
            <button
              className="regulations__row"
              onClick={() => !c.pass && setOpen(open === c.rule ? null : c.rule)}
              aria-expanded={c.pass ? undefined : open === c.rule}
              aria-describedby={`rule-tip-${c.rule}`}
            >
              <span className="regulations__mark">{c.pass ? '✓' : '!'}</span>
              <span className="regulations__label">{c.label}</span>
              {!c.pass && <span className="regulations__count">{c.violations.length}</span>}
            </button>
            <a className="regulations__source" href={sourcesHref(c.rule)} target="_blank" rel="noopener noreferrer" aria-label={`Sources for ${c.label}`} title="Sources">
              ⓘ
            </a>
            <div id={`rule-tip-${c.rule}`} role="tooltip" className="regulations__tip">
              <strong>{c.label}</strong>
              <span>{c.summary}</span>
              <small>ⓘ opens the sources for this rule.</small>
              <em>{c.pass ? '✓ Your design meets this rule.' : `! Broken ${c.violations.length} time${c.violations.length > 1 ? 's' : ''}. Click to see where.`}</em>
            </div>
            {!c.pass && open === c.rule && (
              <ul className="regulations__issues">
                {c.violations.map((v) => (
                  <li key={v.message}>{v.message}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
