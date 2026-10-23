import { Canvas, Group, Path, Rect, type SkPath, vec } from '@shopify/react-native-skia'
import React from 'react'
import { type SharedValue, useDerivedValue } from 'react-native-reanimated'
import { BODY, BODY_BOTTOM, BODY_CENTER_X, BOX, KEYHOLE, keyholeTransform, SHACKLE_WIDTH } from './geometry'

// The lock's 100-unit box takes up the middle of the canvas, leaving a small
// margin on every side for the pending ring, hops and overshoot.
const CANVAS_UNITS = 125

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

// Square-ended, like the icon's legs.
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
      strokeCap="butt"
      color={color}
      opacity={opacity}
    />
  )
}

export function Body({ color, opacity }: { color: string; opacity?: Animatable<number> }) {
  return <Rect x={BODY.x} y={BODY.y} width={BODY.w} height={BODY.h} color={color} opacity={opacity} />
}

// Drawn in the background color over the body, standing in for the icon's cutout.
export function Keyhole({ color, open }: { color: string; open: SharedValue<number> }) {
  const transform = useDerivedValue(() => keyholeTransform(open.value))
  return (
    <Rect
      x={KEYHOLE.cx - KEYHOLE.w / 2}
      y={KEYHOLE.cy - KEYHOLE.h / 2}
      width={KEYHOLE.w}
      height={KEYHOLE.h}
      color={color}
      origin={vec(KEYHOLE.cx, KEYHOLE.cy)}
      transform={transform}
    />
  )
}
