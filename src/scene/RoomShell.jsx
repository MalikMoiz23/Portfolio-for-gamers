import { useMemo } from 'react'
import { B } from '../layout'
import { planeUV, boxUV } from './util'

/* ============================================================================
 * THE FINISHED ROOM SHELL
 * ----------------------------------------------------------------------------
 * Plaster over a wood wainscot, chair rail, skirting and cornice, carpet floor.
 * Shared by ABOUT and PROJECTS so the two read as rooms in the same building
 * rather than two separate builds that happen to use the same textures.
 *
 * Local space, same as every room: +x runs away from the corridor (0 is the
 * doorway wall, B.roomD the far wall), z runs along the corridor centred on the
 * door, y is up.
 *
 * `mats` is the shared finish set from materials.js — tinted once per frame by
 * Corridor, never by the room using it.
 * ========================================================================== */

export const D_WALL = 0.5 // texel density, tiles per metre
export const D_FLOOR = 1.25
export const D_WOOD = 1.1

export const WAINSCOT = 0.96 // height of the panelling
export const RAIL_Y = 0.98

export default function RoomShell({ mats }) {
  const g = useMemo(() => {
    const doorOff = B.doorW / 2 + (B.roomW - B.doorW) / 4
    return {
      doorOff,
      floor: planeUV(B.roomD, B.roomW, D_FLOOR),
      ceil: planeUV(B.roomD, B.roomW, D_WALL),
      far: planeUV(B.roomW, B.roomH, D_WALL),
      side: planeUV(B.roomD, B.roomH, D_WALL),
      nearA: planeUV((B.roomW - B.doorW) / 2, B.roomH, D_WALL),
      lintel: planeUV(B.doorW, B.roomH - B.doorH, D_WALL),
      // panelling
      wainFar: planeUV(B.roomW, WAINSCOT, D_WOOD),
      wainSide: planeUV(B.roomD, WAINSCOT, D_WOOD),
      railFar: boxUV(0.05, 0.055, B.roomW, 2),
      railSide: boxUV(B.roomD, 0.055, 0.05, 2),
      skirtFar: boxUV(0.06, 0.13, B.roomW, 2),
      skirtSide: boxUV(B.roomD, 0.13, 0.06, 2),
      cornFar: boxUV(0.07, 0.09, B.roomW, 2),
      cornSide: boxUV(B.roomD, 0.09, 0.07, 2),
    }
  }, [])

  const halfW = B.roomW / 2

  return (
    <group>
      <mesh geometry={g.floor} material={mats.carpet} rotation={[-Math.PI / 2, 0, 0]} position={[B.roomD / 2, 0, 0]} receiveShadow />
      <mesh geometry={g.ceil} material={mats.ceiling} rotation={[Math.PI / 2, 0, 0]} position={[B.roomD / 2, B.roomH, 0]} receiveShadow />

      {/* plaster above the rail */}
      <mesh geometry={g.far} material={mats.wall} position={[B.roomD, B.roomH / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={g.side} material={mats.wall} position={[B.roomD / 2, B.roomH / 2, -halfW]} receiveShadow />
      <mesh geometry={g.side} material={mats.wall} position={[B.roomD / 2, B.roomH / 2, halfW]} rotation={[0, Math.PI, 0]} receiveShadow />
      <mesh geometry={g.nearA} material={mats.wall} position={[0, B.roomH / 2, g.doorOff]} rotation={[0, Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={g.nearA} material={mats.wall} position={[0, B.roomH / 2, -g.doorOff]} rotation={[0, Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={g.lintel} material={mats.wall} position={[0, (B.roomH + B.doorH) / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow />

      {/* wood panelling below it, stood 8mm proud so the rail has something to
          sit on and the join catches a highlight */}
      <mesh geometry={g.wainFar} material={mats.wood} position={[B.roomD - 0.008, WAINSCOT / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={g.wainSide} material={mats.wood} position={[B.roomD / 2, WAINSCOT / 2, -halfW + 0.008]} receiveShadow />
      <mesh geometry={g.wainSide} material={mats.wood} position={[B.roomD / 2, WAINSCOT / 2, halfW - 0.008]} rotation={[0, Math.PI, 0]} receiveShadow />

      {/* chair rail, skirting, cornice */}
      <mesh geometry={g.railFar} material={mats.wood} position={[B.roomD - 0.03, RAIL_Y, 0]} castShadow />
      <mesh geometry={g.railSide} material={mats.wood} position={[B.roomD / 2, RAIL_Y, -halfW + 0.03]} castShadow />
      <mesh geometry={g.railSide} material={mats.wood} position={[B.roomD / 2, RAIL_Y, halfW - 0.03]} castShadow />

      <mesh geometry={g.skirtFar} material={mats.wood} position={[B.roomD - 0.035, 0.065, 0]} />
      <mesh geometry={g.skirtSide} material={mats.wood} position={[B.roomD / 2, 0.065, -halfW + 0.035]} />
      <mesh geometry={g.skirtSide} material={mats.wood} position={[B.roomD / 2, 0.065, halfW - 0.035]} />

      <mesh geometry={g.cornFar} material={mats.ceiling} position={[B.roomD - 0.04, B.roomH - 0.05, 0]} />
      <mesh geometry={g.cornSide} material={mats.ceiling} position={[B.roomD / 2, B.roomH - 0.05, -halfW + 0.04]} />
      <mesh geometry={g.cornSide} material={mats.ceiling} position={[B.roomD / 2, B.roomH - 0.05, halfW - 0.04]} />
    </group>
  )
}
