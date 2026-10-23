import { createPicture, FillType, Group, PaintStyle, Picture, Skia, TileMode, vec } from '@shopify/react-native-skia'
import React, { useEffect, useMemo, useRef } from 'react'
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type WithSpringConfig,
} from 'react-native-reanimated'
import { BODY_BOTTOM, ix, iy, K, shacklePose } from '../geometry'
import { type LockArtProps, useBaseTransform, useLockMotion } from '../motion'
import { BASE, LockCanvas } from '../parts'

const SPRING: WithSpringConfig = { damping: 22, stiffness: 420, mass: 1 }
const TAU = Math.PI * 2
// the camera looks down on it a little, so the tops of the blocks show
const PITCH = 0.42
const FOCAL = 320
// a point light up and to the left, in front, in view space (relative to the
// lock's centre): being close, it falls off across each face, which is what
// gives every face its gradient
const LIGHT_POS = [-70, -110, -150]
const LIGHT_REACH = Math.hypot(LIGHT_POS[0], LIGHT_POS[1], LIGHT_POS[2])
// half depths in canvas units: a chunky slab of a body, a square-section shackle
const BODY_Z = 1.75 * K
// how much it shrinks to leave room to hop and spin without clipping, and how
// far down that sits it
const FIT = 0.9
const FIT_DROP = 9.5

// Lambert from the point light, stronger nearer it.
function lightAt(n: number[], x: number, y: number, z: number) {
  'worklet'
  const dx = LIGHT_POS[0] - x
  const dy = LIGHT_POS[1] - y
  const dz = LIGHT_POS[2] - z
  const dist = Math.hypot(dx, dy, dz)
  const falloff = Math.min(1.6, Math.max(0.6, (LIGHT_REACH / dist) ** 2))
  return ((n[0] * dx + n[1] * dy + n[2] * dz) / dist) * falloff
}

// How lit the middle of the front face is, facing the camera: anything this
// lit is exactly the icon colour, brighter lightens and dimmer darkens, so it
// shades right whether the icon is dark on light or light on dark.
const FRONT_LIGHT = lightAt(
  [0, Math.sin(PITCH), -Math.cos(PITCH)],
  0,
  (iy(11) - 50) * Math.cos(PITCH) + BODY_Z * Math.sin(PITCH),
  (iy(11) - 50) * Math.sin(PITCH) - BODY_Z * Math.cos(PITCH),
)
const SHACKLE_Z = K
const ARC_CUBES = 9
const FLOOR = BODY_BOTTOM + 5

type Point = [number, number, number]
// a flat polygon (any further loops are holes in it) and its outward normal
interface Face {
  loops: Point[][]
  normal: Point
}

function quad(a: Point, b: Point, c: Point, d: Point, normal: Point, hole?: Point[]): Face {
  'worklet'
  return { loops: hole ? [[a, b, c, d], hole] : [[a, b, c, d]], normal }
}

// all six faces of an axis-aligned block
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Face[] {
  'worklet'
  return [
    quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]),
    quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1]),
    quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0]),
    quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]),
    quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0]),
    quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]),
  ]
}

