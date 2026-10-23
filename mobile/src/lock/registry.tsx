import React, { useSyncExternalStore } from 'react'
import { getConfig, subscribeConfig } from '../lib/config'
import { Classic } from './animations/Classic'
import { Gummy } from './animations/Gummy'
import { Jello } from './animations/Jello'
import { Liquid } from './animations/Liquid'
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
  { id: 'classic', label: 'Classic', blurb: 'The icon: shackle swings, keyhole turns', Component: Classic },
  { id: 'jello', label: 'Jell-O', blurb: 'Sways and wobbles from its base', Component: Jello },
  { id: 'gummy', label: 'Gummy', blurb: 'Hops and lands with a squish', Component: Gummy },
  { id: 'liquid', label: 'Liquid', blurb: 'Drains to unlock, fills to lock', Component: Liquid },
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
