import type { ParkSnapshot } from '../simulation/parkMetrics'
import { findRoute, type RouteMode } from '../simulation/pathfinding'
import { Cell } from '../simulation/navGrid'
import { dist, pointInRing, ringCentroid, seededRandom, type Vec2 } from '../utils/geometry2d'
import { CHARACTER_SCALE } from '../construction/catalog'
import { adamRoute, bobBenches, BOB_HOME_STREET, COLGNE_HOME_STREET, colgneRoute, entrancesFacingStreet } from './requests'
import { WALK_STRIDE_SPEED } from './characters'
import { REPRESENTATIVE_LOOKS } from './looks'

export type Movement = 'idle' | 'walking' | 'arrived' | 'stuck'

/** What the panel shows for each citizen. */
export interface CitizenStatus {
  id: string
  name: string
  role: string
  icon: string
  assetId: string
  /** Request this citizen raised, if any (the five representatives). */
  requestId: string | null
  /** Representative (request id) who speaks for this citizen's group. */
  group: string
  position: Vec2
  destination: string | null
  activity: string
  movement: Movement
  /** Route mode used for the current walk. */
  routeMode: RouteMode | null
}

/** One leg of a citizen's routine. */
interface Leg {
  /** Where to go; null = can't decide (e.g. no entrance). */
  target: (snap: ParkSnapshot, self: Runtime) => Vec2 | null
  label: string
  /** Route modes to try in order; the first that finds a route is used. */
  modes: RouteMode[]
  walking: string
  /** Shown while walking when only a later mode (a fallback) worked. */
  fallbackWalking?: string
  doing: string
  dwellS: number
  /** Facility (marker key) the citizen uses while dwelling. */
  facility?: (snap: ParkSnapshot, self?: Runtime) => string | null
  /** Avoid paths beside traffic (Colgne). */
  avoidTraffic?: boolean
}

interface Profile {
  id: string
  name: string
  role: string
  icon: string
  assetId: string
  requestId: string | null
  /** Request id of the representative who speaks for this citizen. */
  group: string
  /** Walk clip playback speed (1.3 for a normal stroll). */
  pace: number
  legs: Leg[]
  /** Follows another citizen instead of routing on its own (the child). */
  follows?: string
}

interface Runtime {
  profile: Profile
  status: CitizenStatus
  leg: number
  route: Vec2[]
  /** Index of the next route point. */
  next: number
  yaw: number
  dwellLeft: number
  retryIn: number
  facilityInUse: string | null
  rand: () => number
  /** Waiting in the route queue. */
  queued: boolean
}

/** Hooks into the renderer and the facility icons. */
export interface CitizenSimHost {
  addAgent(id: string, assetId: string, scale: number, tint?: Record<string, number>): Promise<void>
  setAgent(id: string, x: number, z: number, yaw: number, clip: 'Idle' | 'Walk', timeScale: number): void
  startUsingFacility(id: string): void
  stopUsingFacility(id: string): void
}

const entrance = (street: string) => (snap: ParkSnapshot) => entrancesFacingStreet(snap, street)[0]?.point ?? null

/** A random point on the path network between `minM` and `maxM` from `near`, so walkers spread over the park. */
function randomPathPoint(snap: ParkSnapshot, rand: () => number, near?: Vec2, minM = 0, maxM = Infinity): Vec2 | null {
  const g = snap.grid
  for (let attempt = 0; attempt < 2000; attempt++) {
    const k = Math.floor(rand() * g.cells.length)
    if (g.cells[k] !== Cell.PavedPath && g.cells[k] !== Cell.RoughPath) continue
    const p = g.center(k)
    if (near && (dist(p, near) < minM || dist(p, near) > maxM)) continue
    return p
  }
  return null
}

/** A random walkable point inside `ring`, preferring ones within `maxM` of `near`. */
function randomIn(snap: ParkSnapshot, ring: Vec2[], rand: () => number, near?: Vec2, maxM = Infinity): Vec2 | null {
  const xs = ring.map((p) => p[0])
  const zs = ring.map((p) => p[1])
  let fallback: Vec2 | null = null
  for (let attempt = 0; attempt < 400; attempt++) {
    const p: Vec2 = [Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs)), Math.min(...zs) + rand() * (Math.max(...zs) - Math.min(...zs))]
    if (!pointInRing(p, ring) || snap.grid.typeAt(p) === Cell.Blocked) continue
    if (!near || dist(p, near) <= maxM) return p
    if (!fallback || dist(p, near) < dist(fallback, near)) fallback = p
  }
  return fallback
}

