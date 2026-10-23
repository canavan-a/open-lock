import { Canvas, Group, Path, RoundedRect, type SkPath, vec } from '@shopify/react-native-skia'
import React, { useMemo } from 'react'
import type { SharedValue } from 'react-native-reanimated'
import { BODY, BODY_BOTTOM, BODY_CENTER_X, BOX, keyholePath, SHACKLE_WIDTH } from './geometry'

// The lock's 100-unit box takes up the middle of the canvas, leaving a margin
// on every side for effects that fly outside it (particles, ripples, drips).
const CANVAS_UNITS = 160

export function LockCanvas({ size, children }: { size: number; children: React.ReactNode }) {
  const s = size / CANVAS_UNITS
  const off = (size - BOX * s) / 2
  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ translateX: off }, { translateY: off }, { scale: s }]}>{children}</Group>
    </Canvas>
  )
}

// Where squash/stretch pivots: the middle of the lock's base, so it squishes
// into the "floor" instead of shrinking towards its centre.
export const BASE = vec(BODY_CENTER_X, BODY_BOTTOM)

type Animatable<T> = T | SharedValue<T>

export function Shackle({
  path,
  color,
  width = SHACKLE_WIDTH,
  opacity,
}: {
  path: SharedValue<SkPath>
  color: string
  width?: Animatable<number>
  opacity?: Animatable<number>
}) {
  return (
    <Path
      path={path}
      style="stroke"
      strokeWidth={width}
      strokeCap="round"
      color={color}
      opacity={opacity}
    />
  )
}

export function Body({ color, opacity }: { color: string; opacity?: Animatable<number> }) {
  return (
    <RoundedRect
      x={BODY.x}
      y={BODY.y}
      width={BODY.w}
      height={BODY.h}
      r={BODY.r}
      color={color}
      opacity={opacity}
    />
  )
}

// A soft highlight across the top of the body: makes it read as glossy candy.
export function Gloss({ opacity = 0.28 }: { opacity?: number }) {
  return (
    <RoundedRect
      x={BODY.x + 7}
      y={BODY.y + 5}
      width={BODY.w * 0.42}
      height={7}
      r={3.5}
      color="white"
      opacity={opacity}
    />
  )
}

export function Keyhole({ color }: { color: string }) {
  const path = useMemo(() => keyholePath(), [])
  return <Path path={path} color={color} />
}
