import { useParkStore } from '../store/parkStore'
import { Model } from './Model'

/** Draws every item in ParkState.placedItems. */
export function PlacedItems() {
  const items = useParkStore((s) => s.placedItems)
  return (
    <>
      {items.map((item) => (
        <Model key={item.id} assetId={item.assetId} position={item.position} rotation={[0, item.rotationY, 0]} />
      ))}
    </>
  )
}
