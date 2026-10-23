import { Group } from '@shopify/react-native-skia'
import React, { useEffect, useRef } from 'react'
import { Easing, useDerivedValue, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { shacklePath } from '../geometry'
import { type LockArtProps, useBaseTransform, useLockMotion } from '../motion'
import { BASE, Body, Keyhole, LockCanvas, Shackle, Solid } from '../parts'

// how far the shackle comes away from its pose while it waits
const HOVER = 0.22
// the hard stop: a stiff, quick jolt and nothing more
const CLACK = { damping: 22, stiffness: 1400, mass: 1 }

// No springiness at all: the shackle is yanked into place, accelerating the
// whole way like it's caught by a magnet, and stops dead with a clack. A tap
// pulls it just off the body, where it hovers and buzzes.
export function Magnet({ size, state, phase, press, colors }: LockArtProps) {
  const clack = useSharedValue(0)
  const hovering = useRef(false)
  const m = useLockMotion(state, phase, {
    manualOpen: true,
    onChange: (toOpen) => {
      hovering.current = false
      m.open.value = withTiming(
        toOpen ? 1 : 0,
        { duration: 170, easing: Easing.in(Easing.cubic) },
        (done) => {
          'worklet'
          if (done) clack.value = withSpring(0, { ...CLACK, velocity: 9 })
        },
      )
    },
  })
  const target = state === 'open' ? 1 : 0

  useEffect(() => {
    if (state === 'unknown') return
    if (phase === 'pending') {
      hovering.current = true
      m.open.value = withTiming(target + (target ? -HOVER : HOVER), {
        duration: 70,
        easing: Easing.out(Easing.cubic),
      })
    } else if (hovering.current) {
      // no change came: let go back to where it was
      hovering.current = false
      m.open.value = withTiming(target, { duration: 110, easing: Easing.in(Easing.cubic) }, (done) => {
        'worklet'
        if (done) clack.value = withSpring(0, { ...CLACK, velocity: 5 })
      })
    }
    // state/target are read, not watched: a state change is onChange's job
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const base = useBaseTransform(m, press)
  const shackle = useDerivedValue(() => shacklePath(m.open.value))
  const buzz = useDerivedValue(() => {
    const t = m.clock.value
    return [
      { translateX: Math.sin(t * 0.11) * 0.7 * m.pending.value },
      { translateY: Math.cos(t * 0.083) * 0.5 * m.pending.value },
    ]
  })
  const transform = useDerivedValue(() => [
    ...base.value,
    { translateY: clack.value * 6 },
    { scaleY: 1 - Math.abs(clack.value) * 0.1 },
  ])

  return (
    <LockCanvas size={size}>
      <Solid origin={BASE} transform={transform}>
        <Group transform={buzz}>
          <Shackle path={shackle} color={colors.ink} />
        </Group>
        <Body color={colors.ink} />
        <Keyhole open={m.open} />
      </Solid>
    </LockCanvas>
  )
}
