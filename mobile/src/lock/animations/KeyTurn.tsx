import { FillType, Group, Path, Skia } from '@shopify/react-native-skia'
import React, { useMemo } from 'react'
import { useDerivedValue, useSharedValue, type WithSpringConfig } from 'react-native-reanimated'
import { KEYHOLE, shacklePath } from '../geometry'
import { kick, type LockArtProps, useBaseTransform, useLockMotion } from '../motion'
import { BASE, Body, Keyhole, LockCanvas, Shackle, Solid } from '../parts'

const SPRING: WithSpringConfig = { damping: 26, stiffness: 520, mass: 1 }
// how far right the key starts before it slides in
const SLIDE = 22

// A flat key in the icon's style, seen side on and pointing left with its tip
// on the origin: straight blade, two teeth, square bow with a square hole.
function keyPath() {
  const p = Skia.Path.Make()
  p.addRect(Skia.XYWHRect(0, -2.2, 24, 4.4))
  p.addRect(Skia.XYWHRect(3, 2.2, 3, 3))
  p.addRect(Skia.XYWHRect(8.5, 2.2, 2.5, 2.4))
  p.addRect(Skia.XYWHRect(24, -7, 13, 14))
  p.addRect(Skia.XYWHRect(27.5, -3, 6, 6))
  p.setFillType(FillType.EvenOdd) // for the hole in the bow
  return p
}

function smooth(t: number) {
  'worklet'
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

// The key slides in from the side, tip into the keyhole, and turns a quarter
// on its own axis (its flat side foreshortens to edge-on), then the shackle
// pops and the key slides back out. Locking runs it all in reverse. A tap
// leaves the key in and half turned while the firmware answers.
export function KeyTurn({ size, state, phase, press, colors }: LockArtProps) {
  const thunk = useSharedValue(0)
  const m = useLockMotion(state, phase, {
    spring: SPRING,
    onChange: () => kick(thunk, 5, { damping: 18, stiffness: 700, mass: 1 }),
  })
  const base = useBaseTransform(m, press)
  const key = useMemo(keyPath, [])

  // along the move: slide in (0-0.3), turn (0.3-0.7), shackle (0.6-1), and the
  // key slides out again over the last stretch
  const insert = useDerivedValue(() => {
    const t = m.open.value
    return smooth(Math.min(t / 0.3, (1 - t) / 0.15))
  })
  const turn = useDerivedValue(() => smooth((m.open.value - 0.3) / 0.4))
  const shackleT = useDerivedValue(() => {
    const t = m.open.value
    return t > 1 ? t : Math.max(0, (t - 0.6) / 0.4)
  })
  const shackle = useDerivedValue(() => shacklePath(shackleT.value))

  const keyShown = useDerivedValue(() => (insert.value > 0.02 ? 1 : 0))
  const keyTransform = useDerivedValue(() => [
    { translateX: KEYHOLE.cx + (1 - insert.value) * SLIDE },
    { translateY: KEYHOLE.cy },
    // a quarter turn about its length leaves it edge-on: keep a sliver
    { scaleY: Math.max(0.16, Math.cos((turn.value * Math.PI) / 2)) },
  ])

  const transform = useDerivedValue(() => [
    ...base.value,
    { scaleX: 1 + thunk.value * 0.012 },
    { scaleY: 1 - thunk.value * 0.018 },
  ])

  return (
    <LockCanvas size={size}>
      <Group origin={BASE} transform={transform}>
        <Solid>
          <Shackle path={shackle} color={colors.ink} />
          <Body color={colors.ink} />
          <Keyhole open={turn} />
        </Solid>
        <Group transform={keyTransform} opacity={keyShown}>
          <Path path={key} color={colors.bg} style="stroke" strokeWidth={3} strokeJoin="miter" />
          <Path path={key} color={colors.accent} />
        </Group>
      </Group>
    </LockCanvas>
  )
}
