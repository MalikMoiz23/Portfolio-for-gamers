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
        {/* A cheap bloom is still worth keeping on weak hardware — without it
            none of the neon reads as neon. Everything else goes. */}
        <Bloom intensity={0.7} luminanceThreshold={0.62} luminanceSmoothing={0.3} mipmapBlur radius={0.6} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <HueSaturation saturation={0.2} hue={0} />
        <Vignette offset={0.28} darkness={1.05} blendFunction={BlendFunction.NORMAL} />
        <Noise opacity={0.05} blendFunction={BlendFunction.OVERLAY} />
      </EffectComposer>
    )
  }

  return (
    <EffectComposer multisampling={4} frameBufferType={THREE.HalfFloatType}>
      {/* Threshold sits just under the neon so the strips, the door bleed and
          the monitors all blow out, while the board text — which is deliberately
          dim — stays under it and keeps its edges. Drop below ~0.5 and the type
          grows a halo that reads as out of focus. */}
      <Bloom intensity={0.95} luminanceThreshold={0.55} luminanceSmoothing={0.3} mipmapBlur radius={0.78} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {/* Positive now, not negative. ACES already desaturates hard in the
          highlights; pulling saturation down on top of it turned every accent
          into grey with an opinion. */}
      <HueSaturation saturation={0.24} hue={0} />
      <BrightnessContrast brightness={0.012} contrast={0.14} />
      <ChromaticAberration offset={ca} radialModulation modulationOffset={0.42} />
      <Vignette offset={0.26} darkness={0.98} blendFunction={BlendFunction.NORMAL} />
      <Noise opacity={0.055} blendFunction={BlendFunction.OVERLAY} />
    </EffectComposer>
  )
}
