import { Circle } from '@shopify/react-native-skia'
import React from 'react'
import { useDerivedValue, useSharedValue, type WithSpringConfig } from 'react-native-reanimated'
import { BODY, shacklePath } from '../geometry'
import { kick, type LockArtProps, useBaseTransform, useLockMotion } from '../motion'
import { BASE, Body, Keyhole, LockCanvas, Shackle, Solid } from '../parts'

// Stiff and nearly critically damped: the shackle snaps over with one small
// overshoot and is still within ~250ms.
const SWING: WithSpringConfig = { damping: 30, stiffness: 600, mass: 1 }
const PING_MS = 600

// The icon as it was, just moving: the shackle lifts and swings across to the
// open pose, the keyhole turns, and the body gives a small thunk when the
// shackle seats. Always fully solid, like the icon: a tap starts the shackle
// moving at once, and the old app's ping ring pulses while it waits.
export function Classic({ size, state, phase, press, colors }: LockArtProps) {
  const thunk = useSharedValue(0)
  const m = useLockMotion(state, phase, {
    spring: SWING,
    onChange: () => kick(thunk, 6, { damping: 18, stiffness: 700, mass: 1 }),
  })
  const base = useBaseTransform(m, press)

  const shackle = useDerivedValue(() => shacklePath(m.open.value))
  const transform = useDerivedValue(() => [
    ...base.value,
    { scaleX: 1 + thunk.value * 0.012 },
    { scaleY: 1 - thunk.value * 0.018 },
  ])

  // animate-ping-fast: a disc that grows to 2x and fades
  const f = useDerivedValue(() => Math.min(1, ((m.clock.value % PING_MS) / PING_MS) / 0.75))
  const ringR = useDerivedValue(() => 30 * (1 + f.value))
  const ringOpacity = useDerivedValue(() => 0.2 * (1 - f.value) * m.pending.value)

  return (
    <LockCanvas size={size}>
      <Circle
        cx={50}
        cy={BODY.y + BODY.h / 2 - 12}
        r={ringR}
        color={colors.ink}
        opacity={ringOpacity}
      />
      <Solid origin={BASE} transform={transform}>
        <Shackle path={shackle} color={colors.ink} />
        <Body color={colors.ink} />
        <Keyhole open={m.open} />
      </Solid>
    </LockCanvas>
  )
}