// The icon in 3D, in canvas units: the body is one slab with the keyhole cut
// right through it (front and back faces with a hole, plus the hole's four
// walls), the shackle is two legs and a stepped arc of cubes, voxel style.
function lockFaces(open: number): Face[] {
  'worklet'
  const faces: Face[] = []
  const X0 = ix(2)
  const X1 = ix(14)
  const Y0 = iy(6)
  const Y1 = iy(16)
  const Z = BODY_Z
  // the keyhole stands up when locked and lies flat when open
  const s = open < 0.5 ? [ix(7), ix(9), iy(9), iy(13)] : [ix(6), ix(10), iy(10), iy(12)]
  const [a, b, c, d] = s
  const hole = (z: number): Point[] => [
    [a, c, z],
    [b, c, z],
    [b, d, z],
    [a, d, z],
  ]
  faces.push(quad([X0, Y0, -Z], [X1, Y0, -Z], [X1, Y1, -Z], [X0, Y1, -Z], [0, 0, -1], hole(-Z)))
  faces.push(quad([X1, Y0, Z], [X0, Y0, Z], [X0, Y1, Z], [X1, Y1, Z], [0, 0, 1], hole(Z)))
  faces.push(quad([X0, Y0, Z], [X1, Y0, Z], [X1, Y0, -Z], [X0, Y0, -Z], [0, -1, 0]))
  faces.push(quad([X0, Y1, -Z], [X1, Y1, -Z], [X1, Y1, Z], [X0, Y1, Z], [0, 1, 0]))
  faces.push(quad([X0, Y0, Z], [X0, Y0, -Z], [X0, Y1, -Z], [X0, Y1, Z], [-1, 0, 0]))
  faces.push(quad([X1, Y0, -Z], [X1, Y0, Z], [X1, Y1, Z], [X1, Y1, -Z], [1, 0, 0]))
  // the keyhole's walls face into the hole
  faces.push(quad([a, c, -Z], [a, c, Z], [a, d, Z], [a, d, -Z], [1, 0, 0]))
  faces.push(quad([b, c, Z], [b, c, -Z], [b, d, -Z], [b, d, Z], [-1, 0, 0]))
  faces.push(quad([a, c, Z], [b, c, Z], [b, c, -Z], [a, c, -Z], [0, 1, 0]))
  faces.push(quad([a, d, -Z], [b, d, -Z], [b, d, Z], [a, d, Z], [0, -1, 0]))

  const add = (x0: number, y0: number, x1: number, y1: number) => {
    if (x1 - x0 > 0.01 && y1 - y0 > 0.01) {
      faces.push(...box(ix(x0), iy(y0), -SHACKLE_Z, ix(x1), iy(y1), SHACKLE_Z))
    }
  }
  const p = shacklePose(open)
  add(p.left - 1, p.cy, p.left + 1, 6)
  const right = p.left + p.r * 2
  add(right - 1, p.cy, right + 1, Math.min(6, p.rightBottom))
  for (let i = 0; i < ARC_CUBES; i++) {
    const angle = Math.PI + (Math.PI * i) / (ARC_CUBES - 1)
    const cx = p.left + p.r + p.r * Math.cos(angle)
    const cy = p.cy + p.r * Math.sin(angle)
    add(cx - 1, cy - 1, cx + 1, cy + 1)
  }
  return faces
}

interface View {
  yaw: number
  floatY: number
  squash: number
  ink: number[]
  bg: number[]
}

// A tiny renderer: turn, tip and project every face, drop the ones facing
// away, light each corner and paint the faces back to front, each as a
// gradient from its most lit corner to its least.
function drawLock(open: number, v: View) {
  'worklet'
  const cosY = Math.cos(v.yaw)
  const sinY = Math.sin(v.yaw)
  const cosP = Math.cos(PITCH)
  const sinP = Math.sin(PITCH)
  const turn = (x: number, y: number, z: number): Point => {
    const x1 = x * cosY + z * sinY
    const z1 = -x * sinY + z * cosY
    return [x1, y * cosP - z1 * sinP, y * sinP + z1 * cosP]
  }
  // light relative to the front: highlights up to 32% towards white, shadows
  // a deep 78% towards black
  const shade = (light: number) => {
    const d = light - FRONT_LIGHT
    const to = d > 0 ? 1 : 0
    const k = d > 0 ? Math.min(0.32, d * 1.3) : Math.min(0.78, -d * 1.5)
    return Float32Array.of(
      v.ink[0] + (to - v.ink[0]) * k,
      v.ink[1] + (to - v.ink[1]) * k,
      v.ink[2] + (to - v.ink[2]) * k,
      1,
    )
  }
  const shadow = Float32Array.of(
    v.bg[0] + (v.ink[0] - v.bg[0]) * 0.16,
    v.bg[1] + (v.ink[1] - v.bg[1]) * 0.16,
    v.bg[2] + (v.ink[2] - v.bg[2]) * 0.16,
    1,
  )

  const drawn: {
    depth: number
    loops: number[][]
    // the gradient: from the most lit corner to the least, on screen
    from: number[]
    to: number[]
    bright: number
    dim: number
  }[] = []
  for (const face of lockFaces(open)) {
    const n = turn(face.normal[0], face.normal[1], face.normal[2])
    if (n[2] >= -0.001) continue
    let depth = 0
    let bright = -Infinity
    let dim = Infinity
    let from = [0, 0]
    let to = [0, 0]
    const loops = face.loops.map((loop, li) =>
      loop.flatMap(([x0, y0, z0]) => {
        // squash towards the floor, spreading a little
        const y = BODY_BOTTOM - (BODY_BOTTOM - y0) * (1 - v.squash)
        const x = 50 + (x0 - 50) * (1 + v.squash * 0.6)
        const [px, py, pz] = turn(x - 50, y - 50, z0)
        const s = FOCAL / (FOCAL + pz)
        const screen = [50 + px * s, 50 + py * s + v.floatY]
        if (li === 0) {
          depth += pz
          const light = lightAt(n, px, py, pz)
          if (light > bright) {
            bright = light
            from = screen
          }
          if (light < dim) {
            dim = light
            to = screen
          }
        }
        return screen
      }),
    )
    // a gradient needs two distinct points
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.5) to = [from[0] + 1, from[1]]
    drawn.push({ depth, loops, from, to, bright, dim })
  }
  drawn.sort((p, q) => q.depth - p.depth)

  return createPicture((canvas) => {
    const paint = Skia.Paint()
    paint.setAntiAlias(true)
    // the shadow on the floor shrinks as the lock rises
    const height = Math.max(0, -v.floatY)
    const w = 70 * (1 - height * 0.012)
    paint.setColor(shadow)
    canvas.drawOval(Skia.XYWHRect(50 - w / 2, FLOOR - 3, w, 6), paint)

    const edge = Skia.Paint()
    edge.setAntiAlias(true)
    // stroked too: closes the hairline seams between faces
    edge.setStyle(PaintStyle.Stroke)
    edge.setStrokeWidth(0.7)
    for (const f of drawn) {
      const path = Skia.Path.Make()
      for (const loop of f.loops) {
        path.moveTo(loop[0], loop[1])
        for (let i = 2; i < loop.length; i += 2) path.lineTo(loop[i], loop[i + 1])
        path.close()
      }
      path.setFillType(FillType.EvenOdd)
      const shader = Skia.Shader.MakeLinearGradient(
        vec(f.from[0], f.from[1]),
        vec(f.to[0], f.to[1]),
        [shade(f.bright), shade(f.dim)],
        null,
        TileMode.Clamp,
      )
      paint.setShader(shader)
      edge.setShader(shader)
      canvas.drawPath(path, paint)
      canvas.drawPath(path, edge)
    }
  })
}