const PROFILES: Profile[] = [
  {
    id: 'enoch',
    group: 'enoch',
    name: 'Enoch',
    role: 'Environmentalist',
    icon: '🌿',
    assetId: 'Person_Worker_Yellow',
    requestId: 'enoch',
    pace: 1.1,
    legs: [
      { target: (s, r) => randomIn(s, s.geo.woodlot, r.rand, r.status.position, 150), label: 'the woodlot', modes: ['walk'], walking: 'Heading into the woodlot', doing: 'Counting trees', dwellS: 14 },
      { target: (s, r) => randomIn(s, s.geo.valley, r.rand, r.status.position, 150), label: 'the stream valley', modes: ['walk'], walking: 'Walking to the stream', doing: 'Watching birds by the stream', dwellS: 14 },
    ],
  },
  {
    id: 'adam',
    group: 'adam',
    name: 'Adam',
    role: 'Student',
    icon: '🎒',
    assetId: 'Person_Basketball_Blue',
    requestId: 'adam',
    pace: 1.5,
    legs: [
      {
        target: (s) => adamRoute(s).from?.point ?? null,
        label: 'the Greenspire Ave entrance',
        modes: ['paths', 'walk'],
        walking: 'Walking home to Greenspire Ave',
        fallbackWalking: 'Cutting across the grass to Greenspire Ave (no path route)',
        doing: 'Waiting to cross Castlemore Ave',
        dwellS: 4,
      },
      {
        target: (s) => adamRoute(s).best?.to.point ?? adamRoute(s).to?.point ?? null,
        label: 'Bur Oak Secondary School',
        modes: ['paths', 'walk'],
        walking: 'Hurrying to Bur Oak Secondary School',
        fallbackWalking: 'Cutting across the grass to school (no path route)',
        doing: 'Crossing Bur Oak Ave to school',
        dwellS: 4,
      },
    ],
  },
  {
    id: 'bob',
    group: 'bob',
    name: 'Bob',
    role: 'Senior',
    icon: '🧓',
    assetId: 'Person_Man_Blue',
    requestId: 'bob',
    pace: 0.85,
    legs: [
      {
        target: (s) => bobBenches(s).benches[0]?.p ?? nearestBench(s, entrance(BOB_HOME_STREET)(s)),
        label: 'a bench',
        modes: ['accessible', 'walk'],
        walking: 'Walking slowly to a bench',
        fallbackWalking: 'Struggling over rough ground to a bench (no accessible route)',
        doing: 'Resting on a bench',
        dwellS: 20,
      },
      { target: entrance(BOB_HOME_STREET), label: `the ${BOB_HOME_STREET} entrance`, modes: ['accessible', 'walk'], walking: 'Heading home', fallbackWalking: 'Struggling home over rough ground', doing: 'Catching his breath at the gate', dwellS: 6 },
    ],
  },
  {
    id: 'colgne',
    group: 'colgne',
    name: 'Colgne',
    role: 'Parent',
    icon: '👩‍👧',
    assetId: 'Person_Woman_Pink',
    requestId: 'colgne',
    pace: 1.2,
    legs: [
      {
        target: (s) => {
          const best = colgneRoute(s).best
          return best ? ringCentroid(s.geo.playgrounds[best.playground].ring) : s.geo.playgrounds[0] ? ringCentroid(s.geo.playgrounds[0].ring) : null
        },
        label: 'the playground',
        modes: ['paths', 'walk'],
        walking: 'Walking her daughter to the playground',
        fallbackWalking: 'Crossing the grass to the playground (no path route)',
        doing: 'Watching her daughter play',
        dwellS: 25,
        avoidTraffic: true,
        facility: (s) => {
          const best = colgneRoute(s).best
          return best ? `playground-${best.playground}` : null
        },
      },
      { target: entrance(COLGNE_HOME_STREET), label: `the ${COLGNE_HOME_STREET} entrance`, modes: ['paths', 'walk'], walking: 'Taking her daughter home', doing: 'Holding hands to cross Castlemore Ave', dwellS: 6, avoidTraffic: true },
    ],
  },
  {
    id: 'mia',
    group: 'colgne',
    name: 'Mia',
    role: "Colgne's daughter",
    icon: '🧒',
    assetId: 'Person_Child_Orange',
    requestId: null,
    pace: 1.6,
    follows: 'colgne',
    legs: [],
  },
  {
    id: 'dylan',
    group: 'dylan',
    name: 'Dylan',
    role: 'Dog walker',
    icon: '🐕',
    assetId: REPRESENTATIVE_LOOKS.dylan.assetId,
    requestId: 'dylan',
    pace: 1.3,
    legs: [
      { target: (s, r) => randomPathPoint(s, r.rand, r.status.position, 60, 250), label: 'another part of the park', modes: ['paths', 'walk'], walking: 'Walking the dog', doing: 'Letting the dog sniff around', dwellS: 5 },
    ],
  },
  {
    id: 'jordan',
    group: 'adam',
    name: 'Jordan',
    role: 'Basketball player',
    icon: '🏀',
    assetId: 'Person_Basketball_Orange',
    requestId: null,
    pace: 1.4,
    legs: [
      { target: (s) => courtSpot(s, 0), label: 'the basketball court', modes: ['walk'], walking: 'Heading to the basketball court', doing: 'Shooting hoops', dwellS: 30, facility: (s) => courtId(s, 0) },
      { target: (s) => courtSpot(s, 1), label: 'the other basketball court', modes: ['walk'], walking: 'Looking for a pickup game', doing: 'Shooting hoops', dwellS: 30, facility: (s) => courtId(s, 1) },
    ],
  },
]

