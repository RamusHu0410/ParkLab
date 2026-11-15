import { useParkStore } from '../store/parkStore'

const BENCH_COST = 500

/** Temporary panel for checking that ParkState can be read and changed. */
export function DevPanel() {
  const budget = useParkStore((s) => s.budget)
  const count = useParkStore((s) => s.placedItems.length)
  const tool = useParkStore((s) => s.tool)

  const addBench = () => {
    const { spend, addItem } = useParkStore.getState()
    if (!spend(BENCH_COST)) return
    addItem({ assetId: 'park_bench', position: [(Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16], rotationY: Math.random() * Math.PI * 2 })
  }

  return (
    <div className="dev-panel">
      <strong>ParkLab dev panel</strong>
      <div>Budget: ${budget.toLocaleString()}</div>
      <div>Placed items: {count}</div>
      <div>Tool: {tool}</div>
      <button onClick={addBench}>Add bench (${BENCH_COST})</button>
      <button onClick={() => useParkStore.getState().reset()}>Reset</button>
    </div>
  )
}
