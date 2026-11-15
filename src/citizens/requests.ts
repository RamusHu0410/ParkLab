import type { Entrance } from '../geography/parkGeometry'
import { findRoute, reachable } from '../simulation/pathfinding'
import { Cell } from '../simulation/navGrid'
import { co2UptakeTonnes, CO2, landUse, type LandUse, type ParkSnapshot, pathNextToTraffic, routeDangerM, shadedPathLength } from '../simulation/parkMetrics'
import { dist, distToRingEdge, ringCentroid, type Vec2 } from '../utils/geometry2d'

export interface Criterion {
  label: string
  value: string
  target: string
  pass: boolean
  /** Bonus criteria raise happiness but are not needed to satisfy the request. */
  bonus?: boolean
  /** 0..1 progress towards the target, for the bar. */
  progress: number
}

export interface RequestResult {
  id: string
  citizenId: string
  name: string
  role: string
  icon: string
  text: string
  /** All required criteria pass. */
  satisfied: boolean
  /** 0–100. */
  happiness: number
  criteria: Criterion[]
  notes: string[]
  /**
   * What the citizen says, in their own words: a vague hint for each unmet
   * requirement (bonuses only once the requirements are met), or thanks.
   * The exact numbers stay in `criteria`, shown only in help mode.
   */
  voice: string[]
}

/** Picks the lines to say: hints for failed requirements, else for missed bonuses, else the praise. */
function voiceOf(criteria: Criterion[], hints: string[], praise: string): string[] {
  const failed = criteria.map((c, i) => ({ c, h: hints[i] })).filter(({ c, h }) => !c.pass && h)
  const required = failed.filter(({ c }) => !c.bonus).map(({ h }) => h)
  if (required.length) return required
  const bonus = failed.filter(({ c }) => c.bonus).map(({ h }) => h)
  return bonus.length ? [praise, ...bonus.slice(0, 1)] : [praise]
}

/** Figures of the park as it was before the player changed anything. */
export interface Baseline {
  land: LandUse
}

const fmt = (n: number, unit: string, digits = 0) => `${n.toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${unit}`
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const clamp100 = (x: number) => Math.round(Math.max(0, Math.min(100, x)))
/** Required criteria set the base; each bonus adds a little on top. */
function happinessOf(criteria: Criterion[], penalty = 0) {
  const req = criteria.filter((c) => !c.bonus)
  const bonus = criteria.filter((c) => c.bonus)
  const base = req.length ? (req.reduce((s, c) => s + (c.pass ? 1 : c.progress * 0.6), 0) / req.length) * 85 : 85
  return clamp100(base + bonus.filter((c) => c.pass).length * (15 / Math.max(1, bonus.length)) - penalty)
}

/** Entrance(s) of the park facing the end of a side street. */
export function entrancesFacingStreet(snap: ParkSnapshot, streetName: string, maxM = 45): Entrance[] {
  const ends = snap.geo.streets.filter((s) => s.name === streetName).flatMap((s) => [s.line[0], s.line[s.line.length - 1]])
  const end = ends.sort((a, b) => distToRingEdge(a, snap.geo.outer) - distToRingEdge(b, snap.geo.outer))[0]
  if (!end) return []
  return snap.entrances.filter((e) => dist(e.point, end) <= maxM).sort((a, b) => dist(a.point, end) - dist(b.point, end))
}

// ---------------------------------------------------------------------------
// Enoch — environmentalist

export const ENOCH_TARGETS = {
  greenShare: 0.85,
  maxParkingM2: 4000,
  largestOpenM2: 9000,
  co2Tonnes: 35,
}