// ---------------------------------------------------------------------------
// Visitors: 23 more people, each in the group of the representative who speaks for them.

const randomEntrance = (s: ParkSnapshot, r: Runtime): Vec2 | null => {
  const far = s.entrances.filter((e) => dist(e.point, r.status.position) > 120)
  const list = far.length ? far : s.entrances
  return list.length ? list[Math.floor(r.rand() * list.length)].point : null
}

const randomBench = (s: ParkSnapshot, r: Runtime, maxM = 250): Vec2 | null => {
  const benches = s.items.filter((i) => i.assetId === 'park_bench').map((i) => [i.position[0], i.position[2]] as Vec2)
  const near = benches.filter((p) => dist(p, r.status.position) > 30 && dist(p, r.status.position) < maxM)
  const list = near.length ? near : benches
  return list.length ? list[Math.floor(r.rand() * list.length)] : null
}

const playgroundOf = (s: ParkSnapshot, r: Runtime) => {
  const pgs = s.geo.playgrounds
  if (!pgs.length) return -1
  // Each family has a favourite playground: the nearest one to where they are when they set off.
  let best = 0
  pgs.forEach((pg, i) => {
    if (dist(ringCentroid(pg.ring), r.status.position) < dist(ringCentroid(pgs[best].ring), r.status.position)) best = i
  })
  return best
}

const gazeboSpot = (s: ParkSnapshot, r: Runtime): Vec2 | null => {
  const tables = s.items.filter((i) => i.assetId === 'picnic_table' || i.assetId === 'gazebo')
  if (!tables.length) return null
  const t = tables[Math.floor(r.rand() * tables.length)]
  const a = r.rand() * Math.PI * 2
  return [t.position[0] + Math.cos(a) * 2.2, t.position[2] + Math.sin(a) * 2.2]
}

const soccerSpot = (s: ParkSnapshot, r: Runtime): Vec2 | null => {
  const fields = s.facilities.filter((f) => f.kind === 'soccer_field')
  if (!fields.length) return null
  const f = fields[Math.floor(r.rand() * fields.length)]
  const u = (r.rand() - 0.5) * f.length * 0.7
  const v = (r.rand() - 0.5) * f.width * 0.7
  return [f.center[0] + Math.cos(f.angle) * u - Math.sin(f.angle) * v, f.center[1] + Math.sin(f.angle) * u + Math.cos(f.angle) * v]
}
const soccerId = (s: ParkSnapshot, r: Runtime) => {
  const p = r.status.position
  return s.facilities.find((f) => f.kind === 'soccer_field' && Math.abs((p[0] - f.center[0]) * Math.cos(f.angle) + (p[1] - f.center[1]) * Math.sin(f.angle)) <= f.length / 2)?.id ?? null
}

type VisitorKind = 'nature' | 'student' | 'baller' | 'soccer' | 'senior' | 'family' | 'picnic' | 'dogwalker' | 'jogger'

