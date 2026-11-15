import { type ReactElement, useEffect, useState } from 'react'
import { sourcesHref } from '../construction/sources'


const INK = '#23331d'
const SKIN = ['#f1c27d', '#c68642', '#8d5524', '#ffdbac']

/** Simple standing figure; (x, y) is where the feet touch the ground. */
function Person({ x, y, shirt, skin = SKIN[0], scale = 1 }: { x: number; y: number; shirt: string; skin?: string; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x={-4} y={-12} width={3} height={12} rx={1.5} fill={INK} />
      <rect x={1} y={-12} width={3} height={12} rx={1.5} fill={INK} />
      <rect x={-5.5} y={-26} width={11} height={16} rx={4} fill={shirt} stroke={INK} strokeWidth={1.2} />
      <circle cx={0} cy={-31} r={5} fill={skin} stroke={INK} strokeWidth={1.2} />
    </g>
  )
}

function Tree({ x, y, r = 16, color = '#5fa64a' }: { x: number; y: number; r?: number; color?: string }) {
  return (
    <g>
      <rect x={x - 2.5} y={y - r * 0.6} width={5} height={r * 0.6 + 2} fill="#8a5a33" stroke={INK} strokeWidth={1.2} />
      <circle cx={x} cy={y - r * 1.1} r={r} fill={color} stroke={INK} strokeWidth={1.5} />
      <circle cx={x - r / 3} cy={y - r * 1.1 - r / 3} r={r / 3} fill="#fff" opacity={0.22} />
    </g>
  )
}

/** Hero picture: the park sign, the welcome lawn, a slide and a few visitors. */
function HeroScene() {
  return (
    <svg viewBox="0 0 360 240" className="landing__scene-svg" aria-hidden="true">
      <rect width={360} height={240} fill="#e6f3f8" />
      <g fill="#fff" stroke="#c9d6dc" strokeWidth={1.5}>
        <path d="M222 44 a10 10 0 0 1 18 -6 a13 13 0 0 1 24 4 a9 9 0 0 1 4 17 h-44 a8 8 0 0 1 -2 -15 z" />
      </g>
      {/* Houses across the street */}
      <g stroke={INK} strokeWidth={1.5}>
        <rect x={150} y={96} width={80} height={56} fill="#f2e3c6" />
        <path d="M144 98 L190 66 L236 98 Z" fill="#c8664b" />
        <rect x={250} y={88} width={96} height={64} fill="#dfe5ea" />
        <path d="M244 90 L298 58 L352 90 Z" fill="#6c7f99" />
      </g>
      <g fill="#fff" stroke={INK} strokeWidth={1.2}>
        <rect x={160} y={108} width={16} height={14} />
        <rect x={204} y={108} width={16} height={14} />
        <rect x={262} y={102} width={18} height={14} />
        <rect x={316} y={102} width={18} height={14} />
      </g>
      <rect x={183} y={126} width={14} height={26} fill="#5a7bb8" stroke={INK} strokeWidth={1.2} />
      <rect x={288} y={124} width={20} height={28} fill="#c8664b" stroke={INK} strokeWidth={1.2} />
      {/* Grass and path */}
      <rect y={150} width={360} height={90} fill="#bfe3a0" />
      <line x1={0} y1={150} x2={360} y2={150} stroke={INK} strokeWidth={2} />
      <path d="M-10 236 C 90 200, 170 214, 220 186 S 330 164, 372 168" stroke="#b9925a" strokeWidth={24} fill="none" />
      <path d="M-10 236 C 90 200, 170 214, 220 186 S 330 164, 372 168" stroke="#ead6a8" strokeWidth={20} fill="none" />
      {/* Flower bed */}
      {[
        [250, 214, '#e85d75'],
        [262, 220, '#ffd54a'],
        [274, 212, '#8e6bd6'],
        [286, 220, '#e85d75'],
        [298, 213, '#ffd54a'],
      ].map(([x, y, c]) => (
        <g key={`${x}`}>
          <line x1={x as number} y1={y as number} x2={x as number} y2={(y as number) + 8} stroke="#4c8f3a" strokeWidth={1.5} />
          <circle cx={x as number} cy={y as number} r={4} fill={c as string} stroke={INK} strokeWidth={1} />
        </g>
      ))}
      {/* Slide */}
      <g stroke={INK} strokeWidth={1.5} strokeLinecap="round">
        <line x1={118} y1={120} x2={118} y2={178} />
        <line x1={132} y1={120} x2={132} y2={178} />
        {[132, 144, 156, 168].map((y) => (
          <line key={y} x1={118} y1={y} x2={132} y2={y} />
        ))}
        <rect x={114} y={114} width={22} height={8} rx={2} fill="#f2c230" />
        <path d="M136 118 C 152 120, 160 170, 182 176" stroke="#e85d3c" strokeWidth={7} fill="none" />
      </g>
      {/* Bench */}
      <g stroke={INK} strokeWidth={1.4}>
        <rect x={196} y={160} width={36} height={5} rx={1} fill="#b47a45" />
        <rect x={196} y={168} width={36} height={4} rx={1} fill="#b47a45" />
        <line x1={200} y1={172} x2={200} y2={180} />
        <line x1={228} y1={172} x2={228} y2={180} />
      </g>
      <Tree x={340} y={200} r={20} color="#4f9a45" />
      <Tree x={92} y={170} r={14} color="#6db352" />
      {/* Park sign */}
      <g stroke={INK} strokeWidth={1.5}>
        <rect x={32} y={110} width={6} height={88} fill="#8a5a33" />
        <rect x={2} y={96} width={68} height={24} rx={4} fill="#3f8f3a" />
      </g>
      <text x={36} y={112} textAnchor="middle" fontSize={8} fontWeight={800} fill="#fff" fontFamily="inherit">
        WISMER PARK
      </text>
      {/* Visitors */}
      <Person x={176} y={204} shirt="#5a7bb8" skin={SKIN[1]} />
      <Person x={190} y={200} shirt="#e85d75" skin={SKIN[3]} scale={0.7} />
      <Person x={214} y={178} shirt="#f2c230" skin={SKIN[2]} />
      <g stroke={INK} strokeWidth={1.2}>
        <ellipse cx={150} cy={210} rx={9} ry={5} fill="#c08a52" />
        <circle cx={160} cy={204} r={4.5} fill="#c08a52" />
        <line x1={143} y1={214} x2={143} y2={219} />
        <line x1={156} y1={214} x2={156} y2={219} />
        <path d="M141 208 l-5 -4" />
      </g>
      <path d="M160 206 C 166 206, 170 204, 172 194" stroke={INK} strokeWidth={1} fill="none" />
    </svg>
  )
}