function enoch(snap: ParkSnapshot): RequestResult {
  const t = ENOCH_TARGETS
  const land = landUse(snap)
  const green = land.greenM2 / land.parkM2
  const co2 = co2UptakeTonnes(snap)
  const criteria: Criterion[] = [
    { label: 'Green space coverage', value: `${(green * 100).toFixed(1)}%`, target: `≥ ${t.greenShare * 100}%`, pass: green >= t.greenShare, progress: clamp01(green / t.greenShare) },
    {
      label: 'Parking area',
      value: fmt(land.parkingM2, 'm²'),
      target: `≤ ${fmt(t.maxParkingM2, 'm²')}`,
      pass: land.parkingM2 <= t.maxParkingM2,
      progress: clamp01(t.maxParkingM2 / Math.max(1, land.parkingM2)),
    },
    {
      label: 'Largest open lawn',
      value: fmt(land.largestOpenM2, 'm²'),
      target: `≥ ${fmt(t.largestOpenM2, 'm²')}`,
      pass: land.largestOpenM2 >= t.largestOpenM2,
      progress: clamp01(land.largestOpenM2 / t.largestOpenM2),
    },
    { label: 'CO₂ absorbed per year', value: fmt(co2, 't', 1), target: `≥ ${t.co2Tonnes} t`, pass: co2 >= t.co2Tonnes, progress: clamp01(co2 / t.co2Tonnes) },
  ]
  return {
    id: 'enoch',
    citizenId: 'enoch',
    name: 'Enoch',
    role: 'Environmentalist',
    icon: '🌿',
    text: 'Keep the park green: more green cover and open lawn, less parking, and more CO₂ taken out of the air.',
    satisfied: criteria.every((c) => c.bonus || c.pass),
    happiness: happinessOf(criteria),
    criteria,
    voice: voiceOf(
      criteria,
      [
        'The park is starting to feel grey. I want to see more green.',
        'Why does a park need so much asphalt for cars?',
        'I miss having one big open meadow where nothing is in the way.',
        'We need more trees and wild planting soaking up carbon.',
      ],
      'This park breathes now. Thank you for keeping it green!',
    ),
    notes: [
      `CO₂ is an estimate: ${CO2.perTreeKg} kg per tree per year (${snap.trees.length} trees) plus ${CO2.perWoodM2Kg} kg/m² of woodland and ${CO2.perLawnM2Kg} kg/m² of lawn.`,
      'Open lawn = grass with no path, court, tree or furniture on it.',
    ],
  }
}

// ---------------------------------------------------------------------------
// Adam — student

/**
 * ≈ 1.2 × the 303 m straight line between the Greenspire Ave entrance and the Bur Oak Ave
 * entrance opposite the school. Today's best path route is 390 m. The straight line crosses a
 * soccer field (paths can't be built through it), so the target allows a detour around it.
 */
export const ADAM_TARGET_M = 365

/** Best path-only route from the Greenspire Ave entrance to the Bur Oak Ave entrance facing the school. */
export function adamRoute(snap: ParkSnapshot) {
  const from = entrancesFacingStreet(snap, 'Greenspire Avenue')
  const school = snap.geo.destinations.find((d) => d.name === 'Bur Oak Secondary School')
  const schoolPt = school ? ringCentroid(school.ring) : null
  const toCandidates = schoolPt
    ? snap.entrances
        .filter((e) => e.street === 'Bur Oak Avenue')
        .sort((a, b) => dist(a.point, schoolPt) - dist(b.point, schoolPt))
        .filter((e, _, all) => dist(e.point, schoolPt) <= dist(all[0].point, schoolPt) + 60)
    : []
  let best: { from: Entrance; to: Entrance; points: Vec2[]; lengthM: number } | null = null
  for (const a of from)
    for (const b of toCandidates) {
      const r = findRoute(snap.grid, a.point, b.point, 'paths', { snapM: 6 })
      if (r && (!best || r.lengthM < best.lengthM)) best = { from: a, to: b, ...r }
    }
  return { from: from[0], to: toCandidates[0], schoolPt, best }
}

function adam(snap: ParkSnapshot): RequestResult {
  const { from, to, best } = adamRoute(snap)
  const notes: string[] = []
  if (!from) notes.push('There is no park entrance at Greenspire Ave. A path has to reach the park edge there.')
  const straight = from && to ? dist(from.point, to.point) : 0
  const criteria: Criterion[] = [
    {
      label: 'Path route Greenspire Ave → Bur Oak Ave (facing the school)',
      value: best ? 'Connected' : 'Not connected',
      target: 'Connected',
      pass: !!best,
      progress: best ? 1 : 0,
    },
    {
      label: 'Route distance',
      value: best ? fmt(best.lengthM, 'm') : '—',
      target: `≤ ${fmt(ADAM_TARGET_M, 'm')}`,
      pass: !!best && best.lengthM <= ADAM_TARGET_M,
      progress: best ? clamp01(ADAM_TARGET_M / best.lengthM) : 0,
    },
  ]
  if (straight) notes.push(`Straight-line distance between the two entrances: ${fmt(straight, 'm')}.`)
  notes.push('Only paths count (no shortcuts across the grass).')
  return {
    id: 'adam',
    citizenId: 'adam',
    name: 'Adam',
    role: 'Student',
    icon: '🎒',
    text: 'I walk from Greenspire Ave to Bur Oak Secondary School every day. I need a fast path through the park.',
    satisfied: criteria.every((c) => c.pass),
    happiness: happinessOf(criteria),
    criteria,
    voice: voiceOf(
      criteria,
      [
        "There's no path that gets me from Greenspire to school. I end up trudging through the wet grass.",
        'The paths wind all over the place. I keep being late for first period!',
      ],
      'I get to school in no time now. Best shortcut ever!',
    ),
    notes,
  }
}

// ---------------------------------------------------------------------------
// Bob — the elderly