const VISITOR_LEGS: Record<VisitorKind, { role: string; icon: string; group: string; pace: number; assets: string[]; legs: Leg[] }> = {
  nature: {
    role: 'Nature lover', icon: '🌳', group: 'enoch', pace: 1.1, assets: ['Person_Worker_Yellow', 'Person_Woman_Pink', 'Person_Man_Blue'],
    legs: [
      { target: (s, r) => randomIn(s, s.geo.woodlot, r.rand, r.status.position, 150), label: 'the woodlot', modes: ['walk'], walking: 'Strolling into the woods', doing: 'Looking at the trees', dwellS: 18 },
      { target: (s, r) => randomIn(s, s.geo.valley, r.rand, r.status.position, 150), label: 'the stream valley', modes: ['walk'], walking: 'Walking down to the stream', doing: 'Listening to the stream', dwellS: 18 },
    ],
  },
  student: {
    role: 'Student', icon: '🎒', group: 'adam', pace: 1.5, assets: ['Person_Basketball_Blue', 'Person_Child_Orange', 'Person_Basketball_Orange'],
    legs: [{ target: randomEntrance, label: 'another entrance', modes: ['paths', 'walk'], walking: 'Cutting through the park', fallbackWalking: 'Cutting across the grass', doing: 'Checking their phone', dwellS: 6 }],
  },
  baller: {
    role: 'Basketball player', icon: '🏀', group: 'adam', pace: 1.4, assets: ['Person_Basketball_Orange', 'Person_Basketball_Blue'],
    legs: [
      { target: (s, r) => courtSpot(s, Math.floor(r.rand() * 9)), label: 'a basketball court', modes: ['walk'], walking: 'Heading to the courts', doing: 'Shooting hoops', dwellS: 40, facility: (s, r) => nearestCourtId(s, r!.status.position) },
      { target: randomEntrance, label: 'an entrance', modes: ['paths', 'walk'], walking: 'Heading home', doing: 'Catching their breath', dwellS: 5 },
    ],
  },
  soccer: {
    role: 'Soccer player', icon: '⚽', group: 'adam', pace: 1.4, assets: ['Person_Child_Orange', 'Person_Basketball_Blue', 'Person_Man_Blue'],
    legs: [
      { target: soccerSpot, label: 'a soccer field', modes: ['walk'], walking: 'Heading to the soccer field', doing: 'Kicking a ball around', dwellS: 40, facility: (s, r) => soccerId(s, r!) },
      { target: randomEntrance, label: 'an entrance', modes: ['paths', 'walk'], walking: 'Heading home', doing: 'Tying their shoes', dwellS: 5 },
    ],
  },
  senior: {
    role: 'Senior', icon: '🧓', group: 'bob', pace: 0.85, assets: ['Person_Man_Blue', 'Person_Woman_Pink'],
    legs: [{ target: (s, r) => randomBench(s, r, 180), label: 'a bench', modes: ['accessible', 'walk'], walking: 'Walking slowly to a bench', fallbackWalking: 'Struggling over rough ground to a bench', doing: 'Resting on a bench', dwellS: 30 }],
  },
  family: {
    role: 'Parent', icon: '👨‍👧', group: 'colgne', pace: 1.2, assets: ['Person_Woman_Pink', 'Person_Man_Blue', 'Person_Child_Orange'],
    legs: [
      {
        target: (s, r) => {
          const i = playgroundOf(s, r)
          return i < 0 ? null : randomIn(s, s.geo.playgrounds[i].ring, r.rand) ?? ringCentroid(s.geo.playgrounds[i].ring)
        },
        label: 'the playground', modes: ['paths', 'walk'], walking: 'Taking the kids to the playground', fallbackWalking: 'Crossing the grass to the playground', doing: 'At the playground', dwellS: 35, avoidTraffic: true,
        facility: (s, r) => {
          const i = playgroundOf(s, r!)
          return i < 0 ? null : `playground-${i}`
        },
      },
      { target: randomEntrance, label: 'an entrance', modes: ['paths', 'walk'], walking: 'Heading home with the kids', doing: 'Packing up the stroller', dwellS: 6, avoidTraffic: true },
    ],
  },
  picnic: {
    role: 'Picnicker', icon: '🧺', group: 'colgne', pace: 1.1, assets: ['Person_Woman_Pink', 'Person_Worker_Yellow', 'Person_Man_Blue'],
    legs: [
      { target: gazeboSpot, label: 'the picnic area', modes: ['paths', 'walk'], walking: 'Carrying lunch to the picnic area', doing: 'Having a picnic', dwellS: 45, facility: (s) => s.items.find((i) => i.assetId === 'gazebo')?.id ?? null },
      { target: (s, r) => randomPathPoint(s, r.rand, r.status.position, 60, 200), label: 'a walk', modes: ['paths', 'walk'], walking: 'Walking off lunch', doing: 'Enjoying the view', dwellS: 8 },
    ],
  },
  dogwalker: {
    role: 'Dog walker', icon: '🐕', group: 'dylan', pace: 1.3, assets: ['Person_Man_Blue', 'Person_Worker_Yellow', 'Person_Woman_Pink'],
    legs: [{ target: (s, r) => randomPathPoint(s, r.rand, r.status.position, 60, 250), label: 'another part of the park', modes: ['paths', 'walk'], walking: 'Walking the dog', doing: 'Letting the dog sniff around', dwellS: 6 }],
  },
  jogger: {
    role: 'Jogger', icon: '🏃', group: 'dylan', pace: 1.9, assets: ['Person_Worker_Yellow', 'Person_Basketball_Blue', 'Person_Woman_Pink'],
    legs: [{ target: (s, r) => randomPathPoint(s, r.rand, r.status.position, 120, 350), label: 'the next stretch of path', modes: ['paths', 'walk'], walking: 'Power-walking a loop', doing: 'Stretching', dwellS: 4 }],
  },
}

