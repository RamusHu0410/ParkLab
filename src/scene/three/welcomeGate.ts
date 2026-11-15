import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SRGBColorSpace } from 'three'

/** Gate size in metres. */
export const GATE = { width: 8, height: 5.2, depth: 1.2 }

function signTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#fff3c4'
  g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = '#8a5a33'
  g.lineWidth = 16
  g.strokeRect(8, 8, c.width - 16, c.height - 16)
  g.fillStyle = '#3f6b2a'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = 'bold 92px system-ui, sans-serif'
  g.fillText('Wismer Park', c.width / 2, 100)
  g.fillStyle = '#8a5a33'
  g.font = '600 60px system-ui, sans-serif'
  g.fillText('Welcomes you', c.width / 2, 186)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/**
 * Entrance arch with a "Wismer Park Welcomes you" sign: two stone pillars,
 * a timber beam and open wooden doors. Front faces +z; the opening runs along x.
 */
export function buildWelcomeGate(): Group {
  const g = new Group()
  g.name = 'welcome-gate'
  const stone = new MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9 })
  const wood = new MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.8 })
  const roof = new MeshStandardMaterial({ color: 0x5a9b3c, roughness: 0.7 })
  const half = GATE.width / 2
  for (const side of [-1, 1]) {
    const pillar = new Mesh(new BoxGeometry(0.9, GATE.height, 0.9), stone)
    pillar.position.set(side * half, GATE.height / 2, 0)
    const cap = new Mesh(new BoxGeometry(1.2, 0.3, 1.2), wood)
    cap.position.set(side * half, GATE.height + 0.15, 0)
    const lamp = new Mesh(new CylinderGeometry(0.18, 0.18, 0.4, 12), new MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc928, emissiveIntensity: 0.6 }))
    lamp.position.set(side * half, GATE.height + 0.5, 0)
    // Open doors swung inwards, so the way in is clear.
    const L = half - 0.5
    const swing = 1.1
    const door = new Mesh(new BoxGeometry(L, 2.4, 0.12), wood)
    door.position.set(side * (half - 0.45) - side * Math.cos(swing) * (L / 2), 1.3, -Math.sin(swing) * (L / 2))
    door.rotation.y = -side * swing
    g.add(pillar, cap, lamp, door)
  }
  const beam = new Mesh(new BoxGeometry(GATE.width + 1.4, 0.45, 1), wood)
  beam.position.y = GATE.height - 0.6
  const top = new Mesh(new BoxGeometry(GATE.width + 2, 0.25, 1.4), roof)
  top.position.y = GATE.height + 0.45
  // The sign hangs under the beam, text on the front (+z) face.
  const tex = signTexture()
  const face = new MeshStandardMaterial({ map: tex, roughness: 0.6 })
  const sign = new Mesh(new BoxGeometry(6.4, 1.6, 0.15), [wood, wood, wood, wood, face, wood])
  sign.position.y = GATE.height - 1.7
  g.add(beam, top, sign)
  g.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).castShadow = (o as Mesh).receiveShadow = true
  })
  return g
}