const WALLS = ['#f2e3c6', '#dfe5ea', '#f6d8c4', '#e3ead2', '#efe6da', '#d9e2f0']
const ROOFS = ['#c8664b', '#6c7f99', '#8e5a44', '#5f7a52', '#a35d6a', '#4f6480']
const SHIRTS = ['#5a7bb8', '#e85d75', '#f2c230', '#3f8f3a', '#8e6bd6']
const STREET_WIDTH = 2400

/** The row of houses and trees along the bottom of the page, generated from fixed patterns. */
function Street() {
  const items: ReactElement[] = []
  let x = 0
  for (let i = 0; x < STREET_WIDTH; i++) {
    const w = 96 + ((i * 37) % 4) * 14
    const h = 60 + ((i * 53) % 3) * 16
    const wall = WALLS[i % WALLS.length]
    const roof = ROOFS[(i * 5) % ROOFS.length]
    const top = 140 - h
    items.push(
      <g key={`h${i}`} stroke={INK} strokeWidth={1.5}>
        <rect x={x} y={top} width={w} height={h} fill={wall} />
        <path d={`M${x - 6} ${top + 2} L${x + w / 2} ${top - 30} L${x + w + 6} ${top + 2} Z`} fill={roof} />
        <rect x={x + 12} y={top + 14} width={18} height={16} fill="#fff" strokeWidth={1.2} />
        <rect x={x + w - 30} y={top + 14} width={18} height={16} fill="#fff" strokeWidth={1.2} />
        {h > 70 && <rect x={x + w / 2 - 9} y={top + 14} width={18} height={16} fill="#fff" strokeWidth={1.2} />}
        <rect x={x + w / 2 - 8} y={140 - 26} width={16} height={26} fill={ROOFS[(i + 2) % ROOFS.length]} strokeWidth={1.2} />
      </g>,
    )
    x += w + 10
    if (i % 2 === 1) {
      items.push(<Tree key={`t${i}`} x={x + 14} y={142} r={18} color={i % 4 === 1 ? '#5fa64a' : '#4f9a45'} />)
      x += 38
    }
    if (i % 3 === 0) {
      items.push(<Person key={`p${i}`} x={x - 24} y={152} shirt={SHIRTS[i % SHIRTS.length]} skin={SKIN[i % SKIN.length]} scale={0.8} />)
    }
  }
  return (
    <svg className="landing__street" viewBox={`0 0 ${STREET_WIDTH} 200`} preserveAspectRatio="xMinYMax slice" aria-hidden="true">
      {items}
      <rect y={140} width={STREET_WIDTH} height={14} fill="#e2ddd2" stroke={INK} strokeWidth={1.5} />
      <rect y={154} width={STREET_WIDTH} height={46} fill="#8a8f96" />
      <line x1={0} y1={177} x2={STREET_WIDTH} y2={177} stroke="#fff" strokeWidth={3} strokeDasharray="22 18" />
    </svg>
  )
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="landing__dialog-backdrop" onClick={onClose}>
      <div className="landing__dialog" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="about-title">About ParkLab</h2>
        <p>
          ParkLab is a 3D park-planning game set in Wismer Park, Markham, Ontario. You listen to the residents, design new paths, gardens and facilities on a
          budget, and follow the City's rules so the design can be approved.
        </p>
        <p>It is a learning tool, not a planning forecast. The residents and their requests are fictional.</p>
        <h3>Data</h3>
        <ul>
          <li>Park boundaries © City of Markham</li>
          <li>Base map © OpenStreetMap contributors, styled by OpenFreeMap</li>
          <li>3D models from the Low Poly Playground & Park Pack and the Cartoon City Asset Pack</li>
        </ul>
        <p>
          Every regulation in the game is cited on the{' '}
          <a href={sourcesHref()} target="_blank" rel="noopener noreferrer">
            Sources page
          </a>
          .
        </p>
        <button className="landing__play landing__play--small" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </div>
  )
}

