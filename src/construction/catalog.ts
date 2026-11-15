import { getAsset } from '../utils/assets'

export type ParkAssetCategory =
  | 'tree'
  | 'shrub'
  | 'flowers'
  | 'bench'
  | 'picnic'
  | 'shelter'
  | 'play'
  | 'sport'
  | 'lighting'
  | 'water'
  | 'furniture'

export interface CatalogEntry {
  assetId: string
  label: string
  category: ParkAssetCategory
  /**
   * Scale applied on top of the model's own size. Both packs are modelled in
   * real metres, so 1 for everything except trees: the tree models are ~3.3 m
   * tall, and real deciduous park trees are 8–12 m, so trees are scaled ×2.2–3.2.
   */
  defaultScale: number
  /** Random extra scale range [min, max] applied when generating scattered items. */
  scaleJitter?: [number, number]
  /** Which way the model's "front" (seat side, play side) faces, radians around +y from +z. */
  frontYaw?: number
  /** Footprint radius in metres at scale 1, used for spacing. Computed from model size. */
  radius: number
}

const sizeOf = (id: string, fallback: [number, number, number]) => getAsset(id).sizeM ?? fallback

/** Footprint radius from the model's plan size (x, z) in metres. */
function radiusFor(id: string, planXZ?: [number, number]): number {
  if (planXZ) return Math.max(...planXZ) / 2
  const [x, y] = sizeOf(id, [1, 1, 1])
  // Playground pack sizes are Blender x/y(depth)/z(height).
  return Math.max(x, y) / 2
}

const entry = (e: Omit<CatalogEntry, 'radius'> & { plan?: [number, number] }): CatalogEntry => ({
  ...e,
  radius: radiusFor(e.assetId, e.plan),
})

/**
 * Environment assets used to dress Wismer Park. Buildings, vehicles and road
 * modules from the city pack are excluded: the park sits inside the real
 * OpenStreetMap city, and mixing toy buildings into it would clash.
 */
export const PARK_CATALOG: CatalogEntry[] = [
  // Trees and planting
  entry({ assetId: 'round_tree', label: 'Round tree', category: 'tree', defaultScale: 2.6, scaleJitter: [0.85, 1.25] }),
  entry({ assetId: 'Tree_Round_LowPoly', label: 'Leafy tree', category: 'tree', defaultScale: 2.6, scaleJitter: [0.85, 1.25], plan: [2.02, 1.6] }),
  entry({ assetId: 'hedge_round', label: 'Round shrub', category: 'shrub', defaultScale: 1.2, scaleJitter: [0.8, 1.3] }),
  entry({ assetId: 'hedge', label: 'Hedge', category: 'shrub', defaultScale: 1 }),
  entry({ assetId: 'flower_bed', label: 'Flower bed', category: 'flowers', defaultScale: 1 }),
  entry({ assetId: 'Flowers_Tulips', label: 'Tulips', category: 'flowers', defaultScale: 1, plan: [1.7, 0.33] }),
  entry({ assetId: 'Planter_Red_Flowers', label: 'Flower planter', category: 'flowers', defaultScale: 1, plan: [2.21, 0.85] }),
  // Seating and shelter
  entry({ assetId: 'park_bench', label: 'Bench', category: 'bench', defaultScale: 1, frontYaw: 0 }),
  entry({ assetId: 'picnic_table', label: 'Picnic table', category: 'picnic', defaultScale: 1 }),
  entry({ assetId: 'gazebo', label: 'Gazebo', category: 'shelter', defaultScale: 1 }),
  // Play equipment
  entry({ assetId: 'swing_set', label: 'Swings', category: 'play', defaultScale: 1 }),
  entry({ assetId: 'slide', label: 'Slide', category: 'play', defaultScale: 1 }),
  entry({ assetId: 'climbing_frame', label: 'Climbing frame', category: 'play', defaultScale: 1 }),
  entry({ assetId: 'jungle_dome', label: 'Climbing dome', category: 'play', defaultScale: 1 }),
  entry({ assetId: 'merry_go_round', label: 'Merry-go-round', category: 'play', defaultScale: 1 }),
  entry({ assetId: 'spring_rider', label: 'Spring rider', category: 'play', defaultScale: 1 }),
  entry({ assetId: 'seesaw', label: 'Seesaw', category: 'play', defaultScale: 1 }),
  entry({ assetId: 'sandbox', label: 'Sandbox', category: 'play', defaultScale: 1 }),
  entry({ assetId: 'monkey_bars', label: 'Monkey bars', category: 'play', defaultScale: 1 }),
  entry({ assetId: 'tire_swing', label: 'Tire swing', category: 'play', defaultScale: 1 }),
  entry({ assetId: 'playhouse', label: 'Playhouse', category: 'play', defaultScale: 1 }),
  entry({ assetId: 'Playground_Slide_Tower', label: 'Slide tower', category: 'play', defaultScale: 1, plan: [1.64, 5] }),
  // Sport
  entry({ assetId: 'Sport_Basketball_Court', label: 'Basketball court', category: 'sport', defaultScale: 1, plan: [9.95, 12.85] }),
  entry({ assetId: 'Sport_Basketball_Hoop', label: 'Basketball hoop', category: 'sport', defaultScale: 1, plan: [1.65, 1.16] }),
  // Lighting, water, furniture
  entry({ assetId: 'park_lamp', label: 'Lamp post', category: 'lighting', defaultScale: 1 }),
  entry({ assetId: 'drinking_fountain', label: 'Drinking fountain', category: 'water', defaultScale: 1 }),
  entry({ assetId: 'fountain', label: 'Fountain', category: 'water', defaultScale: 1 }),
  entry({ assetId: 'trash_can', label: 'Bin', category: 'furniture', defaultScale: 1 }),
  entry({ assetId: 'bike_rack', label: 'Bike rack', category: 'furniture', defaultScale: 1 }),
  entry({ assetId: 'park_sign', label: 'Park sign', category: 'furniture', defaultScale: 1 }),
]

const byId = new Map(PARK_CATALOG.map((e) => [e.assetId, e]))

export function catalogEntry(assetId: string): CatalogEntry {
  const e = byId.get(assetId)
  if (!e) throw new Error(`Asset ${assetId} is not in the park catalogue`)
  return e
}

/** Characters: adults ×1.1 (1.66 m, the models are 1.51 m), child ×0.8 (1.21 m; the child model is as tall as the adults). */
export const CHARACTER_SCALE: Record<string, number> = {
  Person_Man_Blue: 1.1,
  Person_Woman_Pink: 1.1,
  Person_Worker_Yellow: 1.1,
  Person_Basketball_Blue: 1.1,
  Person_Basketball_Orange: 1.1,
  Person_Child_Orange: 0.8,
}
