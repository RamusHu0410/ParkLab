import type { ReactNode } from 'react'
import {
  AREA_TYPES,
  type AreaType,
  BRUSH_RADIUS_RANGE,
  type BlockShape,
  blockLabel,
  FACILITY_TYPES,
  type FacilityType,
  PATH_TYPES,
  PATH_WIDTH_RANGE,
  type PathType,
} from '../construction/blocks'
import { LEVEL } from '../construction/level'
import { describeTarget, type EditorMode, useEditorStore } from '../store/editorStore'
import { useParkStore } from '../store/parkStore'
import { AreaIcon, FacilityIcon, ModeIcon, PathIcon } from './buildIcons'

const money = (n: number) => `$${Math.round(n).toLocaleString()}`
const entries = <K extends string, V>(o: Record<K, V>) => Object.entries(o) as [K, V][]
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)

const MODES: { mode: EditorMode; label: string }[] = [
  { mode: 'browse', label: 'Browse' },
  { mode: 'path', label: 'Paths' },
  { mode: 'area', label: 'Areas' },
  { mode: 'facility', label: 'Facilities' },
  { mode: 'remove', label: 'Remove' },
]

const HINTS: Record<Exclude<EditorMode, 'area'>, string> = {
  browse: 'Pick a construction mode to edit the park.',
  path: 'Drag on the map to draw. Ends snap to existing paths and entrances. Enter confirms, Esc cancels.',
  facility: 'Move over the map and click to place. R / Shift+R rotates. Enter confirms, Esc cancels.',
  remove: 'Click anything to remove it: blocks you built, or trees, benches, courts and fields already in the park.',
}

function shapeIcon(s: BlockShape) {
  if (s.kind === 'path') return <PathIcon type={s.type} />
  if (s.kind === 'area') return <AreaIcon type={s.type} />
  return <FacilityIcon type={s.type} />
}

