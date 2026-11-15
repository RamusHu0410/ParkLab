import { Clone, useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'
import { DRACO_DECODER_PATH, getAsset } from '../utils/assets'

type ModelProps = ThreeElements['group'] & { assetId: string }

/** Renders a static GLB from the asset manifest. Safe to use many times per asset. */
export function Model({ assetId, ...groupProps }: ModelProps) {
  const asset = getAsset(assetId)
  const { scene } = useGLTF(asset.url, asset.draco ? DRACO_DECODER_PATH : false)
  return (
    <group {...groupProps}>
      <Clone object={scene} castShadow receiveShadow />
    </group>
  )
}
