import { OrbitControls, Sky } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { Character } from './Character'
import { Model } from './Model'
import { PlacedItems } from './PlacedItems'

/**
 * Root 3D scene. The flat ground is a placeholder until the geography step
 * replaces it with the real Wismer Park boundary.
 */
export function ParkScene() {
  return (
    <Canvas shadows="percentage" camera={{ position: [12, 10, 14], fov: 50 }}>
      <Sky sunPosition={[50, 40, 20]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[20, 30, 10]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} />

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#7cb26a" />
      </mesh>

      <Suspense fallback={null}>
        {/* Asset pipeline check: one model from each pack plus an animated character. */}
        <Model assetId="round_tree" position={[-4, 0, -2]} />
        <Model assetId="Tree_Round_LowPoly" position={[4, 0, -2]} />
        <Character assetId="Person_Woman_Pink" clip="Walk" position={[0, 0, 1]} />
        <PlacedItems />
      </Suspense>

      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.1} />
    </Canvas>
  )
}
