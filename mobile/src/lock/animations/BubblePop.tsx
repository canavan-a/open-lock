import { Circle, Group } from '@shopify/react-native-skia'
import React from 'react'
import {
  Easing,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { OPEN_RISE, rand, shacklePath } from '../geometry'
import { BOUNCY, type LockArtProps, useKnownOpacity, useLockMotion } from '../motion'
import { Body, Gloss, Keyhole, LockCanvas, Shackle } from '../parts'

const BUBBLES = 11
const CENTER = { x: 50, y: 60 }
// timing of the pop: swell, burst, then the new lock pops back in
const SWELL_MS = 90
const BURST_MS = 80
const GONE_MS = SWELL_MS + BURST_MS

function Bubble({ burst, i, color }: { burst: SharedValue<number>; i: number; color: string }) {
  const a = (i / BUBBLES) * Math.PI * 2 + rand(i) * 0.5
  const dist = 30 + rand(i + 5) * 22
  const cx = useDerivedValue(() => CENTER.x + Math.cos(a) * (12 + burst.value * dist))
  const cy = useDerivedValue(() => CENTER.y + Math.sin(a) * (12 + burst.value * dist) - burst.value * 8)
  const r = useDerivedValue(() => (3 + rand(i + 2) * 4.5) * (0.4 + 0.6 * (1 - burst.value)))
  const opacity = useDerivedValue(() => (burst.value > 0 && burst.value < 1 ? 1 - burst.value : 0))
  const shineR = useDerivedValue(() => r.value * 0.3)
  return (
    <Group opacity={opacity}>
      <Circle cx={cx} cy={cy} r={r} color={color} style="stroke" strokeWidth={1.6} />
      <Circle cx={cx} cy={cy} r={shineR} color="white" opacity={0.7} />
    </Group>
  )
}

// A balloon: it swells and wobbles while waiting, pops into a spray of
// bubbles, and the new state pops back in with a boing.
export function BubblePop({ size, state, phase, press, colors }: LockArtProps) {
  const scale = useSharedValue(1)
  const burst = useSharedValue(0)
  const m = useLockMotion(state, phase, {
    manualOpen: true,
    onChange: (toOpen) => {
      scale.value = withSequence(
        withTiming(1.28, { duration: SWELL_MS }),
        withTiming(0, { duration: BURST_MS }),
        withDelay(140, withSpring(1, BOUNCY)),
      )
      // swap the shackle while the lock is invisible
      m.open.value = withDelay(GONE_MS, withTiming(toOpen ? 1 : 0, { duration: 0 }))
      burst.value = withSequence(
        withTiming(0, { duration: 0 }),
        withDelay(GONE_MS - 30, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) })),
      )
    },
  })
  const opacity = useKnownOpacity(m)
  const shackle = useDerivedValue(() => shacklePath(m.open.value * OPEN_RISE))

  const transform = useDerivedValue(() => {
    const t = m.clock.value / 1000
    const swell = 1 + m.pending.value * (0.14 + Math.sin(t * 6) * 0.03)
    const wob = Math.sin(t * 9) * 0.03 * m.pending.value
    const s = scale.value * swell
    return [
      { translateX: m.shake.value * 7 },
      { scaleX: s * (1 + wob + press.value * 0.1) },
      { scaleY: s * (1 - wob - press.value * 0.13) },
    ]
  })

  return (
    <LockCanvas size={size}>
      <Group opacity={opacity}>
        <Group origin={{ x: CENTER.x, y: CENTER.y }} transform={transform}>
          <Shackle path={shackle} color={colors.accent} />
          <Body color={colors.accent} />
          <Gloss opacity={0.4} />
          <Keyhole color={colors.bg} />
        </Group>
        {Array.from({ length: BUBBLES }, (_, i) => (
          <Bubble key={i} burst={burst} i={i} color={colors.accent} />
        ))}
      </Group>
    </LockCanvas>
  )
}
