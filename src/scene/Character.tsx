import { useAnimations, useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { getAsset } from '../utils/assets'

type CharacterProps = ThreeElements['group'] & { assetId: string; clip?: string }

/** Renders a rigged character and loops one of its animation clips. */
export function Character({ assetId, clip = 'Idle', ...groupProps }: CharacterProps) {
  const asset = getAsset(assetId)
  const { scene, animations } = useGLTF(asset.url)
  // Skinned meshes need SkeletonUtils.clone so each instance gets its own skeleton.
  const instance = useMemo(() => cloneSkinned(scene), [scene])
  const { actions } = useAnimations(animations, instance)

  useEffect(() => {
    const action = actions[clip]
    action?.reset().fadeIn(0.2).play()
    return () => {
      action?.fadeOut(0.2)
    }
  }, [actions, clip])

  return (
    <group {...groupProps}>
      <primitive object={instance} />
    </group>
  )
}
