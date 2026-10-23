import { Group } from '@shopify/react-native-skia'
import React from 'react'
import { Easing, useDerivedValue, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { OPEN_RISE, SHACKLE_WIDTH, shacklePath } from '../geometry'
import { BOUNCY, type LockArtProps, useKnownOpacity, useLockMotion } from '../motion'
import { BASE, Body, Gloss, Keyhole, LockCanvas, Shackle } from '../parts'

// The shackle is pulled taffy: unlocking stretches it way up (thinning as it
// goes) before it snaps back to open; locking squishes it down into the body.
// While waiting it's being tugged.
export function Taffy({ size, state, phase, press, colors }: LockArtProps) {
  const stretch = useSharedValue(0)
  const m = useLockMotion(state, phase, {
    onChange: (toOpen) => {
      stretch.value = toOpen
        ? withSequence(
            withTiming(26, { duration: 240, easing: Easing.out(Easing.cubic) }),
            withSpring(0, { damping: 4, stiffness: 230, mass: 1 }),
          )
        : withSequence(withTiming(-9, { duration: 110 }), withSpring(0, BOUNCY))
    },
    onFail: () => {
      stretch.value = withSequence(withTiming(14, { duration: 160 }), withSpring(0, BOUNCY))
    },
  })
  const opacity = useKnownOpacity(m)

  const pull = useDerivedValue(() => {
    const t = m.clock.value / 1000
    return stretch.value + (5 + Math.sin(t * 6) * 4) * m.pending.value
  })
  const shackle = useDerivedValue(() => shacklePath(m.open.value * OPEN_RISE, pull.value))
  // taffy thins as it stretches and fattens as it squashes
  const width = useDerivedValue(() =>
    Math.max(4.5, Math.min(14, SHACKLE_WIDTH - pull.value * 0.2)),
  )
  // the body gets squashed when the shackle is pushed into it
  const transform = useDerivedValue(() => {
    const squash = Math.max(0, -pull.value) * 0.025
    return [
      { translateX: m.shake.value * 7 },
      { scaleX: 1 + squash + press.value * 0.09 },
      { scaleY: 1 - squash - press.value * 0.12 },
    ]
  })

  return (
    <LockCanvas size={size}>
      <Group opacity={opacity} origin={BASE} transform={transform}>
        <Shackle path={shackle} color={colors.accent} width={width} />
        <Body color={colors.ink} />
        <Gloss opacity={0.18} />
        <Keyhole color={colors.bg} />
      </Group>
    </LockCanvas>
  )
}
