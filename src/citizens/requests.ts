import type { AreaType, FacilityType } from '../construction/blocks'
import type { Facility } from '../construction/facilities'
import type { Entrance } from '../geography/parkGeometry'
import { findRoute, reachable } from '../simulation/pathfinding'
import { Cell } from '../simulation/navGrid'
import { co2UptakeTonnes, CO2, landUse, type LandUse, type ParkSnapshot, routeDangerM } from '../simulation/parkMetrics'
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
  /** Courts and fields present at the start, so demolitions can be counted. */
  facilities: { id: string; kind: Facility['kind'] }[]
}

const fmt = (n: number, unit: string, digits = 0) => `${n.toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${unit}`
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const clamp100 = (x: number) => Math.round(Math.max(0, Math.min(100, x)))
/**
 * Happiness rubric:
 * - everyone starts from a 45 floor;
 * - required criteria lift it to 80 at most. Each met requirement counts fully, unmet ones by a
 *   small share of their progress, and the curve is eased (^1.5) so a half-done request sits
 *   near 57 rather than 62;
 * - only bonus criteria go above 80, up to 100.
 */
export const HAPPINESS = { floor: 45, requiredMax: 80, partialWeight: 0.15 }
function happinessOf(criteria: Criterion[], penalty = 0) {
  const req = criteria.filter((c) => !c.bonus)
  const bonus = criteria.filter((c) => c.bonus)
  const h = HAPPINESS
  const score = req.length ? req.reduce((s, c) => s + (c.pass ? 1 : c.progress * h.partialWeight), 0) / req.length : 1
  const base = h.floor + (h.requiredMax - h.floor) * score ** 1.5
  // Bonuses only count once all requirements are met, so 80 is the ceiling until then.
  const allMet = req.every((c) => c.pass)
  const extra = allMet && bonus.length ? (bonus.filter((c) => c.pass).length / bonus.length) * (100 - h.requiredMax) : 0
  return clamp100(Math.min(allMet ? 100 : h.requiredMax, base + extra) - penalty)
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
// Adam — student (route helper used by his walking routine)

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

// ---------------------------------------------------------------------------
// Bob — the elderly (bench helper used by his walking routine)

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

// ---------------------------------------------------------------------------
// Colgne — the parent (route helper used by her walking routine)

export const COLGNE_HOME_STREET = 'Hyacinth Street'

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

// ---------------------------------------------------------------------------
// Construction jobs: Adam, Bob, Colgne and Dylan each ask for something to be built or removed.

/** Facility blocks of one type the player has built. */
const builtCount = (snap: ParkSnapshot, type: FacilityType) => snap.blocks.filter((b) => b.shape.kind === 'facility' && b.shape.type === type).length
/** Ground painted with one area type (m², as claimed when built). */
const paintedM2 = (snap: ParkSnapshot, type: AreaType) => snap.blocks.reduce((a, b) => a + (b.shape.kind === 'area' && b.shape.type === type ? b.cells.length : 0), 0)
/** Courts or fields of one kind that were in the park at the start and have been demolished. */
const demolished = (snap: ParkSnapshot, baseline: Baseline, kind: Facility['kind']) => {
  const now = new Set(snap.facilities.map((f) => f.id))
  return baseline.facilities.filter((f) => f.kind === kind && !now.has(f.id)).length
}

const buildJob = (label: string, n: number, need = 1, bonus = false): Criterion => ({
  label,
  value: `${n} built`,
  target: `≥ ${need}`,
  pass: n >= need,
  bonus,
  progress: clamp01(n / need),
})
const areaJob = (label: string, m2: number, need: number, bonus = false): Criterion => ({
  label,
  value: fmt(m2, 'm²'),
  target: `≥ ${fmt(need, 'm²')}`,
  pass: m2 >= need,
  bonus,
  progress: clamp01(m2 / need),
})

/** Green space coverage as a criterion: the park's existing greenery counts from the start. */
function greenJob(snap: ParkSnapshot, label: string, target = ENOCH_TARGETS.greenShare): Criterion {
  const land = landUse(snap)
  const g = land.parkM2 ? land.greenM2 / land.parkM2 : 0
  return { label, value: `${(g * 100).toFixed(1)}%`, target: `≥ ${Math.round(target * 100)}%`, pass: g >= target, progress: clamp01(g / target) }
}

function job(
  base: Pick<RequestResult, 'id' | 'name' | 'role' | 'icon' | 'text'>,
  criteria: Criterion[],
  hints: string[],
  praise: string,
  notes: string[] = [],
): RequestResult {
  return {
    ...base,
    citizenId: base.id,
    satisfied: criteria.every((c) => c.bonus || c.pass),
    happiness: happinessOf(criteria),
    criteria,
    voice: voiceOf(criteria, hints, praise),
    notes,
  }
}

function adam(snap: ParkSnapshot): RequestResult {
  return job(
    { id: 'adam', name: 'Adam', role: 'Student', icon: '🎒', text: 'My friends and I need somewhere to play after school: a new basketball court and an outdoor gym.' },
    [buildJob('New basketball court', builtCount(snap, 'basketball_court')), buildJob('Outdoor fitness area', builtCount(snap, 'fitness_area')), buildJob('Picnic area to hang out', builtCount(snap, 'picnic_area'), 1, true)],
    ['The courts are always full after school. We need another basketball court.', "There's nowhere to do pull-ups. An outdoor gym would be awesome.", 'Somewhere with tables to hang out after a game would be nice.'],
    'New court, new gym. Best park in Markham!',
    ['Build these with the Facilities tab.'],
  )
}

export const BOB_FLOWER_M2 = 300

function bob(snap: ParkSnapshot): RequestResult {
  return job(
    { id: 'bob', name: 'Bob', role: 'Senior', icon: '🧓', text: 'I’d love a plaza where the neighbours can meet, with a flower garden to look at.' },
    [
      buildJob('Community plaza', builtCount(snap, 'community_plaza')),
      areaJob('Flower garden', paintedM2(snap, 'flower_garden'), BOB_FLOWER_M2),
      greenJob(snap, 'Green space coverage'),
      areaJob('Picnic lawn', paintedM2(snap, 'picnic_lawn'), 200, true),
    ],
    ['There’s no square where us old folks can sit together and chat.', 'A proper flower garden would brighten my mornings.', 'The park is losing its green. I liked it leafy.', 'A lawn for family picnics would bring the grandchildren round.'],
    'A plaza and flowers! I come here every morning now.',
    ['Paint areas with the Areas tab (brush or polygon).'],
  )
}

export const COLGNE_PICNIC_M2 = 400

/** Playground sites: OSM maps each site as several touching polygons, so polygons within 60 m count as one. */
function playgroundSites(snap: ParkSnapshot): number {
  const sites: Vec2[] = []
  for (const pg of snap.geo.playgrounds) {
    const c = ringCentroid(pg.ring)
    if (!sites.some((q) => dist(q, c) < 60)) sites.push(c)
  }
  return sites.length
}

function colgne(snap: ParkSnapshot): RequestResult {
  return job(
    { id: 'colgne', name: 'Colgne', role: 'Parent', icon: '👩‍👧', text: 'The playgrounds are crowded. Please build a new one, with a picnic lawn beside it for the parents.' },
    [
      (() => {
        // The two playgrounds already in the park count from the start, so she begins partly happy.
        const n = playgroundSites(snap)
        return { label: 'Existing playgrounds', value: `${n}`, target: '≥ 2', pass: n >= 2, progress: clamp01(n / 2) }
      })(),
      buildJob('New playground', builtCount(snap, 'playground')),
      areaJob('Picnic lawn', paintedM2(snap, 'picnic_lawn'), COLGNE_PICNIC_M2),
      buildJob('Picnic area with a shelter', builtCount(snap, 'picnic_area'), 1, true),
    ],
    ['We loved the old playgrounds. Please don’t take them away.', 'My daughter waits ages for the swings. We need another playground.', 'There’s nowhere for us parents to sit on a blanket while the kids play.', 'A shelter with tables would save us when it rains.'],
    'A brand new playground and a lawn to relax on. Thank you!',
  )
}

export const DYLAN_GRASS_M2 = 600

function dylan(snap: ParkSnapshot, baseline: Baseline): RequestResult {
  const removed = demolished(snap, baseline, 'tennis_court')
  return job(
    { id: 'dylan', name: 'Dylan', role: 'Dog walker', icon: '🐕', text: 'Hardly anyone plays on the tennis courts. Take one out and give the dogs a grassy run, with some wild habitat around it.' },
    [
      { label: 'Tennis court removed', value: `${removed} removed`, target: '≥ 1', pass: removed >= 1, progress: clamp01(removed) },
      areaJob('Grassland dog run', paintedM2(snap, 'grassland'), DYLAN_GRASS_M2),
      greenJob(snap, 'Green space for walks'),
      areaJob('Biodiversity habitat', paintedM2(snap, 'habitat'), 300, true),
    ],
    ['Those empty tennis courts take up so much space. My dog could run there!', 'We need a big grassy patch where dogs can stretch their legs.', 'Keep the park green. That’s where we walk every day.', 'Some wild planting would keep the birds and butterflies around.'],
    'An off-leash run! My dog has never been so happy.',
    ['Remove the court with the Remove tab, then paint grassland where it was.'],
  )
}

/** All requests, Enoch first. */
export function evaluateRequests(snap: ParkSnapshot, baseline: Baseline): RequestResult[] {
  return [enoch(snap), adam(snap), bob(snap), colgne(snap), dylan(snap, baseline)]
}

export function makeBaseline(snap: ParkSnapshot): Baseline {
  return { land: landUse(snap), facilities: snap.facilities.map((f) => ({ id: f.id, kind: f.kind })) }
}
