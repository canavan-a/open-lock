import { useClock } from '@shopify/react-native-skia'
import { useEffect, useRef } from 'react'
import {
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type WithSpringConfig,
} from 'react-native-reanimated'
import type { DoorState } from '../api/client'

// 'pending' = command sent, waiting for the firmware to report the new state.
// 'failed' = it never did (or the request errored).
export type LockPhase = 'idle' | 'pending' | 'failed'

export interface LockColors {
  ink: string
  accent: string
  bg: string
}

export interface LockArtProps {
  size: number
  state: DoorState
  phase: LockPhase
  // 0..1 while a finger is down on the lock, sprung by the screen
  press: SharedValue<number>
  colors: LockColors
}

// Stiff with a little overshoot: everything lands in about half a second so
// the lock feels snappy rather than floaty.
export const GUMMY: WithSpringConfig = { damping: 14, stiffness: 420, mass: 1 }
export const BOUNCY: WithSpringConfig = { damping: 9, stiffness: 400, mass: 1 }
// The jump to the halfway pose on tap: near-critical and very stiff, ~100ms.
export const SNAP: WithSpringConfig = { damping: 70, stiffness: 2200, mass: 1 }

// A decaying wobble around 0, kicked by giving a spring at rest some velocity.
export function kick(v: SharedValue<number>, velocity: number, config: WithSpringConfig = BOUNCY) {
  'worklet'
  v.value = withSpring(0, { ...config, velocity })
}

export interface LockMotion {
  // 0 = closed, 1 = open, sprung (so it overshoots past both ends)
  open: SharedValue<number>
  // 0 while the state is unknown, 1 once known
  known: SharedValue<number>
  // eases to 1 while a command is pending
  pending: SharedValue<number>
  // -1..1 side to side when a command fails
  shake: SharedValue<number>
  // ms since mount, for continuous motion (waves, bobbing, jiggle)
  clock: SharedValue<number>
}

// The state every animation builds on. onChange fires for confirmed changes
// between two known states (not the first load), onFail when a command fails.
export function useLockMotion(
  state: DoorState,
  phase: LockPhase,
  opts: {
    spring?: WithSpringConfig
    onChange?: (toOpen: boolean) => void
    onFail?: () => void
    // animations that run their own transition (e.g. pop out, swap, pop in)
    // drive `open` themselves
    manualOpen?: boolean
    // how far (0..1) to jump towards the other state the moment a command is
    // sent (default halfway), so a tap gets an instant response; the rest of
    // the move plays when the firmware confirms, or it springs back on failure
    anticipate?: number
  } = {},
): LockMotion {
  const target = state === 'open' ? 1 : 0
  const open = useSharedValue(target)
  const known = useSharedValue(state === 'unknown' ? 0 : 1)
  const pending = useSharedValue(0)
  const shake = useSharedValue(0)
  const clock = useClock()
  const prevState = useRef(state)
  const anticipating = useRef(false)
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    const prev = prevState.current
    prevState.current = state
    anticipating.current = false
    known.value = withTiming(state === 'unknown' ? 0 : 1, { duration: 150 })
    if (state === 'unknown') return
    const wasKnown = prev !== 'unknown'
    if (!optsRef.current.manualOpen || !wasKnown) {
      open.value = wasKnown ? withSpring(target, optsRef.current.spring ?? GUMMY) : target
    }
    if (wasKnown && prev !== state) optsRef.current.onChange?.(state === 'open')
  }, [state, target, known, open])

  useEffect(() => {
    pending.value = withTiming(phase === 'pending' ? 1 : 0, { duration: 120 })
    const { anticipate = 0.5, manualOpen, spring } = optsRef.current
    if (anticipate && !manualOpen && state !== 'unknown') {
      if (phase === 'pending') {
        anticipating.current = true
        open.value = withSpring(target + (target ? -anticipate : anticipate), SNAP)
      } else if (anticipating.current) {
        // no state change came (failed or timed out): settle back
        anticipating.current = false
        open.value = withSpring(target, spring ?? GUMMY)
      }
    }
    if (phase === 'failed') {
      shake.value = withSequence(
        withTiming(1, { duration: 40 }),
        withRepeat(withTiming(-1, { duration: 60 }), 4, true),
        withSpring(0, GUMMY),
      )
      optsRef.current.onFail?.()
    }
    // state/target are read, not watched: a state change is the effect above's job
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pending, shake, open])

  return { open, known, pending, shake, clock }
}

// Finger-press squish plus the failure shake, pivoting on the lock's base.
// Most animations wrap everything in this.
export function useBaseTransform(m: LockMotion, press: SharedValue<number>) {
  return useDerivedValue(() => [
    { translateX: m.shake.value * 7 },
    { rotate: m.shake.value * 0.09 },
    { scaleX: 1 + press.value * 0.09 },
    { scaleY: 1 - press.value * 0.12 },
  ])
}

// 1 while the lock is at rest in one of the two poses, else 0. Animations
// that break the icon apart draw the plain icon while settled, so no seams or
// pieces ever show at rest.
export function useSettled(m: LockMotion) {
  return useDerivedValue((): number => {
    const t = m.open.value
    return Math.min(Math.abs(t), Math.abs(1 - t)) < 0.004 && m.pending.value < 0.01 ? 1 : 0
  })
}
