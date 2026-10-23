import { Group, Path, Skia } from '@shopify/react-native-skia'
import React, { useMemo } from 'react'
import { useDerivedValue, useSharedValue, type WithSpringConfig } from 'react-native-reanimated'
import { ix, iy, K, rand, shacklePath } from '../geometry'
import { kick, type LockArtProps, useBaseTransform, useLockMotion, useSettled } from '../motion'
import { BASE, Body, Keyhole, LockCanvas, Shackle, Solid } from '../parts'

const SPRING: WithSpringConfig = { damping: 26, stiffness: 500, mass: 1 }

// The icon rasterised on a grid of GRID icon units. Cells solid in both poses
// stay put; the rest fly from where they are in one pose to where they're
// needed in the other.
const GRID = 1 / 3
const CELLS = Math.round(16 / GRID)
// cells overlap a hair so the grid never shows seams
const CELL = GRID * K + 0.3

const inBody = (x: number, y: number) => x >= 2 && x <= 14 && y >= 6 && y <= 16

// The two icons (CLOSED_PATH, and OPEN_PATH moved a unit right so the bodies
// line up), as point-in-shape tests in icon units.
function closedSolid(x: number, y: number) {
  if (inBody(x, y)) return !(x >= 7 && x <= 9 && y >= 9 && y <= 13)
  if (y < 4) {
    const d = Math.hypot(x - 8, y - 4)
    return d >= 2 && d <= 4
  }
  return y < 6 && ((x >= 4 && x <= 6) || (x >= 10 && x <= 12))
}

function openSolid(x: number, y: number) {
  if (inBody(x, y)) return !(x >= 6 && x <= 10 && y >= 10 && y <= 12)
  if (y < 3.5) {
    const d = Math.hypot(x - 12.5, y - 3.5)
    return d >= 1.5 && d <= 3.5
  }
  return y < 6 && ((x >= 9 && x <= 11) || (x >= 14 && x <= 16 && y <= 4))
}

interface Movers {
  sx: number[]
  sy: number[]
  dx: number[]
  dy: number[]
  delay: number[]
  angle: number[]
  scatter: number[]
}

// Pairs the cells only the closed icon has with the cells only the open icon
// has, left to right within each region (shackle above the body, keyhole
// inside it) so pixels travel short, tidy paths.
function buildPixels() {
  const still = Skia.Path.Make()
  const only: Record<'closed' | 'open', Record<'shackle' | 'body', [number, number][]>> = {
    closed: { shackle: [], body: [] },
    open: { shackle: [], body: [] },
  }
  for (let i = 0; i < CELLS; i++) {
    for (let j = 0; j < CELLS; j++) {
      const x = (i + 0.5) * GRID
      const y = (j + 0.5) * GRID
      const c = closedSolid(x, y)
      const o = openSolid(x, y)
      const region = y < 6 ? 'shackle' : 'body'
      if (c && o) still.addRect(Skia.XYWHRect(ix(x - GRID / 2), iy(y - GRID / 2), CELL, CELL))
      else if (c) only.closed[region].push([x, y])
      else if (o) only.open[region].push([x, y])
    }
  }
  const m: Movers = { sx: [], sy: [], dx: [], dy: [], delay: [], angle: [], scatter: [] }
  const byX = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1]
  for (const region of ['shackle', 'body'] as const) {
    const from = only.closed[region].sort(byX)
    const to = only.open[region].sort(byX)
    const n = Math.max(from.length, to.length)
    for (let k = 0; k < n; k++) {
      const a = from[Math.floor((k * from.length) / n)]
      const b = to[Math.floor((k * to.length) / n)]
      const i = m.sx.length
      m.sx.push(a[0])
      m.sy.push(a[1])
      m.dx.push(b[0])
      m.dy.push(b[1])
      m.delay.push(rand(i) * 0.4)
      m.angle.push(rand(i + 1000) * Math.PI * 2)
      m.scatter.push(1 + rand(i + 2000) * 1.6)
    }
  }
  return { still, movers: m }
}

// The icon shatters into its own pixels, which swarm across to the other pose
// and snap back into the icon. A tap leaves it hovering half-scattered and
// shimmering until the firmware answers. At rest it's the plain vector icon.
export function Pixels({ size, state, phase, press, colors }: LockArtProps) {
  const thunk = useSharedValue(0)
  const m = useLockMotion(state, phase, {
    spring: SPRING,
    onChange: () => kick(thunk, 6, { damping: 18, stiffness: 700, mass: 1 }),
  })
  const base = useBaseTransform(m, press)
  const { still, movers } = useMemo(buildPixels, [])

  const transform = useDerivedValue(() => [
    ...base.value,
    { scaleX: 1 + thunk.value * 0.012 },
    { scaleY: 1 - thunk.value * 0.018 },
  ])

  // the vector icon while settled, the pixels whenever anything is moving
  const settled = useSettled(m)
  const pixelsOpacity = useDerivedValue(() => 1 - settled.value)
  const restShackle = useDerivedValue(() => shacklePath(Math.round(m.open.value)))
  const restOpen = useDerivedValue(() => Math.round(m.open.value))

  const flying = useDerivedValue(() => {
    const t = m.open.value
    const clock = m.clock.value
    const wait = m.pending.value
    const p = Skia.Path.Make()
    for (let k = 0; k < movers.sx.length; k++) {
      const raw = Math.min(1, Math.max(0, (t - movers.delay[k]) / 0.6))
      const e = raw * raw * (3 - 2 * raw)
      const out = Math.sin(Math.PI * e) * movers.scatter[k]
      const jitter = Math.sin(clock * 0.012 + k * 1.7) * 0.25 * wait
      const x = movers.sx[k] + (movers.dx[k] - movers.sx[k]) * e + Math.cos(movers.angle[k]) * out + jitter
      const y = movers.sy[k] + (movers.dy[k] - movers.sy[k]) * e + Math.sin(movers.angle[k]) * out - jitter
      p.addRect(Skia.XYWHRect(ix(x - GRID / 2), iy(y - GRID / 2), CELL, CELL))
    }
    return p
  })

  return (
    <LockCanvas size={size}>
      <Group origin={BASE} transform={transform}>
        <Solid opacity={settled}>
          <Shackle path={restShackle} color={colors.ink} />
          <Body color={colors.ink} />
          <Keyhole open={restOpen} />
        </Solid>
        <Group opacity={pixelsOpacity}>
          <Path path={still} color={colors.ink} />
          <Path path={flying} color={colors.ink} />
        </Group>
      </Group>
    </LockCanvas>
  )
}