/** Who else is in the park: kind and first name. With the 7 people above, 30 in total. */
const VISITORS: [VisitorKind, string][] = [
  ['nature', 'Priya'], ['nature', 'Hamid'], ['nature', 'Lena'], ['nature', 'Tom'],
  ['student', 'Kevin'], ['student', 'Aisha'], ['student', 'Wei'], ['baller', 'Marcus'], ['soccer', 'Sofia'],
  ['senior', 'Margaret'], ['senior', 'Raj'], ['senior', 'Helen'], ['senior', 'George'],
  ['family', 'Daniel'], ['family', 'Mei'], ['family', 'Carlos'], ['picnic', 'Fatima'], ['picnic', 'Liam'],
  ['dogwalker', 'Grace'], ['dogwalker', 'Omar'], ['dogwalker', 'Nina'], ['jogger', 'Ethan'], ['jogger', 'Zoe'],
]

const VISITOR_PROFILES: Profile[] = VISITORS.map(([kind, name], i) => {
  const k = VISITOR_LEGS[kind]
  return { id: `visitor-${i}`, group: k.group, name, role: k.role, icon: k.icon, assetId: k.assets[i % k.assets.length], requestId: null, pace: k.pace * (0.92 + ((i * 37) % 17) / 100), legs: k.legs }
})

function nearestCourtId(s: ParkSnapshot, p: Vec2): string | null {
  let best: { id: string; d: number } | null = null
  for (const f of courts(s)) {
    const d = dist(f.center, p)
    if (!best || d < best.d) best = { id: f.id, d }
  }
  return best?.id ?? null
}

function nearestBench(s: ParkSnapshot, from: Vec2 | null): Vec2 | null {
  if (!from) return null
  let best: Vec2 | null = null
  for (const i of s.items) {
    if (i.assetId !== 'park_bench') continue
    const p: Vec2 = [i.position[0], i.position[2]]
    if (!best || dist(p, from) < dist(best, from)) best = p
  }
  return best
}

const courts = (s: ParkSnapshot) => s.facilities.filter((f) => f.kind === 'basketball_court' || f.kind === 'multi_sport_court')
const courtId = (s: ParkSnapshot, i: number) => courts(s)[i % Math.max(1, courts(s).length)]?.id ?? null
const courtSpot = (s: ParkSnapshot, i: number): Vec2 | null => {
  const f = courts(s)[i % Math.max(1, courts(s).length)]
  // Free-throw line of one basket: a natural place to stand on a court.
  return f ? [f.center[0] + Math.cos(f.angle) * (f.length / 2 - 6), f.center[1] + Math.sin(f.angle) * (f.length / 2 - 6)] : null
}

/** Everyone in the park: the five representatives first, then Mia, Jordan and the visitors. */
export const ALL_PROFILES: Profile[] = [...PROFILES, ...VISITOR_PROFILES]

