# ParkLab

ParkLab is a browser game where you redesign a real park for the people who live around it. The first level is Wismer Park in Markham, Ontario, built from the City of Markham's park boundaries and OpenStreetMap data and shown as a 3D scene on a live map.

You start with a $250,000 CAD budget and five neighbours, each with a request:

| Resident | Role | Wants |
|---|---|---|
| Enoch | Environmentalist | More green cover, a big open lawn, less parking, more CO₂ absorbed |
| Adam | Student | A new basketball court and an outdoor gym |
| Bob | Senior | A community plaza with a flower garden |
| Colgne | Parent | Another playground with a picnic lawn beside it |
| Dylan | Dog walker | Replace a tennis court with a grassy dog run and wild habitat |

You draw paths, paint areas (woodland, grassland, gardens, habitat, picnic lawn), place facilities, and remove existing features. The requests pull against each other and against the budget, so you can't satisfy everyone completely.

When you submit, the design is checked against five rules modelled on real regulations: park boundary, facility overlap, safety clearance (CSA Z614, FIFA, FIBA), accessibility (Ontario O. Reg. 191/11) and environmental protection (Conservation Authorities Act). A broken rule disqualifies the design. Otherwise residents' average happiness sets a 1–3 star rating, and a low environmental score takes one star away.

The residents and their requests are fictional. ParkLab is a learning tool, not a planning forecast.

## Stack

React 19, TypeScript, Vite, MapLibre GL, Three.js / React Three Fiber, Zustand, proj4. Tests use Vitest.

## Run

```
npm install
npm run dev        # http://localhost:5173
npm test
npm run build
```

`?view=scene` opens the standalone 3D test scene.

## Layout

```
src/
  components/    UI panels (top bar, construction, requests, meters, rules)
  construction/  building tools, costs, rule checks (compliance.ts), sources
  citizens/      residents, their requests and walking routines
  simulation/    park metrics: green share, CO₂, shade, path safety, pathfinding
  geography/     map setup, projection, park geometry
  scene/         3D rendering of the park and characters
  store/         game state (Zustand)
data/            OSM extracts and level config (budget, costs)
scripts/         OSM fetch, GeoJSON build, asset manifest generation
public/          park GeoJSON, 3D models, Draco decoder
```

## Assets

The asset pack licences forbid redistributing the model files, so `Assets/` and `public/models/` are git-ignored. To restore them, unpack the Low Poly Playground & Park Pack and the Cartoon City Asset Pack into `Assets/`, move the GLBs into `public/models/environment/` and `public/models/characters/`, then run `node scripts/generate-asset-manifest.mjs`.