/** Title page shown before the tutorial: game name, pitch, Play button and the street illustration. */
export function LandingPage({ onPlay, onLevels }: { onPlay: () => void; onLevels: () => void }) {
  const [about, setAbout] = useState(false)
  const [note, setNote] = useState(true)
  return (
    <div className="landing">
      <main className="landing__hero">
        <div className="landing__copy">
          <svg className="landing__cloud" viewBox="0 0 90 40" aria-hidden="true">
            <path d="M14 34 a12 12 0 0 1 6 -22 a16 16 0 0 1 30 -4 a14 14 0 0 1 26 10 a9 9 0 0 1 0 16 z" fill="#fff" stroke="#c9c2b0" strokeWidth={2} />
          </svg>
          <h1 className="landing__title">ParkLab</h1>
          <p className="landing__tagline">Your neighbours have ideas for their park. Can you make them all happy?</p>
          <p className="landing__lede">
            Learn, design and share your own parks that satisfy residents living nearby.
          </p>
          <button className="landing__play" onClick={onPlay}>
            Play
          </button>
          <nav className="landing__links">
            <button onClick={onLevels}>Choose a level</button>
            <button onClick={() => setAbout(true)}>About the game</button>
            <a href={sourcesHref()} target="_blank" rel="noopener noreferrer">
              Sources
            </a>
          </nav>
        </div>
        <figure className="landing__scene">
          <HeroScene />
          <figcaption className="landing__bubble">Can you help the neighbours make Park better for everyone?</figcaption>
        </figure>
      </main>
      <Street />
      {note && (
        <footer className="landing__note">
          <span>A learning tool, not a forecast. Residents are fictional.</span>
          <span className="landing__note-links">
            <button onClick={() => setAbout(true)}>About</button>
            <button className="landing__note-close" onClick={() => setNote(false)} aria-label="Dismiss">
              ×
            </button>
          </span>
        </footer>
      )}
      {about && <AboutDialog onClose={() => setAbout(false)} />}
    </div>
  )
}
