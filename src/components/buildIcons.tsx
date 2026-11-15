import type { ReactNode } from 'react'
import type { AreaType, FacilityType, PathType } from '../construction/blocks'
import type { EditorMode } from '../store/editorStore'

/** Small flat illustrations for the build dock, drawn on a 48 × 48 grid. */
const Svg = ({ children, size = 44 }: { children: ReactNode; size?: number }) => (
  <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
    {children}
  </svg>
)

const tree = (x: number, y: number, r = 7, c = '#5fa64a') => (
  <g key={`${x}-${y}`}>
    <rect x={x - 1.2} y={y + r - 2} width={2.4} height={7} rx={1} fill="#8a5a33" />
    <circle cx={x} cy={y} r={r} fill={c} />
    <circle cx={x - r / 3} cy={y - r / 3} r={r / 3} fill="#ffffff" opacity={0.25} />
  </g>
)
const flower = (x: number, y: number, c: string) => (
  <g key={`${x}-${y}`}>
    <line x1={x} y1={y} x2={x} y2={y + 8} stroke="#4c8f3a" strokeWidth={1.5} />
    {[0, 72, 144, 216, 288].map((a) => (
      <circle key={a} cx={x + 3 * Math.cos((a * Math.PI) / 180)} cy={y + 3 * Math.sin((a * Math.PI) / 180)} r={2.2} fill={c} />
    ))}
    <circle cx={x} cy={y} r={1.6} fill="#ffd54a" />
  </g>
)
const ground = (c = "#cfe8a8") => <rect key="ground" x={2} y={30} width={44} height={16} rx={5} fill={c} />

export function PathIcon({ type }: { type: PathType }) {
  const fill = { walking_trail: '#e8d3a5', accessible_path: '#d9d9de', jogging_trail: '#d98b6a' }[type]
  const edge = { walking_trail: '#c9a86a', accessible_path: '#a9a9b3', jogging_trail: '#b0654a' }[type]
  return (
    <Svg>
      <rect x={2} y={2} width={44} height={44} rx={8} fill="#cfe8a8" />
      <path d="M-2 40 C 14 34, 18 14, 50 8" stroke={edge} strokeWidth={14} fill="none" strokeLinecap="round" />
      <path d="M-2 40 C 14 34, 18 14, 50 8" stroke={fill} strokeWidth={11} fill="none" strokeLinecap="round" />
      {type === 'walking_trail' && <path d="M8 36 l3 -1 M18 26 l3 -2 M30 15 l3 -1" stroke="#a67c45" strokeWidth={2} strokeLinecap="round" />}
      {type === 'accessible_path' && (
        <g transform="translate(18 14)" fill="#3c6fd1">
          <circle cx={6} cy={2} r={2} />
          <path d="M5 5 h2 v5 h4 l2 5 h-2 l-1.6-3.4 H5 Z" />
          <circle cx={7} cy={14} r={4.5} fill="none" stroke="#3c6fd1" strokeWidth={1.6} />
        </g>
      )}
      {type === 'jogging_trail' && <path d="M-2 40 C 14 34, 18 14, 50 8" stroke="#ffffff" strokeWidth={1.4} strokeDasharray="3 3" fill="none" />}
      {tree(39, 30, 5)}
    </Svg>
  )
}

export function AreaIcon({ type }: { type: AreaType }) {
  switch (type) {
    case 'woodland':
      return <Svg>{[ground('#a6d68a'), tree(12, 22, 8, '#4f9a3c'), tree(34, 18, 9, '#3f8a34'), tree(24, 28, 7, '#5fa64a')]}</Svg>
    case 'grassland':
      return (
        <Svg>
          {ground('#c7e39a')}
          {[8, 15, 22, 29, 36, 42].map((x, i) => (
            <path key={x} d={`M${x} 40 q ${i % 2 ? 2 : -2} -8 ${i % 2 ? 4 : 1} -${12 + (i % 3) * 3}`} stroke="#6aa84f" strokeWidth={2} fill="none" strokeLinecap="round" />
          ))}
          <circle cx={36} cy={12} r={6} fill="#ffd54a" />
        </Svg>
      )
    case 'flower_garden':
      return <Svg>{[ground('#f9d6e3'), flower(12, 24, '#ef6fa0'), flower(24, 18, '#f3a33b'), flower(36, 24, '#b36fe0'), flower(18, 32, '#e84b5b'), flower(31, 33, '#ef6fa0')]}</Svg>
    case 'habitat':
      return (
        <Svg>
          {ground('#b8dca6')}
          {tree(14, 20, 8, '#5b9e4a')}
          <circle cx={34} cy={36} r={6} fill="#6aa84f" />
          <g transform="translate(32 12)">
            <ellipse cx={-4} cy={0} rx={4} ry={5} fill="#f08a24" />
            <ellipse cx={4} cy={0} rx={4} ry={5} fill="#f08a24" />
            <rect x={-0.8} y={-5} width={1.6} height={10} rx={0.8} fill="#4a3320" />
          </g>
        </Svg>
      )
    case 'picnic_lawn':
      return (
        <Svg>
          {ground('#a8dd84')}
          <path d="M8 30 L28 26 L40 36 L18 42 Z" fill="#e94b4b" />
          <path d="M13 29 L33 31 M18 28 L36 34 M13 35 L30 28" stroke="#ffffff" strokeWidth={1.6} />
          <rect x={30} y={14} width={10} height={8} rx={2} fill="#b07a45" />
          <path d="M31 14 q4 -6 8 0" stroke="#7a4f2a" strokeWidth={1.6} fill="none" />
          {tree(10, 14, 6)}
        </Svg>
      )
  }
}

