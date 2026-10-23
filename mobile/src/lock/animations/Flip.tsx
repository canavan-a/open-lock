import { Group, vec } from '@shopify/react-native-skia'
import React from 'react'
import { useDerivedValue, useSharedValue, type WithSpringConfig } from 'react-native-reanimated'
import { type LockArtProps, useBaseTransform, useLockMotion } from '../motion'
import { BASE, IconLock, LockCanvas } from '../parts'

// lands with one small rock past flat
const SPRING: WithSpringConfig = { damping: 16, stiffness: 380, mass: 1 }
const CENTER = vec(50, 50)
const PERSPECTIVE = 260

// The lock is a card with the other pose on its back: it flips over top to
// bottom. A tap tips it most of the way to edge-on, wobbling, until the
// firmware answers.
export function Flip({ size, state, phase, press, colors }: LockArtProps) {
  // stop short of edge-on so the waiting lock is never a sliver
  const m = useLockMotion(state, phase, { spring: SPRING, anticipate: 0.38 })
  const base = useBaseTransform(m, press)
  const closed = useSharedValue(0)
  const open = useSharedValue(1)

  const angle = useDerivedValue(() => {
    const wobble = Math.sin(m.clock.value / 90) * 0.1 * m.pending.value
    return Math.min(1.15, Math.max(-0.15, m.open.value)) * Math.PI + wobble
  })
  const frontUp = useDerivedValue(() => (Math.cos(angle.value) >= 0 ? 1 : 0))
  const backUp = useDerivedValue(() => 1 - frontUp.value)
  const front = useDerivedValue(() => [{ perspective: PERSPECTIVE }, { rotateX: angle.value }])
  // the back is drawn the right way up once it's facing us
  const back = useDerivedValue(() => [{ perspective: PERSPECTIVE }, { rotateX: angle.value - Math.PI }])

  return (
    <LockCanvas size={size}>
      <Group origin={BASE} transform={base}>
        <Group opacity={frontUp}>
          <IconLock open={closed} color={colors.ink} origin={CENTER} transform={front} />
        </Group>
        <Group opacity={backUp}>
          <IconLock open={open} color={colors.ink} origin={CENTER} transform={back} />
        </Group>
      </Group>
    </LockCanvas>
  )
}
