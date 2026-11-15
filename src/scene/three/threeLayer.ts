import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import { Camera, Matrix4, PCFShadowMap, SRGBColorSpace, Timer, WebGLRenderer } from 'three'
import { localToMercatorMatrix } from '../../geography/localFrame'
import type { ParkWorld } from './ParkWorld'

export const THREE_LAYER_ID = 'park-3d'

/**
 * MapLibre custom layer that draws the ParkWorld scene into the map's own WebGL
 * context. Sharing the context (instead of overlaying a second canvas) means
 * MapLibre's 3D buildings and our objects share one depth buffer, so they
 * occlude each other correctly.
 *
 * The camera's projection matrix is MapLibre's Mercator→clip matrix times our
 * local-metre→Mercator matrix, so the scene is authored purely in local metres.
 */
export function createThreeLayer(world: ParkWorld, onFrame?: (mercatorToClip: Matrix4) => void): CustomLayerInterface {
  let renderer: WebGLRenderer | null = null
  let map: MapLibreMap | null = null
  const camera = new Camera()
  const localToMercator = localToMercatorMatrix()
  const mercatorToClip = new Matrix4()
  const timer = new Timer()

  return {
    id: THREE_LAYER_ID,
    type: 'custom',
    renderingMode: '3d',

    onAdd(m, gl) {
      map = m
      renderer = new WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true })
      renderer.autoClear = false
      renderer.outputColorSpace = SRGBColorSpace
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = PCFShadowMap
      // Shadows are static apart from the citizens; re-render them every frame only while someone moves.
      renderer.shadowMap.autoUpdate = true
      world.onChange = () => m.triggerRepaint()
    },

    render(gl, args) {
      if (!renderer || !map) return
      timer.update()
      world.update(Math.min(timer.getDelta(), 0.1))

      mercatorToClip.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[])
      camera.projectionMatrix.multiplyMatrices(mercatorToClip, localToMercator)
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()

      renderer.resetState()
      renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      renderer.render(world.scene, camera)
      onFrame?.(mercatorToClip)

      if (world.animating) map.triggerRepaint()
    },

    onRemove() {
      world.dispose()
      // The context belongs to MapLibre; drop three's references without losing the context.
      renderer?.renderLists.dispose()
      renderer = null
      map = null
    },
  }
}
