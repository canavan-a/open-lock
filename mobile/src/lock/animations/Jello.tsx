import { Group, Oval } from '@shopify/react-native-skia'
import React from 'react'
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type WithSpringConfig,
} from 'react-native-reanimated'
import { BODY, BODY_BOTTOM, OPEN_RISE, shacklePath } from '../geometry'
import { kick, type LockArtProps, useKnownOpacity, useLockMotion } from '../motion'
import { BASE, Body, Gloss, Keyhole, LockCanvas, Shackle } from '../parts'

// Loose, fast springs: the sideways sway and the up/down squash ring at
// different rates, which is what makes it read as gelatin rather than rubber.
const SWAY: WithSpringConfig = { damping: 3, stiffness: 260, mass: 1 }
const SQUASH: WithSpringConfig = { damping: 4, stiffness: 190, mass: 1 }

// A translucent block of jelly that sways from its base, jiggles nervously
// while waiting, and wobbles itself silly when the state lands.
export function Jello({ size, state, phase, press, colors }: LockArtProps) {
  const sway = useSharedValue(0)
  const squash = useSharedValue(0)
  const m = useLockMotion(state, phase, {
    onChange: (toOpen) => {
      kick(sway, toOpen ? 5 : -5, SWAY)
      kick(squash, 6, SQUASH)
    },
    onFail: () => kick(sway, 8, SWAY),
  })
  const opacity = useKnownOpacity(m)

  // letting go of the lock gives it a little jiggle too
  useAnimatedReaction(
    () => press.value > 0.5,
    (down, wasDown) => {
      if (wasDown && !down) {
        sway.value = withSpring(0, { ...SWAY, velocity: 3 })
        squash.value = withSpring(0, { ...SQUASH, velocity: -3 })
      }
    },
  )

  const shackle = useDerivedValue(() => shacklePath(m.open.value * OPEN_RISE))

  const jelly = useDerivedValue(() => {
    const t = m.clock.value / 1000
    const breathe = Math.sin(t * 2.1) * 0.015
    const nervous = Math.sin(t * 17) * 0.06 * m.pending.value
    const s = squash.value * 0.16 + Math.sin(t * 11) * 0.035 * m.pending.value
    return [
      { translateX: m.shake.value * 7 },
      { skewX: sway.value * 0.2 + nervous + breathe },
      { scaleX: 1 + s + press.value * 0.12 },
      { scaleY: 1 - s - press.value * 0.16 },
    ]
  })

  // the shadow spreads as the jelly squashes
  const shadowW = useDerivedValue(() => BODY.w * (1 + squash.value * 0.25 + press.value * 0.15))
  const shadowX = useDerivedValue(() => 50 - shadowW.value / 2)

  return (
    <LockCanvas size={size}>
      <Group opacity={opacity}>
        <Oval
          x={shadowX}
          y={BODY_BOTTOM + 3}
          width={shadowW}
          height={6}
          color={colors.ink}
          opacity={0.12}
        />
        <Group origin={BASE} transform={jelly}>
          <Shackle path={shackle} color={colors.accent} opacity={0.75} />
          <Body color={colors.accent} opacity={0.85} />
          <Gloss opacity={0.35} />
          <Keyhole color={colors.bg} />
        </Group>
      </Group>
    </LockCanvas>
  )
}
