# ParkLab
Learn, design and share your own parks that satisfy residents living nearby.

A 3D park-planning simulator of Wismer Park (Markham, ON).
Stack: React 19, TypeScript, Vite, Three.js, React Three Fiber, Drei, Zustand, proj4.

## Run
```
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (store, asset manifest, map data)
npm run build
```

## Layout
```
public/
  maps/wismer-park.geojson        park boundaries (FeatureCollection, WGS84)
  models/environment/playground/  Low Poly Playground & Park Pack GLBs (30)
  models/environment/city/        Cartoon City pack static GLBs (50, Draco)
  models/characters/              Cartoon City animated people (6)
  draco/                          local Draco decoder
src/
  components/   UI overlays
  scene/        R3F rendering (Canvas, Model, Character)
  geography/    map loading and projection
  construction/ placing and removing park objects
  simulation/   time and satisfaction model
  citizens/     residents and their requests
  store/        ParkState (Zustand)
  hooks/        shared React hooks
  utils/        asset manifest and helpers
scripts/        generate-asset-manifest.mjs
Assets/         original asset packs (FBX/OBJ/Blender sources, licences)
```

## Assets
The asset pack licences forbid redistributing the model files as standalone assets,
so `Assets/` and `public/models/` are git-ignored. To restore them locally, unpack both packs into
`Assets/`, move the GLBs into `public/models/` as above, then run
`node scripts/generate-asset-manifest.mjs`.