// The icon as a chunky, flat-shaded 3D toy that floats, bobbing and turning
// gently from side to side. A tap hops it up spinning on the spot; when the
// firmware answers the shackle finishes moving and it spins down to land with
// a squash.
export function Spin3D({ size, state, phase, press, colors }: LockArtProps) {
  const spin = useSharedValue(0)
  const hop = useSharedValue(0)
  const squash = useSharedValue(0)
  const spinning = useRef(false)
  const m = useLockMotion(state, phase, {
    spring: SPRING,
    onChange: () => {
      spinning.current = false
      // finish this turn and one more, slowing into the landing
      spin.value = withTiming((Math.ceil(spin.value / TAU) + 1) * TAU, {
        duration: 650,
        easing: Easing.out(Easing.cubic),
      })
      hop.value = withSequence(
        withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 220, easing: Easing.in(Easing.quad) }, (done) => {
          'worklet'
          if (done) squash.value = withSpring(0, { damping: 10, stiffness: 500, mass: 1, velocity: 6 })
        }),
      )
    },
  })

  useEffect(() => {
    if (phase === 'pending' && state !== 'unknown') {
      spinning.current = true
      const from = spin.value
      spin.value = withRepeat(withTiming(from + TAU, { duration: 600, easing: Easing.linear }), -1)
    } else if (spinning.current) {
      // no change came: settle back facing front
      spinning.current = false
      spin.value = withSpring(Math.round(spin.value / TAU) * TAU, { damping: 18, stiffness: 200, mass: 1 })
    }
    // state is read, not watched: a state change is onChange's job
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const ink = useMemo(() => Array.from(Skia.Color(colors.ink)), [colors.ink])
  const bg = useMemo(() => Array.from(Skia.Color(colors.bg)), [colors.bg])
  const base = useBaseTransform(m, press)

  const picture = useDerivedValue(() => {
    const t = m.clock.value
    return drawLock(m.open.value, {
      yaw: spin.value + Math.sin(t / 1300) * 0.5,
      floatY: -(4 + Math.sin(t / 650) * 2.2) - m.pending.value * 5 - hop.value * 9,
      squash: squash.value * 0.12,
      ink,
      bg,
    })
  })

  return (
    <LockCanvas size={size}>
      <Group origin={BASE} transform={base}>
        <Group origin={vec(50, 50)} transform={[{ translateY: FIT_DROP }, { scale: FIT }]}>
          <Picture picture={picture} />
        </Group>
      </Group>
    </LockCanvas>
  )
}