/** Route searches per frame. Spreads 30 citizens' route planning over several frames. */
const ROUTES_PER_FRAME = 1

/** Ground speed for a character walking with clip timeScale `pace`. */
const speedOf = (p: Profile) => (WALK_STRIDE_SPEED[p.assetId] ?? 0.72) * (CHARACTER_SCALE[p.assetId] ?? 1) * p.pace

/**
 * Citizens walking their daily routines through the real park. Each leg picks a
 * destination from the live park (entrances, benches, playgrounds, courts) and a
 * route via A*; if the preferred route type doesn't exist (e.g. no accessible
 * path), the citizen falls back to cutting across the grass and says so.
 */
export class CitizenSim {
  private runtimes: Runtime[] = []
  private queue: Runtime[] = []
  private snap: ParkSnapshot | null = null
  private started = false

  constructor(private host: CitizenSimHost) {}

  /** Call whenever the park changes. Walking citizens re-route on the new ground. */
  setSnapshot(snap: ParkSnapshot) {
    const first = !this.snap
    this.snap = snap
    if (first) this.start()
    else for (const r of this.runtimes) if (r.status.movement === 'walking' || r.status.movement === 'stuck') this.enqueue(r)
  }

  get statuses(): CitizenStatus[] {
    return this.runtimes.map((r) => ({ ...r.status, position: [...r.status.position] as Vec2 }))
  }

  positionOf(id: string): Vec2 | null {
    return this.runtimes.find((r) => r.profile.id === id)?.status.position ?? null
  }

  private start() {
    if (this.started || !this.snap) return
    this.started = true
    const snap = this.snap
    ALL_PROFILES.forEach((profile, i) => {
      const rand = seededRandom(100 + i)
      const status: CitizenStatus = { id: profile.id, name: profile.name, role: profile.role, icon: profile.icon, assetId: profile.assetId, requestId: profile.requestId, group: profile.group, position: randomPathPoint(snap, rand) ?? [0, 0], destination: null, activity: 'Arriving', movement: 'idle', routeMode: null }
      // Representatives start where their routine's last leg ends; visitors start spread over the paths.
      const lastLeg = profile.follows || !profile.requestId ? undefined : profile.legs[profile.legs.length - 1]
      const start = lastLeg?.target(snap, { profile, status, rand } as Runtime)
      if (start) status.position = [...start] as Vec2
      const r: Runtime = {
        profile,
        status,
        leg: 0,
        route: [],
        next: 0,
        yaw: 0,
        dwellLeft: 0,
        retryIn: 0,
        facilityInUse: null,
        rand,
        queued: false,
      }
      this.runtimes.push(r)
      void this.host.addAgent(profile.id, profile.assetId, CHARACTER_SCALE[profile.assetId] ?? 1, REPRESENTATIVE_LOOKS[profile.id]?.tint)
      if (!profile.follows) this.enqueue(r)
    })
  }

  /** Plans the next walk on a later frame (at most ROUTES_PER_FRAME per frame). */
  private enqueue(r: Runtime) {
    if (r.queued || r.profile.follows) return
    r.queued = true
    this.queue.push(r)
  }

  private beginLeg(r: Runtime) {
    const snap = this.snap
    if (!snap || r.profile.follows) return
    this.releaseFacility(r)
    const leg = r.profile.legs[r.leg]
    const target = leg.target(snap, r)
    r.status.destination = leg.label
    if (!target) return this.stuck(r, `Can't find ${leg.label}`)
    for (const [i, mode] of leg.modes.entries()) {
      const route = findRoute(snap.grid, r.status.position, target, mode, leg.avoidTraffic ? { danger: snap.danger, dangerFactor: 8 } : {})
      if (!route) continue
      r.route = route.points
      r.next = 1
      r.status.movement = 'walking'
      r.status.routeMode = mode
      r.status.activity = i > 0 && leg.fallbackWalking ? leg.fallbackWalking : leg.walking
      return
    }
    this.stuck(r, `Can't find a way to ${leg.label}`)
  }

  private stuck(r: Runtime, why: string) {
    r.status.movement = 'stuck'
    r.status.activity = why
    r.status.routeMode = null
    r.route = []
    r.retryIn = 5
  }

  private releaseFacility(r: Runtime) {
    if (r.facilityInUse) this.host.stopUsingFacility(r.facilityInUse)
    r.facilityInUse = null
  }

