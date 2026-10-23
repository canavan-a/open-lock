import { Skia, type SkPath } from '@shopify/react-native-skia'

// The padlock, drawn in a 100×100 box that every animation scales to its
// canvas. Split into body, shackle and keyhole so each part can move on its own.

export const BOX = 100

export const BODY = { x: 18, y: 44, w: 64, h: 46, r: 13 }
export const BODY_BOTTOM = BODY.y + BODY.h
export const BODY_CENTER_X = BODY.x + BODY.w / 2

export const SHACKLE_WIDTH = 10
const LEFT_X = 31
const RIGHT_X = 69
const RADIUS = (RIGHT_X - LEFT_X) / 2
// y of the arc's centre line where it meets the legs, when closed
const ARC_Y = 30
// The left leg is longer so it stays seated in the body when open, like a real
// padlock; the right leg pops clear.
const LEFT_BOTTOM = 64
const RIGHT_BOTTOM = 52
// how far the shackle rises when fully open
export const OPEN_RISE = 15

export const KEYHOLE = { cx: 50, cy: 63, r: 6, slotW: 5, slotH: 13 }

// rise lifts the whole shackle; stretch lifts only the arc, so the legs get
// longer (taffy) or shorter (negative, squashed).
export function shacklePath(rise: number, stretch = 0): SkPath {
  'worklet'
  const top = ARC_Y - rise - stretch
  const p = Skia.Path.Make()
  p.moveTo(LEFT_X, LEFT_BOTTOM - rise)
  p.lineTo(LEFT_X, top)
  p.arcToOval(Skia.XYWHRect(LEFT_X, top - RADIUS, RADIUS * 2, RADIUS * 2), 180, 180, false)
  p.lineTo(RIGHT_X, RIGHT_BOTTOM - rise)
  return p
}

export function bodyPath(): SkPath {
  'worklet'
  const p = Skia.Path.Make()
  p.addRRect(Skia.RRectXY(Skia.XYWHRect(BODY.x, BODY.y, BODY.w, BODY.h), BODY.r, BODY.r))
  return p
}

export function keyholePath(): SkPath {
  'worklet'
  const k = KEYHOLE
  const p = Skia.Path.Make()
  p.addCircle(k.cx, k.cy, k.r)
  p.addRRect(
    Skia.RRectXY(Skia.XYWHRect(k.cx - k.slotW / 2, k.cy, k.slotW, k.slotH), k.slotW / 2, k.slotW / 2),
  )
  return p
}

// Small deterministic pseudo-random in [0, 1), so particle layouts are stable
// between renders and usable inside worklets.
export function rand(i: number): number {
  'worklet'
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
