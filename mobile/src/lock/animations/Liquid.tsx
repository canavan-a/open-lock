import { Blur, Circle, ColorMatrix, Group, Paint, Path, Skia } from '@shopify/react-native-skia'
import React from 'react'
import {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type WithSpringConfig,
} from 'react-native-reanimated'
import { BODY, BODY_BOTTOM, ix, iy, shacklePath } from '../geometry'
import { kick, type LockArtProps, type LockMotion, useBaseTransform, useLockMotion } from '../motion'
import { BASE, Keyhole, LockCanvas, Shackle, Solid } from '../parts'

const SPRING: WithSpringConfig = { damping: 18, stiffness: 320, mass: 1 }
// a water drop's wobble: quick, with a few visible rings
const WOBBLE: WithSpringConfig = { damping: 6, stiffness: 280, mass: 1 }

// Blur then a hard alpha threshold: anything close enough melts together and
// every edge goes round, which is what makes separate shapes read as one liquid.
const GOO = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 18, -7]
// at rest it holds the icon's shape with just-softened corners; moving, it runs
const BLUR_REST = 0.9
const BLUR_FLOWING = 2.8

// The body as a drop of liquid sitting on the floor: it squashes and bulges
// with `wobble` and its top ripples.
function bodyBlob(wobble: number, ripple: number, t: number) {
  'worklet'
  const left = BODY.x
  const right = BODY.x + BODY.w
  const top = BODY.y + wobble * 3
  const h = BODY_BOTTOM - top
  const bulge = (y: number) => wobble * 2.4 * Math.sin((Math.PI * (y - top)) / h)
  const p = Skia.Path.Make()
  p.moveTo(left - bulge(BODY_BOTTOM), BODY_BOTTOM)
  for (let y = BODY_BOTTOM; y >= top; y -= 3) p.lineTo(left - bulge(y), y)
  for (let x = left; x <= right; x += 2) {
    p.lineTo(x, top + Math.sin(x * 0.25 + t * 7) * ripple)
  }
  for (let y = top; y <= BODY_BOTTOM; y += 3) p.lineTo(right + bulge(y), y)
  p.close()
  return p
}

// A droplet flicked off the shackle as it swings, falling back into the body.
function Drop({ drop, toOpen, color }: { drop: SharedValue<number>; toOpen: SharedValue<boolean>; color: string }) {
  const cx = useDerivedValue(() => {
    const from = toOpen.value ? ix(15) : ix(11)
    const to = toOpen.value ? ix(12.5) : ix(9.5)
    return from + (to - from) * drop.value
  })
  const cy = useDerivedValue(() => {
    const d = drop.value
    return iy(4.5) - Math.sin(Math.PI * d) * 9 + d * d * (BODY.y + 2 - iy(4.5))
  })
  // gone at both ends: at the start it's still part of the shackle, at the
  // end it has merged into the body
  const r = useDerivedValue(() => 3.4 * Math.sin(Math.PI * Math.min(1, drop.value * 1.1)))
  return <Circle cx={cx} cy={cy} r={r} color={color} />
}

// Blobs that swell out of the top of the body and sink back, while waiting.
function Boil({ m, i, color }: { m: LockMotion; i: number; color: string }) {
  const x = [41, 50, 59][i]
  const cy = useDerivedValue(
    () => BODY.y + 1 - (0.5 + 0.5 * Math.sin(m.clock.value / 140 + i * 2.1)) * 6 * m.pending.value,
  )
  const r = useDerivedValue(() => 3.6 * m.pending.value)
  return <Circle cx={x} cy={cy} r={r} color={color} />
}

// The lock itself is liquid. It holds the icon's shape at rest, then runs as
// it moves: the shackle stays joined to the body by a stretching strand, a
// drop flicks off and splashes back in, and the body wobbles like a water drop.
// While waiting it bubbles at the top.
export function Liquid({ size, state, phase, press, colors }: LockArtProps) {
  const wobble = useSharedValue(0)
  const drop = useSharedValue(0)
  const dropToOpen = useSharedValue(true)
  const m = useLockMotion(state, phase, {
    spring: SPRING,
    onChange: (toOpen) => {
      dropToOpen.value = toOpen
      kick(wobble, 7, WOBBLE)
      drop.value = 0
      drop.value = withTiming(1, { duration: 460, easing: Easing.linear })
    },
    onFail: () => kick(wobble, -8, WOBBLE),
  })
  const base = useBaseTransform(m, press)

  // letting go of the lock sets it rippling
  useAnimatedReaction(
    () => press.value > 0.5,
    (down, wasDown) => {
      if (wasDown && !down) wobble.value = withSpring(0, { ...WOBBLE, velocity: 5 })
    },
  )

  const shackle = useDerivedValue(() => shacklePath(m.open.value))
  const body = useDerivedValue(() => {
    const t = m.clock.value / 1000
    const ripple = 0.4 + 1.6 * m.pending.value + Math.abs(wobble.value) * 0.6
    return bodyBlob(wobble.value, ripple, t)
  })
  const blur = useDerivedValue(() => {
    const t = Math.min(1, Math.max(0, m.open.value))
    const swinging = 4 * t * (1 - t)
    const flow = Math.min(1, swinging + m.pending.value + Math.abs(wobble.value) * 0.5)
    return BLUR_REST + (BLUR_FLOWING - BLUR_REST) * flow
  })

  return (
    <LockCanvas size={size}>
      <Solid origin={BASE} transform={base}>
        <Group
          layer={
            <Paint>
              <Blur blur={blur} />
              <ColorMatrix matrix={GOO} />
            </Paint>
          }
        >
          <Shackle path={shackle} color={colors.ink} />
          <Path path={body} color={colors.ink} />
          <Drop drop={drop} toOpen={dropToOpen} color={colors.ink} />
          {[0, 1, 2].map((i) => (
            <Boil key={i} m={m} i={i} color={colors.ink} />
          ))}
        </Group>
        <Keyhole open={m.open} />
      </Solid>
    </LockCanvas>
  )
}
