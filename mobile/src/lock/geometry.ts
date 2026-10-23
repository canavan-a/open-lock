import { Skia, type SkPath } from '@shopify/react-native-skia'

// The padlock from the app icon (web-controller/ui/public/icon.svg and the
// old OPEN_PATH / CLOSED_PATH glyphs), drawn in a 100×100 box that every
// animation scales to its canvas. The icon's 16-unit grid maps onto that box
// at K per unit; the body stays put and the shackle and keyhole move between
// the icon's closed and open poses.

export const BOX = 100

export const K = 5.5
// icon x=8 (the closed body's centre) lands on x=50; icon y=0 on y=6
// (worklets: shacklePath calls them on the UI thread)
export const ix = (u: number) => {
  'worklet'
  return 50 + (u - 8) * K
}
export const iy = (u: number) => {
  'worklet'
  return 6 + u * K
}

// square-cornered, icon x 2..14, y 6..16
export const BODY = { x: ix(2), y: iy(6), w: 12 * K, h: 10 * K }
export const BODY_BOTTOM = BODY.y + BODY.h
export const BODY_CENTER_X = BODY.x + BODY.w / 2

export const SHACKLE_WIDTH = 2 * K

// Shackle centre lines, in icon units. Closed: legs at x 5 and 11 on an arc
// of radius 3 centred at y 4, both seated in the body. Open (OPEN_PATH, with
// its body shifted back under ours): the left leg moves to x 10 and stays
// seated, the arc tightens to radius 2.5, and the right leg is a stub at y 4
// hanging off the body's right edge.
const CLOSED = { left: 5, r: 3, cy: 4 }
const OPEN = { left: 10, r: 2.5, cy: 3.5 }
// legs run a unit into the body so the joint never shows
const SEATED = 7
const STUB = 4
// how high the shackle lifts mid-swing so the right leg clears the body
const LIFT = 1.6

const clamp = (v: number, lo: number, hi: number) => {
  'worklet'
  return Math.min(hi, Math.max(lo, v))
}
const lerp = (a: number, b: number, t: number) => {
  'worklet'
  return a + (b - a) * t
}
const smooth = (t: number) => {
  'worklet'
  return t * t * (3 - 2 * t)
}

function swingOf(t: number) {
  'worklet'
  // pull the right leg out first, then swing across
  return t > 1 ? 1 + (t - 1) * 0.6 : smooth(clamp((t - 0.25) / 0.75, 0, 1))
}

function liftOf(t: number) {
  'worklet'
  return Math.sin(Math.PI * clamp(t, 0, 1)) * LIFT + Math.min(0, t) * 2
}

// The shackle's centre line at a pose, in icon units: left leg x, arc radius
// and centre y, where the right leg ends, and how far it's lifted.
export function shacklePose(open: number) {
  'worklet'
  const t = clamp(open, -0.2, 1.2)
  const swing = swingOf(t)
  const lift = liftOf(t)
  return {
    left: lerp(CLOSED.left, OPEN.left, swing),
    r: lerp(CLOSED.r, OPEN.r, swing),
    cy: lerp(CLOSED.cy, OPEN.cy, swing) - lift,
    rightBottom: lerp(SEATED, STUB, smooth(clamp(t * 2.5, 0, 1))) - lift,
    lift,
  }
}

// open: 0 = closed pose, 1 = open pose. Sprung values past either end overshoot
// a little (further right when opening, pushed down into the body when closing).
export function shacklePath(open: number): SkPath {
  'worklet'
  const { left, r, cy, rightBottom } = shacklePose(open)
  const p = Skia.Path.Make()
  // the left leg never leaves the body, so it just gets longer as the arc lifts
  p.moveTo(ix(left), iy(SEATED))
  p.lineTo(ix(left), iy(cy))
  p.arcToOval(Skia.XYWHRect(ix(left), iy(cy - r), r * 2 * K, r * 2 * K), 180, 180, false)
  p.lineTo(ix(left + r * 2), iy(Math.max(rightBottom, cy)))
  return p
}

export function bodyPath(): SkPath {
  'worklet'
  const p = Skia.Path.Make()
  p.addRect(Skia.XYWHRect(BODY.x, BODY.y, BODY.w, BODY.h))
  return p
}

// The keyhole is the icon's slot: 2×4 upright when closed, turned a quarter
// to lie flat when open (both centred on icon (8, 11)).
export const KEYHOLE = { cx: ix(8), cy: iy(11), w: 2 * K, h: 4 * K }

export function keyholeTransform(open: number) {
  'worklet'
  return [{ rotate: (clamp(open, 0, 1) * Math.PI) / 2 }]
}

// Small deterministic pseudo-random in [0, 1), so particle layouts are stable
// between renders and usable inside worklets.
export function rand(i: number): number {
  'worklet'
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
