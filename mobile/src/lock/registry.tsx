import React, { useSyncExternalStore } from 'react'
import { getConfig, subscribeConfig } from '../lib/config'
import { BubblePop } from './animations/BubblePop'
import { Goo } from './animations/Goo'
import { Gummy } from './animations/Gummy'
import { Jello } from './animations/Jello'
import { Liquid } from './animations/Liquid'
import { Splash } from './animations/Splash'
import { Sprinkles } from './animations/Sprinkles'
import { Taffy } from './animations/Taffy'
import type { LockAnimationId } from './ids'
import type { LockArtProps } from './motion'

export type { LockAnimationId } from './ids'
export { DEFAULT_LOCK_ANIMATION } from './ids'

export const LOCK_ANIMATIONS: {
  id: LockAnimationId
  label: string
  blurb: string
  Component: React.ComponentType<LockArtProps>
}[] = [
  { id: 'jello', label: 'Jell-O', blurb: 'Sways and wobbles from its base', Component: Jello },
  { id: 'liquid', label: 'Liquid', blurb: 'Drains to unlock, fills to lock', Component: Liquid },
  { id: 'gummy', label: 'Gummy', blurb: 'Hops and lands with a squish', Component: Gummy },
  { id: 'taffy', label: 'Taffy', blurb: 'The shackle stretches and snaps', Component: Taffy },
  { id: 'goo', label: 'Goo', blurb: 'Drips, splats and slurps back', Component: Goo },
  { id: 'bubble', label: 'Bubble Pop', blurb: 'Swells, pops, boings back', Component: BubblePop },
  { id: 'sprinkles', label: 'Sprinkles', blurb: 'Wiggles, then throws candy', Component: Sprinkles },
  { id: 'splash', label: 'Splash', blurb: 'Bobs, dunks and ripples', Component: Splash },
]

export function LockArt({ animation, ...props }: LockArtProps & { animation: LockAnimationId }) {
  const entry = LOCK_ANIMATIONS.find((a) => a.id === animation) ?? LOCK_ANIMATIONS[0]
  // keyed so switching animations starts the new one from a clean slate
  return <entry.Component key={entry.id} {...props} />
}

// Like useTheme: the choice lives in LockConfig and is saved the moment it's picked.
export function useLockAnimation(): LockAnimationId {
  return useSyncExternalStore(subscribeConfig, () => getConfig().lockAnimation)
}
