import type { BlockShape, ConstructionBlock } from '../construction/blocks'
import { RULES } from '../construction/rules'
import { localToLngLat } from '../geography/projection'
import { pointAlong, polylineLength, ringCentroid, type Vec2 } from '../utils/geometry2d'
import type { FloatingMarker } from './markerOverlay'

/** Where a block's marker floats: facility centre, path midpoint, area centre. */
export function blockAnchor(shape: BlockShape): Vec2 {
  if (shape.kind === 'facility') return shape.center
  if (shape.kind === 'path') return shape.line.length > 1 ? pointAlong(shape.line, polylineLength(shape.line) / 2).p : shape.line[0]
  if (shape.mode === 'polygon') return ringCentroid(shape.ring)
  return shape.stroke.length > 1 ? pointAlong(shape.stroke, polylineLength(shape.stroke) / 2).p : shape.stroke[0]
}

/** A "!" marker over every built block that breaks a siting rule, labelled with the rules it breaks. */
export function violationMarkers(blocks: readonly ConstructionBlock[]): FloatingMarker[] {
  return blocks
    .filter((b) => b.violations?.length)
    .map((b) => {
      const p = blockAnchor(b.shape)
      const rules = [...new Set(b.violations!.map((v) => RULES[v.rule].label))]
      return { key: `violation-${b.id}`, icon: '!', name: rules.join(' · '), kind: 'violation', lngLat: localToLngLat([p[0], 0, p[1]]), height: b.shape.kind === 'facility' ? 8 : 4 }
    })
}
