import { useMemo } from 'react'
import * as THREE from 'three'
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  Noise,
  ToneMapping,
  HueSaturation,
  BrightnessContrast,
} from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { useStore } from '../store'

/* The camera the visitor is looking through is a cheap one: it blooms, it
 * fringes at the edges, it is grainy, and it vignettes hard. All of that is
 * doing more for the horror than any amount of extra geometry would. */
export default function Effects() {
  const lowSpec = useStore((s) => s.lowSpec)
  const ca = useMemo(() => new THREE.Vector2(0.00055, 0.00075), [])

  if (lowSpec) {
    return (
      <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.28} darkness={1.05} blendFunction={BlendFunction.NORMAL} />
        <Noise opacity={0.05} blendFunction={BlendFunction.OVERLAY} />
      </EffectComposer>
    )
  }

  return (
    <EffectComposer multisampling={4} frameBufferType={THREE.HalfFloatType}>
      {/* threshold high enough that only actual light sources bloom — at 0.3 a
          lit doorway reveal blows out into a white slab */}
      <Bloom intensity={0.58} luminanceThreshold={0.46} luminanceSmoothing={0.3} mipmapBlur radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation saturation={-0.14} hue={0} />
      <BrightnessContrast brightness={0.018} contrast={0.09} />
      <ChromaticAberration offset={ca} radialModulation modulationOffset={0.42} />
      <Vignette offset={0.26} darkness={0.98} blendFunction={BlendFunction.NORMAL} />
      <Noise opacity={0.055} blendFunction={BlendFunction.OVERLAY} />
    </EffectComposer>
  )
}