export const BOB_MAX_LAND_LOSS_M2 = 250
export const BOB_HOME_STREET = 'Herbert Calbert Drive'

/** Cells of the largest connected piece of paved, step-free path: the park's main accessible network. */
function mainAccessibleNetwork(snap: ParkSnapshot): Uint8Array {
  const g = snap.grid
  const done = new Uint8Array(g.cells.length)
  let best: Uint8Array = new Uint8Array(g.cells.length)
  let bestN = 0
  for (let k = 0; k < g.cells.length; k++) {
    if (done[k] || g.cells[k] !== Cell.PavedPath) continue
    const comp = reachable(g, g.center(k), 'accessible', 0)
    let n = 0
    for (let q = 0; q < comp.length; q++) if (comp[q]) {
      done[q] = 1
      n++
    }
    if (n > bestN) [best, bestN] = [comp, n]
  }
  return best
}

/** Benches Bob can reach from his entrance on paved, step-free paths, and whether that reaches the main network. */
export function bobBenches(snap: ParkSnapshot) {
  const home = entrancesFacingStreet(snap, BOB_HOME_STREET)[0] ?? null
  if (!home) return { home, connected: false, benches: [] as { p: Vec2; shaded: boolean; d: number }[] }
  const seen = reachable(snap.grid, home.point, 'accessible', 6)
  const main = mainAccessibleNetwork(snap)
  let connected = false
  for (let k = 0; k < seen.length && !connected; k++) if (seen[k] && main[k]) connected = true
  const shadeIdx = snap.trees
  const benches = snap.items
    .filter((i) => i.assetId === 'park_bench' || i.assetId === 'picnic_table')
    .map((i) => [i.position[0], i.position[2]] as Vec2)
    .filter((p) => {
      // Reachable if an accessible cell within 3 m of the bench is connected to the entrance.
      const k = snap.grid.nearest(p, (t) => t === Cell.PavedPath, 3)
      return k >= 0 && seen[k] === 1
    })
    .map((p) => ({ p, shaded: shadeIdx.some((t) => dist(t.p, p) <= t.canopyR + 1.5), d: dist(p, home.point) }))
    .sort((a, b) => a.d - b.d)
  return { home, connected, benches }
}

function bob(snap: ParkSnapshot, baseline: Baseline): RequestResult {
  const land = landUse(snap)
  const lost = Math.max(0, baseline.land.greenM2 - land.greenM2)
  const { home, connected, benches } = bobBenches(snap)
  const shaded = benches.filter((b) => b.shaded).length
  const criteria: Criterion[] = [
    {
      label: `Accessible path from ${BOB_HOME_STREET} into the park's path network`,
      value: !home ? 'No entrance' : connected ? 'Connected' : 'Not connected',
      target: 'Connected',
      pass: connected,
      progress: connected ? 1 : 0,
    },
    {
      label: 'Unused land removed',
      value: fmt(lost, 'm²'),
      target: `≤ ${fmt(BOB_MAX_LAND_LOSS_M2, 'm²')}`,
      pass: lost <= BOB_MAX_LAND_LOSS_M2,
      progress: clamp01(BOB_MAX_LAND_LOSS_M2 / Math.max(1, lost)),
    },
    { label: 'Benches on accessible paths', value: String(benches.length), target: '≥ 10', pass: benches.length >= 10, bonus: true, progress: clamp01(benches.length / 10) },
    { label: 'Shaded benches', value: String(shaded), target: '≥ 3', pass: shaded >= 3, bonus: true, progress: clamp01(shaded / 3) },
  ]
  return {
    id: 'bob',
    citizenId: 'bob',
    name: 'Bob',
    role: 'Senior',
    icon: '🧓',
    text: 'I use a walker. I need a smooth, step-free path to a bench, and please don’t pave over the open land.',
    satisfied: criteria.every((c) => c.bonus || c.pass),
    happiness: happinessOf(criteria),
    criteria,
    voice: voiceOf(
      criteria,
      [
        `From ${BOB_HOME_STREET} I can't get onto the good paths with my walker. The ground is too rough.`,
        "You're paving over the open land. Please leave the park some room.",
        'A few more benches along the smooth paths would help my knees.',
        'Somewhere to sit in the shade would be lovely on hot days.',
      ],
      'I can get around the park on my own again. Thank you, young one.',
    ),
    notes: [
      'Unused land = ground with nothing built on it (lawn, woods, planted areas). Paths, courts and plazas use it up; demolishing them gives it back.',
      'Accessible = paved and step-free. OSM paths with no surface tag are counted as paved; the gravel path does not count.',
    ],
  }
}

// ---------------------------------------------------------------------------
// Colgne — the parent

export const COLGNE_HOME_STREET = 'Hyacinth Street'
export const COLGNE_MAX_TRAFFIC_M = 10