export function FacilityIcon({ type }: { type: FacilityType }) {
  switch (type) {
    case 'playground':
      return (
        <Svg>
          {ground('#ffe3b0')}
          <path d="M6 40 L12 10 L18 40 M12 10 H34 M30 10 L26 40 M34 10 L38 40" stroke="#e5734b" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <path d="M23 12 v14 M29 12 v14" stroke="#555" strokeWidth={1} />
          <rect x={21} y={26} width={10} height={3} rx={1} fill="#3c8bd1" />
          <path d="M38 22 q4 10 8 18" stroke="#ffc928" strokeWidth={4} fill="none" strokeLinecap="round" />
        </Svg>
      )
    case 'basketball_court':
      return (
        <Svg>
          <rect x={3} y={8} width={42} height={34} rx={4} fill="#f2a26b" />
          <rect x={6} y={11} width={36} height={28} fill="none" stroke="#fff" strokeWidth={1.5} />
          <line x1={24} y1={11} x2={24} y2={39} stroke="#fff" strokeWidth={1.5} />
          <circle cx={24} cy={25} r={5} fill="none" stroke="#fff" strokeWidth={1.5} />
          <circle cx={24} cy={25} r={3.2} fill="#e66a1f" stroke="#7a3410" strokeWidth={0.8} />
          <rect x={6} y={20} width={7} height={10} fill="none" stroke="#fff" strokeWidth={1.5} />
          <rect x={35} y={20} width={7} height={10} fill="none" stroke="#fff" strokeWidth={1.5} />
        </Svg>
      )
    case 'picnic_area':
      return (
        <Svg>
          {ground('#ece0b8')}
          <path d="M8 18 L24 6 L40 18 Z" fill="#d9534f" />
          <rect x={10} y={18} width={2.5} height={18} fill="#8a5a33" />
          <rect x={35.5} y={18} width={2.5} height={18} fill="#8a5a33" />
          <rect x={14} y={28} width={20} height={3} rx={1} fill="#b07a45" />
          <path d="M17 31 l-3 7 M31 31 l3 7" stroke="#8a5a33" strokeWidth={2} />
        </Svg>
      )
    case 'community_plaza':
      return (
        <Svg>
          <rect x={3} y={3} width={42} height={42} rx={8} fill="#e9e1d2" />
          <path d="M3 24 H45 M24 3 V45" stroke="#d6cbb5" strokeWidth={1} />
          <circle cx={24} cy={24} r={11} fill="#cfc4ad" />
          <circle cx={24} cy={24} r={8} fill="#7cc6f2" />
          <path d="M24 24 q-5 -9 -1 -13 M24 24 q5 -9 1 -13" stroke="#ffffff" strokeWidth={1.6} fill="none" />
          {[[8, 8], [40, 8], [8, 40], [40, 40]].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={3.5} fill="#ef6fa0" />
          ))}
        </Svg>
      )
    case 'fitness_area':
      return (
        <Svg>
          {ground('#d5e6f5')}
          <path d="M8 40 V14 H40 V40" stroke="#3c6fd1" strokeWidth={3} fill="none" strokeLinecap="round" />
          {[14, 20, 26, 32].map((x) => (
            <line key={x} x1={x} y1={14} x2={x} y2={20} stroke="#3c6fd1" strokeWidth={2} />
          ))}
          <g transform="translate(24 32)">
            <rect x={-9} y={-1.2} width={18} height={2.4} fill="#555" />
            <rect x={-12} y={-5} width={4} height={10} rx={1} fill="#333" />
            <rect x={8} y={-5} width={4} height={10} rx={1} fill="#333" />
          </g>
        </Svg>
      )
  }
}

export function ModeIcon({ mode }: { mode: EditorMode }) {
  const size = 22
  switch (mode) {
    case 'browse':
      return (
        <Svg size={size}>
          <path d="M14 26 V12 a3 3 0 0 1 6 0 V22 V8 a3 3 0 0 1 6 0 V22 V10 a3 3 0 0 1 6 0 V24 V16 a3 3 0 0 1 6 0 V30 c0 8 -6 14 -14 14 c-6 0 -10 -4 -13 -9 l-5 -8 a3 3 0 0 1 5 -3 Z" fill="#ffd9a8" stroke="#a0703c" strokeWidth={2} />
        </Svg>
      )
    case 'path':
      return <PathIcon type="walking_trail" />
    case 'area':
      return <AreaIcon type="woodland" />
    case 'facility':
      return <FacilityIcon type="playground" />
    case 'remove':
      return (
        <Svg size={size}>
          <rect x={10} y={14} width={28} height={30} rx={4} fill="#ef8a80" stroke="#b5463c" strokeWidth={2} />
          <rect x={6} y={8} width={36} height={6} rx={2} fill="#b5463c" />
          <rect x={19} y={3} width={10} height={6} rx={2} fill="#b5463c" />
          <path d="M18 20 V38 M24 20 V38 M30 20 V38" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
        </Svg>
      )
  }
}
