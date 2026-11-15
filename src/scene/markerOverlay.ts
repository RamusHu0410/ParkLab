import { MercatorCoordinate } from 'maplibre-gl'
import { type Matrix4, Vector4 } from 'three'

/** An icon floating above something on the map. */
export interface FloatingMarker {
  key: string
  icon: string
  name: string
  kind: string
  lngLat: [number, number]
  /** Height of the icon's anchor above the ground, metres. */
  height: number
  /** Icon only (park facilities); otherwise icon + name (buildings). */
  compact?: boolean
  buildingId?: string | number
}

interface Entry {
  m: FloatingMarker
  el: HTMLDivElement
  merc: [number, number, number]
}

/**
 * Floating icon badges, as plain DOM positioned every frame from MapLibre's
 * projection matrix (MapLibre symbols can't be lifted off the ground).
 * Pointer events pass through to the map, so hovering still shows tooltips.
 */
export class MarkerOverlay {
  private readonly root: HTMLDivElement
  private readonly groups = new Map<string, Entry[]>()
  private readonly v = new Vector4()
  visible = true

  constructor(container: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'marker-layer'
    container.appendChild(this.root)
  }

  /** Replaces the markers of one group (e.g. "buildings", "facilities"). */
  setMarkers(group: string, list: FloatingMarker[]) {
    const old = this.groups.get(group) ?? []
    const keep = new Set(list.map((m) => m.key))
    const kept = old.filter((e) => {
      if (keep.has(e.m.key)) return true
      e.el.remove()
      return false
    })
    const have = new Set(kept.map((e) => e.m.key))
    for (const m of list) {
      if (have.has(m.key)) continue
      const el = document.createElement('div')
      el.className = m.compact ? 'marker marker--compact' : 'marker'
      el.style.setProperty('--bob-delay', `${(kept.length % 7) * -0.37}s`)
      el.innerHTML = `<div class="marker__bubble"><span class="marker__icon"></span><span class="marker__name"></span></div><div class="marker__stem"></div>`
      el.querySelector('.marker__icon')!.textContent = m.icon
      el.querySelector('.marker__name')!.textContent = m.name
      el.dataset.kind = m.kind
      this.root.appendChild(el)
      const c = MercatorCoordinate.fromLngLat(m.lngLat, m.height)
      kept.push({ m, el, merc: [c.x, c.y, c.z] })
    }
    this.groups.set(group, kept)
  }

  /** Repositions badges for the current frame. `mercatorToClip` is MapLibre's main matrix. */
  update(mercatorToClip: Matrix4, width: number, height: number) {
    this.root.style.display = this.visible ? '' : 'none'
    if (!this.visible) return
    for (const entries of this.groups.values()) {
      for (const e of entries) {
        this.v.set(e.merc[0], e.merc[1], e.merc[2], 1).applyMatrix4(mercatorToClip)
        const w = this.v.w
        const x = ((this.v.x / w + 1) / 2) * width
        const y = ((1 - this.v.y / w) / 2) * height
        const onScreen = w > 0 && x > -80 && x < width + 80 && y > -40 && y < height + 80
        e.el.style.display = onScreen ? '' : 'none'
        if (!onScreen) continue
        e.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
        // Nearer badges (smaller clip w) on top; always positive so none hide behind the map.
        e.el.style.zIndex = String(Math.max(1, Math.round(1e7 / w)))
      }
    }
  }

  findByBuilding(buildingId: string | number | undefined): FloatingMarker | undefined {
    if (buildingId == null) return undefined
    for (const entries of this.groups.values()) {
      const e = entries.find((x) => x.m.buildingId === buildingId)
      if (e) return e.m
    }
    return undefined
  }

  dispose() {
    this.root.remove()
  }
}