/** Colgne's walk to the nearest playground on paths, choosing the route that avoids traffic. */
export function colgneRoute(snap: ParkSnapshot) {
  const home = entrancesFacingStreet(snap, COLGNE_HOME_STREET)[0] ?? null
  if (!home) return { home, best: null }
  let best: { playground: number; points: Vec2[]; lengthM: number; trafficM: number } | null = null
  snap.geo.playgrounds.forEach((pg, i) => {
    const r = findRoute(snap.grid, home.point, ringCentroid(pg.ring), 'paths', { snapM: 10, danger: snap.danger, dangerFactor: 8 })
    if (!r) return
    const trafficM = routeDangerM(snap, r.points)
    const score = r.lengthM + trafficM * 8
    if (!best || score < best.lengthM + best.trafficM * 8) best = { playground: i, ...r, trafficM }
  })
  return { home, best: best as { playground: number; points: Vec2[]; lengthM: number; trafficM: number } | null }
}

function colgne(snap: ParkSnapshot): RequestResult {
  const { home, best } = colgneRoute(snap)
  const network = pathNextToTraffic(snap)
  const criteria: Criterion[] = [
    {
      label: `Path from ${COLGNE_HOME_STREET} to a playground`,
      value: !home ? 'No entrance' : best ? `${fmt(best.lengthM, 'm')} walk` : 'Not connected',
      target: 'Connected',
      pass: !!best,
      progress: best ? 1 : 0,
    },
    {
      label: 'Her route beside traffic',
      value: best ? fmt(best.trafficM, 'm') : '—',
      target: `≤ ${fmt(COLGNE_MAX_TRAFFIC_M, 'm')}`,
      pass: !!best && best.trafficM <= COLGNE_MAX_TRAFFIC_M,
      progress: best ? clamp01(COLGNE_MAX_TRAFFIC_M / Math.max(1, best.trafficM)) : 0,
    },
  ]
  // Every metre of park path beside traffic worries her a little.
  const penalty = Math.min(30, network.unsafeM / 20)
  return {
    id: 'colgne',
    citizenId: 'colgne',
    name: 'Colgne',
    role: 'Parent',
    icon: '👩‍👧',
    text: 'I bring my daughter to the playground. Our path must keep away from cars: paths right next to roads and parking make me nervous.',
    satisfied: criteria.every((c) => c.pass),
    happiness: happinessOf(criteria, penalty),
    criteria,
    voice: voiceOf(
      criteria,
      [
        "There isn't a proper path from our street to the playground.",
        'Our walk to the playground runs right beside the cars. It scares me with a little one.',
      ],
      'We walk to the playground without going near a single car. I can relax!',
    ),
    notes: [
      `Beside traffic = within ${12} m of a street centreline, or ${3} m of a service road or parking lot. Park-wide: ${fmt(network.unsafeM, 'm')} of ${fmt(network.totalM, 'm')} of path (−${penalty.toFixed(0)} happiness).`,
    ],
  }
}

// ---------------------------------------------------------------------------
// Dylan — dog walker

export const DYLAN_TARGET_M = 5000

function dylan(snap: ParkSnapshot): RequestResult {
  const { shadedM, totalM } = shadedPathLength(snap)
  const criteria: Criterion[] = [
    {
      label: 'Path under shade',
      value: fmt(shadedM / 1000, 'km', 2),
      target: `≥ ${fmt(DYLAN_TARGET_M / 1000, 'km', 0)}`,
      pass: shadedM >= DYLAN_TARGET_M,
      progress: clamp01(shadedM / DYLAN_TARGET_M),
    },
  ]
  return {
    id: 'dylan',
    citizenId: 'dylan',
    name: 'Dylan',
    role: 'Dog walker',
    icon: '🐕',
    text: 'My dog and I walk for an hour every day. I want long paths with trees along them, so we stay in the shade.',
    satisfied: criteria.every((c) => c.pass),
    happiness: happinessOf(criteria),
    criteria,
    voice: voiceOf(
      criteria,
      [
        shadedM < DYLAN_TARGET_M * 0.3
          ? 'There’s hardly any shade on the paths. My dog is panting after ten minutes.'
          : 'It’s getting shadier, but our walks are still too short and too sunny.',
      ],
      'Long shady walks every day. My dog loves it here!',
    ),
    notes: [`Shaded = a tree canopy within 1 m of the path. The park has ${fmt(totalM / 1000, 'km', 2)} of path in total.`],
  }
}

/** All requests, Enoch first. */
export function evaluateRequests(snap: ParkSnapshot, baseline: Baseline): RequestResult[] {
  return [enoch(snap), adam(snap), bob(snap, baseline), colgne(snap), dylan(snap)]
}

export function makeBaseline(snap: ParkSnapshot): Baseline {
  return { land: landUse(snap) }
}
