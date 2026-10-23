import { Group, RoundedRect } from '@shopify/react-native-skia'
import React from 'react'
import {
  Easing,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { OPEN_RISE, rand, shacklePath } from '../geometry'
import { BOUNCY, kick, type LockArtProps, useKnownOpacity, useLockMotion } from '../motion'
import { BASE, Body, Gloss, Keyhole, LockCanvas, Shackle } from '../parts'

const COUNT = 18
const CANDY = ['#ff6fae', '#ffd23f', '#5ee2a0', '#58b8ff', '#b78cff', '#ff9a4a']
const ORIGIN = { x: 50, y: 52 }
const BURST_S = 1.1
const GRAVITY = 150

function Sprinkle({ burst, i }: { burst: SharedValue<number>; i: number }) {
  const vx = (rand(i) - 0.5) * 140
  const vy = -(70 + rand(i + 11) * 80)
  const spin = (rand(i + 23) - 0.5) * 18
  const transform = useDerivedValue(() => {
    const t = burst.value * BURST_S
    return [
      { translateX: ORIGIN.x + vx * t },
      { translateY: ORIGIN.y + vy * t + 0.5 * GRAVITY * t * t },
      { rotate: rand(i + 5) * Math.PI + spin * t },
    ]
  })
  const opacity = useDerivedValue(() => {
    const b = burst.value
    if (b <= 0 || b >= 1) return 0
    return b < 0.7 ? 1 : 1 - (b - 0.7) / 0.3
  })
  return (
    <Group transform={transform} opacity={opacity}>
      <RoundedRect x={-4} y={-1.4} width={8} height={2.8} r={1.4} color={CANDY[i % CANDY.length]} />
    </Group>
  )
}

// Party mode: the lock wiggles while waiting and throws a fistful of candy
// sprinkles when the state lands.
export function Sprinkles({ size, state, phase, press, colors }: LockArtProps) {
  const burst = useSharedValue(0)
  const pop = useSharedValue(0)
  const m = useLockMotion(state, phase, {
    spring: BOUNCY,
    onChange: () => {
      kick(pop, 6)
      burst.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, { duration: BURST_S * 1000, easing: Easing.linear }),
      )
    },
    onFail: () => kick(pop, -4),
  })
  const opacity = useKnownOpacity(m)
  const shackle = useDerivedValue(() => shacklePath(m.open.value * OPEN_RISE))

  const transform = useDerivedValue(() => {
    const t = m.clock.value / 1000
    const wiggle = Math.sin(t * 13) * 0.1 * m.pending.value
    const s = pop.value * 0.06
    return [
      { translateX: m.shake.value * 7 },
      { rotate: wiggle + m.shake.value * 0.09 },
      { scaleX: 1 + s + press.value * 0.09 },
      { scaleY: 1 + s - press.value * 0.12 },
    ]
  })

  return (
    <LockCanvas size={size}>
      <Group opacity={opacity}>
        <Group origin={BASE} transform={transform}>
          <Shackle path={shackle} color={colors.ink} />
          <Body color={colors.ink} />
          <Gloss opacity={0.15} />
          <Keyhole color={colors.bg} />
        </Group>
        {Array.from({ length: COUNT }, (_, i) => (
          <Sprinkle key={i} burst={burst} i={i} />
        ))}
      </Group>
    </LockCanvas>
  )
}
