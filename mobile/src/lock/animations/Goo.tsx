import { Blur, Circle, ColorMatrix, Group, Paint } from '@shopify/react-native-skia'
import React from 'react'
import { Easing, type SharedValue, useDerivedValue, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { BODY, BODY_BOTTOM, OPEN_RISE, rand, shacklePath } from '../geometry'
import { BOUNCY, type LockArtProps, type LockMotion, useBaseTransform, useKnownOpacity, useLockMotion } from '../motion'
import { BASE, Body, Keyhole, LockCanvas, Shackle } from '../parts'

const DROPS = 5
// Blur then crush alpha: overlapping shapes melt into one blob ("gooey" filter).
const GOO_MATRIX = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 20, -8]

function Drop({ m, splash, i, color }: { m: LockMotion; splash: SharedValue<number>; i: number; color: string }) {
  const homeX = BODY.x + 10 + (i * (BODY.w - 20)) / (DROPS - 1)
  // drips stretch out of the bottom while waiting; on a change they splash
  // outwards and get pulled back in
  const cx = useDerivedValue(() => {
    const a = (i / DROPS) * Math.PI * 2 + rand(i) * 0.6
    return homeX + Math.cos(a) * Math.sin(splash.value * Math.PI) * 34
  })
  const cy = useDerivedValue(() => {
    const t = m.clock.value / 1000
    const drip = ((t * 0.8 + rand(i + 3)) % 1) * 22 * m.pending.value
    const a = (i / DROPS) * Math.PI * 2 + rand(i) * 0.6
    return BODY_BOTTOM - 6 + drip + Math.sin(a) * Math.sin(splash.value * Math.PI) * 30
  })
  const r = useDerivedValue(() => {
    const t = m.clock.value / 1000
    const f = (t * 0.8 + rand(i + 3)) % 1
    const dripR = (1 - f) * 6 * m.pending.value
    return Math.max(dripR, Math.sin(splash.value * Math.PI) * (5 + rand(i + 9) * 4))
  })
  return <Circle cx={cx} cy={cy} r={r} color={color} />
}

// The lock is a blob of goo: it drips while waiting, and splats outwards and
// slurps itself back together when the state changes.
export function Goo({ size, state, phase, press, colors }: LockArtProps) {
  const splash = useSharedValue(0)
  const m = useLockMotion(state, phase, {
    spring: BOUNCY,
    onChange: () => {
      splash.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, { duration: 800, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 0 }),
      )
    },
    onFail: () => {
      splash.value = withSequence(withTiming(0.35, { duration: 150 }), withTiming(0, { duration: 300 }))
    },
  })
  const opacity = useKnownOpacity(m)
  const base = useBaseTransform(m, press)
  const shackle = useDerivedValue(() => shacklePath(m.open.value * OPEN_RISE))
  // the whole blob breathes a little, more while waiting
  const wobble = useDerivedValue(() => {
    const t = m.clock.value / 1000
    const w = Math.sin(t * 3) * (0.015 + 0.04 * m.pending.value)
    return [{ scaleX: 1 + w }, { scaleY: 1 - w }]
  })

  return (
    <LockCanvas size={size}>
      <Group opacity={opacity} origin={BASE} transform={base}>
        <Group
          origin={BASE}
          transform={wobble}
          layer={
            <Paint>
              <Blur blur={3.5} />
              <ColorMatrix matrix={GOO_MATRIX} />
            </Paint>
          }
        >
          <Shackle path={shackle} color={colors.accent} />
          <Body color={colors.accent} />
          {Array.from({ length: DROPS }, (_, i) => (
            <Drop key={i} m={m} splash={splash} i={i} color={colors.accent} />
          ))}
        </Group>
        <Keyhole color={colors.bg} />
      </Group>
    </LockCanvas>
  )
}
