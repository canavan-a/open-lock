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
import { OPEN_RISE, shacklePath } from '../geometry'
import { BOUNCY, type LockArtProps, type LockMotion, useKnownOpacity, useLockMotion } from '../motion'
import { BASE, Body, Gloss, Keyhole, LockCanvas, Shackle } from '../parts'

const DROP_MS = 260
const CENTER = { x: 50, y: 64 }
const RINGS = 3

function Ring({ ripple, i, color }: { ripple: SharedValue<number>; i: number; color: string }) {
  const local = useDerivedValue(() => Math.min(1, Math.max(0, (ripple.value - i * 0.16) / 0.84)))
  const r = useDerivedValue(() => 36 + local.value * 44)
  const opacity = useDerivedValue(() => (local.value > 0 && local.value < 1 ? (1 - local.value) * 0.7 : 0))
  const width = useDerivedValue(() => 3.5 * (1 - local.value) + 0.6)
  return (
    <Circle cx={CENTER.x} cy={CENTER.y} r={r} color={color} style="stroke" strokeWidth={width} opacity={opacity} />
  )
}

// a slow, faint ripple that keeps going while waiting
function WaitRing({ m, color }: { m: LockMotion; color: string }) {
  const f = useDerivedValue(() => ((m.clock.value / 1000) * 0.6) % 1)
  const r = useDerivedValue(() => 34 + f.value * 30)
  const opacity = useDerivedValue(() => (1 - f.value) * 0.4 * m.pending.value)
  return <Circle cx={CENTER.x} cy={CENTER.y} r={r} color={color} style="stroke" strokeWidth={2} opacity={opacity} />
}

// The lock floats on water: it bobs while waiting, then a drop falls on it,
// it dunks with a squash and sends rings rippling out.
export function Splash({ size, state, phase, press, colors }: LockArtProps) {
  const drop = useSharedValue(0)
  const ripple = useSharedValue(0)
  const dunk = useSharedValue(0)
  const m = useLockMotion(state, phase, {
    spring: BOUNCY,
    onChange: () => {
      drop.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, { duration: DROP_MS, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: 0 }),
      )
      dunk.value = withDelay(DROP_MS, withSpring(0, { ...BOUNCY, velocity: 8 }))
      ripple.value = withSequence(
        withTiming(0, { duration: 0 }),
        withDelay(DROP_MS, withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) })),
      )
    },
    onFail: () => {
      dunk.value = withSpring(0, { ...BOUNCY, velocity: -5 })
    },
  })
  const opacity = useKnownOpacity(m)
  const shackle = useDerivedValue(() => shacklePath(m.open.value * OPEN_RISE))

  const transform = useDerivedValue(() => {
    const t = m.clock.value / 1000
    const bob = Math.sin(t * 1.6) * 1.2 + Math.sin(t * 4.5) * 3 * m.pending.value
    const tilt = Math.sin(t * 2.3) * (0.02 + 0.05 * m.pending.value)
    const s = dunk.value * 0.12
    return [
      { translateX: m.shake.value * 7 },
      { translateY: bob + dunk.value * 2 },
      { rotate: tilt + m.shake.value * 0.09 },
      { scaleX: 1 + s + press.value * 0.09 },
      { scaleY: 1 - s - press.value * 0.12 },
    ]
  })

  const dropY = useDerivedValue(() => -40 + drop.value * 52)
  const dropOpacity = useDerivedValue(() => (drop.value > 0 && drop.value < 1 ? 1 : 0))

  return (
    <LockCanvas size={size}>
      <Group opacity={opacity}>
        <WaitRing m={m} color={colors.accent} />
        {Array.from({ length: RINGS }, (_, i) => (
          <Ring key={i} ripple={ripple} i={i} color={colors.accent} />
        ))}
        <Group origin={BASE} transform={transform}>
          <Shackle path={shackle} color={colors.ink} />
          <Body color={colors.accent} />
          <Gloss opacity={0.35} />
          <Keyhole color={colors.bg} />
        </Group>
        <Circle cx={50} cy={dropY} r={4} color={colors.accent} opacity={dropOpacity} />
      </Group>
    </LockCanvas>
  )
}