/** Construction dock under the map: path, area and facility tools, removal, preview and undo/redo. */
export function ConstructionPanel() {
  const e = useEditorStore()
  const budget = useParkStore((s) => s.budget)
  const blocks = useParkStore((s) => s.blocks)
  const canUndo = useParkStore((s) => s.undoStack.length > 0)
  const canRedo = useParkStore((s) => s.redoStack.length > 0)
  const stats = useParkStore((s) => s.simulation.stats)
  // Re-render when items or facilities change so the removal summary stays current.
  useParkStore((s) => s.placedItems)
  useParkStore((s) => s.facilities)

  if (!e.panelOpen) {
    return (
      <button className="build-dock__reopen" onClick={() => e.setPanelOpen(true)}>
        ▲ Build
      </button>
    )
  }

  const target = e.removeTarget ? describeTarget(e.removeTarget) : null
  const plan = e.plan
  const fundsShare = Math.max(0, Math.min(1, budget / LEVEL.startingFunds))
  const hint =
    e.mode === 'area'
      ? e.areaTool === 'brush'
        ? 'Drag to paint. Enter confirms, Esc cancels.'
        : 'Click to add corners; click the first corner or double-click to finish. Enter confirms, Esc cancels.'
      : HINTS[e.mode]

  return (
    <div className="build-dock">
      <div className="build-dock__bar">
        <div className="build-dock__tabs" role="tablist">
          {MODES.map((m) => (
            <button key={m.mode} role="tab" aria-selected={e.mode === m.mode} className={e.mode === m.mode ? 'is-active' : ''} onClick={() => e.setMode(m.mode)}>
              <ModeIcon mode={m.mode} />
              {m.label}
            </button>
          ))}
        </div>
        <div className="build-dock__funds" title={`Starting funds ${money(LEVEL.startingFunds)}`}>
          <span className="build-dock__coin">$</span>
          <div>
            <strong>{money(budget)}</strong>
            <div className="build-dock__meter">
              <div style={{ width: `${fundsShare * 100}%` }} />
            </div>
          </div>
        </div>
        <button onClick={e.undo} disabled={!canUndo} title="Undo (Ctrl/⌘+Z)">
          ↶ Undo
        </button>
        <button onClick={e.redo} disabled={!canRedo} title="Redo (Ctrl/⌘+Shift+Z)">
          ↷ Redo
        </button>
        <button className="build-dock__close" onClick={() => e.setPanelOpen(false)} title="Close the build panel" aria-label="Close">
          ✕
        </button>
      </div>

      <div className="build-dock__body">
        <div className="build-dock__tools">
          {e.mode === 'path' && (
            <>
              <Cards<PathType>
                value={e.pathType}
                onChange={(pathType) => e.set({ pathType })}
                items={entries(PATH_TYPES).map(([k, t]) => [k, <PathIcon type={k} />, t.label, `${money(LEVEL.costs.path[k].perSquareMetre)}/m²`])}
              />
              <label className="build-dock__slider">
                <span>Width</span>
                <input type="range" min={PATH_WIDTH_RANGE.min} max={PATH_WIDTH_RANGE.max} step={PATH_WIDTH_RANGE.step} value={e.pathWidth} onChange={(ev) => e.set({ pathWidth: Number(ev.target.value) })} />
                <span className="build-dock__width-sample" style={{ height: e.pathWidth * 3, background: PATH_TYPES[e.pathType].color, borderColor: PATH_TYPES[e.pathType].edge }} />
                <strong>{e.pathWidth} m</strong>
              </label>
            </>
          )}
          {e.mode === 'area' && (
            <>
              <Cards<AreaType>
                value={e.areaType}
                onChange={(areaType) => e.set({ areaType })}
                items={entries(AREA_TYPES).map(([k, t]) => [k, <AreaIcon type={k} />, t.label, `${money(LEVEL.costs.area[k].perSquareMetre)}/m²`])}
              />
              <div className="build-dock__toggle">
                <button className={e.areaTool === 'brush' ? 'is-active' : ''} onClick={() => (e.cancel(), e.set({ areaTool: 'brush' }))}>
                  🖌 Brush
                </button>
                <button className={e.areaTool === 'polygon' ? 'is-active' : ''} onClick={() => (e.cancel(), e.set({ areaTool: 'polygon' }))}>
                  ⬠ Polygon
                </button>
              </div>
              {e.areaTool === 'brush' && (
                <label className="build-dock__slider">
                  <span>Brush</span>
                  <input type="range" min={BRUSH_RADIUS_RANGE.min} max={BRUSH_RADIUS_RANGE.max} step={BRUSH_RADIUS_RANGE.step} value={e.brushRadius} onChange={(ev) => e.set({ brushRadius: Number(ev.target.value) })} />
                  <span className="build-dock__brush-sample" style={{ width: e.brushRadius * 2 + 4, height: e.brushRadius * 2 + 4, background: AREA_TYPES[e.areaType].color }} />
                  <strong>{e.brushRadius} m</strong>
                </label>
              )}
            </>
          )}
          {e.mode === 'facility' && (
            <>
              <Cards<FacilityType>
                value={e.facilityType}
                onChange={(facilityType) => (e.cancel(), e.set({ facilityType }))}
                items={entries(FACILITY_TYPES).map(([k, t]) => [k, <FacilityIcon type={k} />, t.label, `${money(LEVEL.costs.facility[k].flat)} · ${t.length}×${t.width} m`])}
              />
              <div className="build-dock__toggle">
                <button onClick={() => e.set({ facilityAngle: e.facilityAngle - Math.PI / 12 })}>⟲ Rotate</button>
                <span className="build-dock__compass" style={{ transform: `rotate(${(e.facilityAngle * 180) / Math.PI}deg)` }} />
                <button onClick={() => e.set({ facilityAngle: e.facilityAngle + Math.PI / 12 })}>Rotate ⟳</button>
              </div>
            </>
          )}
          {e.mode === 'browse' && (
            <div className="build-dock__stats">
              <Stat icon={<PathIcon type="walking_trail" />} value={`${sum(stats.pathM2).toLocaleString()} m²`} label="paths" />
              <Stat icon={<AreaIcon type="woodland" />} value={`${sum(stats.areaM2).toLocaleString()} m²`} label="planted" />
              <Stat icon={<FacilityIcon type="playground" />} value={String(sum(stats.facilities))} label="facilities built" />
              <Stat icon={<AreaIcon type="flower_garden" />} value={stats.items.toLocaleString()} label="objects in the park" />
              <Stat icon={<ModeIcon mode="facility" />} value={String(blocks.length)} label="blocks built" />
            </div>
          )}
          <small className="build-dock__hint">{hint}</small>
        </div>

        <div className="build-dock__preview">
          {target ? (
            <div className="build-dock__card is-remove">
              <ModeIcon mode="remove" />
              <div>
                <div>
                  Remove <strong>{target.label}</strong>?
                </div>
                <div className={target.refund > 0 ? 'build-dock__ok' : 'build-dock__note'}>
                  {target.refund > 0 ? `Refund ${money(target.refund)}` : `Demolition cost ${money(target.cost)}`}
                  {target.detail && ` · ${target.detail}`}
                </div>
                <ConfirmButtons ok onConfirm={e.confirm} onCancel={e.cancel} confirmLabel="Remove" />
              </div>
            </div>
          ) : plan && e.draft ? (
            <div className={`build-dock__card ${plan.ok ? 'is-ok' : 'is-bad'}`}>
              {shapeIcon(e.draft)}
              <div>
                <div>
                  <strong>{blockLabel(e.draft)}</strong> · {plan.cells.length.toLocaleString()} m² · <strong>{money(plan.cost)}</strong>
                </div>
                <div className="build-dock__chips">
                  {plan.ok && <span className="chip">＋ {plan.items.length} objects</span>}
                  {plan.displaced.length > 0 && <span className="chip chip--bad">✕ {plan.displaced.length} in the way</span>}
                  {plan.cost > 0 && (
                    <span className="chip" title="Share of your current funds">
                      {budget > 0 ? Math.round((plan.cost / budget) * 100) : 100}% of funds
                    </span>
                  )}
                </div>
                {plan.reasons.map((r) => (
                  <div key={r} className="build-dock__error">
                    ✗ {r}
                  </div>
                ))}
                {plan.notes.map((n) => (
                  <div key={n} className="build-dock__note">
                    {n}
                  </div>
                ))}
                {e.fixed && <ConfirmButtons ok={plan.ok} onConfirm={e.confirm} onCancel={e.cancel} confirmLabel={`Build for ${money(plan.cost)}`} />}
              </div>
            </div>
          ) : (
            e.message && <div className={e.message.tone === 'error' ? 'build-dock__error' : 'build-dock__ok'}>{e.message.text}</div>
          )}
          {(target || (plan && e.draft)) && e.message?.tone === 'error' && <div className="build-dock__error">{e.message.text}</div>}
        </div>
      </div>
    </div>
  )
}

function Cards<K extends string>({ value, onChange, items }: { value: K; onChange: (k: K) => void; items: [K, ReactNode, string, string][] }) {
  return (
    <div className="build-dock__cards">
      {items.map(([k, icon, label, price]) => (
        <button key={k} className={`build-card ${value === k ? 'is-active' : ''}`} onClick={() => onChange(k)} title={label}>
          {icon}
          <span className="build-card__label">{label}</span>
          <small>{price}</small>
        </button>
      ))}
    </div>
  )
}

function Stat({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="build-stat">
      {icon}
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  )
}

function ConfirmButtons({ ok, onConfirm, onCancel, confirmLabel }: { ok: boolean; onConfirm: () => void; onCancel: () => void; confirmLabel: string }) {
  return (
    <div className="build-dock__confirm">
      <button className="is-primary" disabled={!ok} onClick={onConfirm}>
        ✓ {confirmLabel}
      </button>
      <button onClick={onCancel}>✕ Cancel</button>
    </div>
  )
}
