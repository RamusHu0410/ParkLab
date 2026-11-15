import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// MapLibre finds its worker relative to its own module URL. Vite pre-bundles the
// library into node_modules/.vite/deps where that file does not exist, so point
// it at the worker explicitly. The worker is self-contained, so ?url is enough.
setWorkerUrl(workerUrl)
