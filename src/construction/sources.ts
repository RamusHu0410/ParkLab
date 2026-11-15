import type { RuleId } from './rules'

export interface Source {
  title: string
  url: string
  /** Publisher or site. */
  publisher: string
}

export interface SourceSection {
  /** Anchor on the sources page; equals the rule id for the five game rules. */
  id: RuleId | 'standards' | 'requests' | 'environment-score'
  title: string
  /** How the game uses these sources. */
  use: string
  sources: Source[]
}

const MARKHAM: Source = { title: 'City of Markham', publisher: 'City of Markham', url: 'https://www.markham.ca/' }
const OSM: Source = { title: 'OpenStreetMap', publisher: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/' }
const OVERPASS: Source = { title: 'Overpass Turbo', publisher: 'Overpass API query tool for OpenStreetMap data', url: 'https://overpass-turbo.eu/' }

/** The community discussion shown at the top of the sources page. */
export const COMMUNITY_SOURCE: Source = {
  title: 'City of Markham approves construction of soccer…',
  publisher: 'r/Markham on Reddit',
  url: 'https://www.reddit.com/r/Markham/comments/1rozj27/city_of_markham_approves_construction_of_soccer/',
}

export const SOURCE_SECTIONS: SourceSection[] = [
  {
    id: 'boundary',
    title: 'Park boundary',
    use: 'The official park outline is the boundary checked by the Park boundary rule. Paths, courts and parking come from OpenStreetMap, extracted with Overpass Turbo.',
    sources: [MARKHAM, OSM, OVERPASS],
  },
  {
    id: 'overlap',
    title: 'Facility overlap',
    use: 'Existing courts, fields, playgrounds and parking lots are mapped from OpenStreetMap. The Facility overlap rule checks new construction against them.',
    sources: [OSM, OVERPASS],
  },
  {
    id: 'clearance',
    title: 'Safety clearance',
    use: 'Playground fall zones and court and field run-off areas follow these standards. The game keeps 3 m clear around playgrounds and 2 m around courts, fields and fitness equipment.',
    sources: [
      { title: 'CSA Group standards store (CSA Z614, children’s playspaces and equipment)', publisher: 'CSA Group', url: 'https://www.csagroup.org/store/' },
      { title: 'FIFA Technical', publisher: 'FIFA', url: 'https://www.fifa.com/technical' },
      { title: 'FIBA', publisher: 'International Basketball Federation', url: 'https://www.fiba.basketball/' },
    ],
  },
  {
    id: 'accessibility',
    title: 'Accessibility',
    use: 'Accessible pathways need at least 1.5 m clear width, passing spaces on long narrow stretches, and no steep valley slopes.',
    sources: [
      { title: 'O. Reg. 191/11: Integrated Accessibility Standards', publisher: 'Government of Ontario, e-Laws', url: 'https://www.ontario.ca/laws/regulation/110191' },
      MARKHAM,
      { title: 'Accessibility in Ontario: what you need to know', publisher: 'Government of Ontario', url: 'https://www.ontario.ca/page/accessibility-ontario-what-you-need-to-know' },
    ],
  },
  {
    id: 'environment',
    title: 'Environmental protection',
    use: 'The woodlot, valley and streams are protected. Building on them or removing their trees breaks the Environmental protection rule.',
    sources: [
      MARKHAM,
      { title: 'Conservation Authorities Act, R.S.O. 1990, c. C.27', publisher: 'Government of Ontario, e-Laws', url: 'https://www.ontario.ca/laws/statute/90c27' },
      { title: 'Ontario statute 23s06', publisher: 'Government of Ontario, e-Laws', url: 'https://www.ontario.ca/laws/statute/23s06' },
      { title: 'Ontario e-Laws', publisher: 'Government of Ontario', url: 'https://www.ontario.ca/laws' },
    ],
  },
  {
    id: 'standards',
    title: 'Additional design standards',
    use: 'General planning and building rules that shaped the game’s design. They are not checked as a separate rule.',
    sources: [
      MARKHAM,
      { title: 'Planning Act, R.S.O. 1990, c. P.13', publisher: 'Government of Ontario, e-Laws', url: 'https://www.ontario.ca/laws/statute/90p13' },
      { title: 'Building Code updates', publisher: 'Government of Ontario', url: 'https://www.ontario.ca/page/building-code-updates' },
    ],
  },
]

SOURCE_SECTIONS.push(
  {
    id: 'requests',
    title: 'Citizen requests',
    use: 'The residents are fictional. Their requests are based on what Markham residents discuss online and on what Wismer Park offers today: the existing playgrounds, tennis courts and parking come from OpenStreetMap.',
    sources: [
      COMMUNITY_SOURCE,
      { title: 'Wismer Park', publisher: 'City of Markham', url: 'https://www.markham.ca/sports-recreation-fitness/community-centres-libraries/wismer-park' },
      OSM,
    ],
  },
  {
    id: 'environment-score',
    title: 'Environmental score',
    use: 'The score (0–100) is 60% green space coverage and 40% CO₂ absorbed per year. Green space is measured from the park map. CO₂ uses about 22 kg per mature tree per year, a figure from the European Environment Agency; the rates for woodland and lawn ground (0.2 and 0.05 kg per m²) are the game’s own estimates.',
    sources: [
      OSM,
      MARKHAM,
      {
        title: 'How much CO₂ does a tree absorb? (traces the 22 kg per tree figure to the European Environment Agency)',
        publisher: 'One Tree Planted',
        url: 'https://onetreeplanted.org/blogs/stories/how-much-co2-does-tree-absorb',
      },
    ],
  },
)

/** Link to the sources page, optionally at one rule's section. Opens in a new tab so the game keeps its state. */
export const sourcesHref = (section?: SourceSection['id']) => `?view=sources${section ? `#${section}` : ''}`