  update(dt: number) {
    for (let n = 0; n < ROUTES_PER_FRAME && this.queue.length; n++) {
      const r = this.queue.shift()!
      r.queued = false
      this.beginLeg(r)
    }
    for (const r of this.runtimes) {
      if (r.profile.follows) continue
      const s = r.status
      if (r.queued) {
        // Waiting for a route: stand still.
      } else if (s.movement === 'stuck') {
        r.retryIn -= dt
        if (r.retryIn <= 0) this.enqueue(r)
      } else if (s.movement === 'walking') {
        this.walk(r, dt)
      } else if (s.movement === 'arrived') {
        r.dwellLeft -= dt
        if (r.dwellLeft <= 0) {
          r.leg = (r.leg + 1) % r.profile.legs.length
          this.enqueue(r)
        }
      }
      const walking = s.movement === 'walking'
      this.host.setAgent(s.id, s.position[0], s.position[1], r.yaw, walking ? 'Walk' : 'Idle', walking ? r.profile.pace : 1)
    }
    for (const r of this.runtimes) if (r.profile.follows) this.follow(r, dt)
  }

  private walk(r: Runtime, dt: number) {
    let budget = speedOf(r.profile) * dt
    const s = r.status
    while (budget > 0 && r.next < r.route.length) {
      const target = r.route[r.next]
      const dx = target[0] - s.position[0]
      const dz = target[1] - s.position[1]
      const d = Math.hypot(dx, dz)
      if (d > 1e-6) r.yaw = turnTowards(r.yaw, Math.atan2(dx, dz), dt * 8)
      if (d <= budget) {
        s.position = [...target] as Vec2
        budget -= d
        r.next++
      } else {
        s.position = [s.position[0] + (dx / d) * budget, s.position[1] + (dz / d) * budget]
        budget = 0
      }
    }
    if (r.next >= r.route.length) this.arrive(r)
  }

  private arrive(r: Runtime) {
    const leg = r.profile.legs[r.leg]
    r.status.movement = 'arrived'
    r.status.activity = leg.doing
    r.dwellLeft = leg.dwellS
    const facility = this.snap && leg.facility?.(this.snap, r)
    if (facility) {
      r.facilityInUse = facility
      this.host.startUsingFacility(facility)
    }
  }

  /** The child stays a step behind her parent, and plays nearby while the parent waits. */
  private follow(r: Runtime, dt: number) {
    const leader = this.runtimes.find((x) => x.profile.id === r.profile.follows)
    if (!leader) return
    const L = leader.status
    const s = r.status
    s.destination = L.destination
    s.movement = L.movement === 'arrived' ? 'arrived' : L.movement
    s.activity = L.movement === 'arrived' && L.activity.startsWith('Watching') ? 'Playing on the playground' : L.movement === 'walking' ? `Walking with ${leader.profile.name}` : `With ${leader.profile.name}`
    const playing = L.movement === 'arrived' && L.activity.startsWith('Watching')
    // Spot beside/behind the parent, or a few metres away while playing.
    const off = playing ? 3.5 : 1.1
    const side = playing ? leader.yaw + Math.PI / 2 + Math.sin(performance.now() / 4000) : leader.yaw + Math.PI * 0.75
    const goal: Vec2 = [L.position[0] + Math.sin(side) * off, L.position[1] + Math.cos(side) * off]
    const dx = goal[0] - s.position[0]
    const dz = goal[1] - s.position[1]
    const d = Math.hypot(dx, dz)
    const speed = speedOf(r.profile)
    const moving = d > 0.25
    if (moving) {
      const step = Math.min(d, speed * dt * (d > 3 ? 1.6 : 1))
      s.position = [s.position[0] + (dx / d) * step, s.position[1] + (dz / d) * step]
      r.yaw = turnTowards(r.yaw, Math.atan2(dx, dz), dt * 8)
    } else {
      r.yaw = turnTowards(r.yaw, leader.yaw, dt * 3)
    }
    this.host.setAgent(s.id, s.position[0], s.position[1], r.yaw, moving ? 'Walk' : 'Idle', moving ? r.profile.pace * (d > 3 ? 1.4 : 1) : 1)
  }

  dispose() {
    for (const r of this.runtimes) this.releaseFacility(r)
  }
}

function turnTowards(a: number, b: number, maxStep: number) {
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return a + Math.max(-maxStep, Math.min(maxStep, d))
}
