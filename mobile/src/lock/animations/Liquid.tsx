import { Circle, Group, Path, RoundedRect, Skia } from '@shopify/react-native-skia'
import React, { useMemo } from 'react'
import { type SharedValue, useDerivedValue, useSharedValue } from 'react-native-reanimated'
import { BODY, BODY_BOTTOM, bodyPath, OPEN_RISE, shacklePath } from '../geometry'
import {
  kick,
  type LockArtProps,
  type LockMotion,
  useBaseTransform,
  useKnownOpacity,
  useLockMotion,
} from '../motion'
import { BASE, Keyhole, LockCanvas, Shackle } from '../parts'

// fraction of the body filled when locked / unlocked
const FULL = 0.86
const LOW = 0.2

function surfaceY(m: LockMotion) {
  'worklet'
  const open = Math.min(1.15, Math.max(-0.15, m.open.value))
  const level = FULL + (LOW - FULL) * open
  return BODY_BOTTOM - level * BODY.h
}

function wave(m: LockMotion, slosh: SharedValue<number>, phase: number, speed: number) {
  'worklet'
  const t = m.clock.value / 1000
  const y0 = surfaceY(m)
  const amp = 1.3 + 3.5 * m.pending.value + Math.abs(slosh.value) * 1.2
  const p = Skia.Path.Make()
  const left = BODY.x - 2
  const right = BODY.x + BODY.w + 2
  p.moveTo(left, BODY_BOTTOM + 2)
  for (let x = left; x <= right; x += 2) {
    const y = y0 + Math.sin(x * 0.15 + t * speed + phase) * amp + slosh.value * (x - 50) * 0.32
    p.lineTo(x, y)
  }
  p.lineTo(right, BODY_BOTTOM + 2)
  p.close()
  return p
}

function Bubble({ m, i, color }: { m: LockMotion; i: number; color: string }) {
  const cy = useDerivedValue(() => {
    const t = m.clock.value / 1000
    const f = (t * 0.7 + i / 3) % 1
    return BODY_BOTTOM - 3 - f * (BODY_BOTTOM - surfaceY(m) - 4)
  })
  const cx = useDerivedValue(() => 33 + i * 17 + Math.sin(m.clock.value / 250 + i) * 2)
  const opacity = useDerivedValue(() => 0.6 * m.pending.value)
  return <Circle cx={cx} cy={cy} r={2.2 + (i % 2)} color={color} opacity={opacity} />
}

// The body is a glass that's full when locked. Unlocking drains it, locking
// fills it back up; it sloshes when the level changes and churns with rising
// bubbles while waiting.
export function Liquid({ size, state, phase, press, colors }: LockArtProps) {
  const slosh = useSharedValue(0)
  const m = useLockMotion(state, phase, {
    spring: { damping: 12, stiffness: 70, mass: 1 },
    onChange: (toOpen) => kick(slosh, toOpen ? 1.2 : -1.2, { damping: 3, stiffness: 90, mass: 1 }),
    onFail: () => kick(slosh, 1.5, { damping: 3, stiffness: 120, mass: 1 }),
  })
  const opacity = useKnownOpacity(m)
  const base = useBaseTransform(m, press)
  const clip = useMemo(() => bodyPath(), [])

  const shackle = useDerivedValue(() => shacklePath(m.open.value * OPEN_RISE))
  const back = useDerivedValue(() => wave(m, slosh, 2.2, -2.4))
  const front = useDerivedValue(() => wave(m, slosh, 0, 3.1))

  return (
    <LockCanvas size={size}>
      <Group opacity={opacity} origin={BASE} transform={base}>
        <Shackle path={shackle} color={colors.ink} />
        <RoundedRect
          x={BODY.x}
          y={BODY.y}
          width={BODY.w}
          height={BODY.h}
          r={BODY.r}
          color={colors.bg}
        />
        <Group clip={clip}>
          <Path path={back} color={colors.accent} opacity={0.45} />
          <Path path={front} color={colors.accent} opacity={0.9} />
          {[0, 1, 2].map((i) => (
            <Bubble key={i} m={m} i={i} color="white" />
          ))}
        </Group>
        <RoundedRect
          x={BODY.x}
          y={BODY.y}
          width={BODY.w}
          height={BODY.h}
          r={BODY.r}
          color={colors.ink}
          style="stroke"
          strokeWidth={4}
        />
        <Keyhole color={colors.ink} />
      </Group>
    </LockCanvas>
  )
}
