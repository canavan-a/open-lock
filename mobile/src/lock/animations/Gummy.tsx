import { Group } from '@shopify/react-native-skia'
import React from 'react'
import { Easing, useDerivedValue, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { OPEN_RISE, shacklePath } from '../geometry'
import { BOUNCY, kick, type LockArtProps, useKnownOpacity, useLockMotion } from '../motion'
import { BASE, Body, Gloss, Keyhole, LockCanvas, Shackle } from '../parts'

// A gummy candy that hops, lands with a squash, and boings its shackle.
// Hops in place while waiting.
export function Gummy({ size, state, phase, press, colors }: LockArtProps) {
  const hop = useSharedValue(0)
  const squash = useSharedValue(0)
  const m = useLockMotion(state, phase, {
    spring: BOUNCY,
    onChange: () => {
      hop.value = withSequence(
        withTiming(-18, { duration: 170, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 170, easing: Easing.in(Easing.quad) }, () => {
          'worklet'
          squash.value = withSpring(0, { ...BOUNCY, velocity: 7 })
        }),
      )
    },
    onFail: () => kick(squash, -5),
  })
  const opacity = useKnownOpacity(m)
  const shackle = useDerivedValue(() => shacklePath(m.open.value * OPEN_RISE))

  const transform = useDerivedValue(() => {
    const t = m.clock.value / 1000
    const waitHop = -Math.abs(Math.sin(t * 7)) * 6 * m.pending.value
    // stretch tall in the air, squash flat on landing
    const air = Math.min(0, hop.value) / -18
    const s = squash.value * 0.2 - air * 0.08
    return [
      { translateX: m.shake.value * 7 },
      { translateY: hop.value + waitHop },
      { scaleX: 1 + s + press.value * 0.1 },
      { scaleY: 1 - s - press.value * 0.14 },
    ]
  })

  return (
    <LockCanvas size={size}>
      <Group opacity={opacity} origin={BASE} transform={transform}>
        <Shackle path={shackle} color={colors.ink} />
        <Body color={colors.accent} />
        <Gloss />
        <Keyhole color={colors.bg} />
      </Group>
    </LockCanvas>
  )
}
