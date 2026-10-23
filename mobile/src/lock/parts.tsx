import { Canvas, Group, Paint, Path, Rect, type SkPath, vec } from '@shopify/react-native-skia'
import React from 'react'
import { type SharedValue, useDerivedValue } from 'react-native-reanimated'
import { BODY, BODY_BOTTOM, BODY_CENTER_X, BOX, KEYHOLE, keyholeTransform, SHACKLE_WIDTH, shacklePath } from './geometry'

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

// Draws its children as one flat layer that fades as a whole, so the parts
// that overlap (the shackle legs seated in the body) never show through each
// other, and a cutout Keyhole punches a real hole like the icon's.
export function Solid({
  opacity,
  ...group
}: { opacity?: Animatable<number> } & Omit<React.ComponentProps<typeof Group>, 'layer' | 'opacity'>) {
  return <Group layer={<Paint opacity={opacity} />} {...group} />
}

// The whole icon at a pose (0 closed .. 1 open), as one solid piece with a
// real keyhole.
export function IconLock({
  open,
  color,
  ...group
}: {
  open: SharedValue<number>
  color: string
} & Omit<React.ComponentProps<typeof Group>, 'layer' | 'opacity' | 'children'>) {
  const shackle = useDerivedValue(() => shacklePath(open.value))
  return (
    <Group {...group}>
      <Solid>
        <Shackle path={shackle} color={color} />
        <Body color={color} />
        <Keyhole open={open} />
      </Solid>
    </Group>
  )
}

// With no color it's a cutout (only inside a Solid); with one it's painted on.
export function Keyhole({ color, open }: { color?: string; open: SharedValue<number> }) {
  const transform = useDerivedValue(() => keyholeTransform(open.value))
  return (
    <Rect
      x={KEYHOLE.cx - KEYHOLE.w / 2}
      y={KEYHOLE.cy - KEYHOLE.h / 2}
      width={KEYHOLE.w}
      height={KEYHOLE.h}
      color={color ?? 'black'}
      blendMode={color ? undefined : 'dstOut'}
      origin={vec(KEYHOLE.cx, KEYHOLE.cy)}
      transform={transform}
    />
  )
}
