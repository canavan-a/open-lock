import React, { useSyncExternalStore } from 'react'
import { getConfig, subscribeConfig } from '../lib/config'
import { Classic } from './animations/Classic'
import { Flip } from './animations/Flip'
import { Gummy } from './animations/Gummy'
import { KeyTurn } from './animations/KeyTurn'
import { Liquid } from './animations/Liquid'
import { Magnet } from './animations/Magnet'
import { Pixels } from './animations/Pixels'
import { Spin3D } from './animations/Spin3D'
import type { LockAnimationId } from './ids'
import type { LockArtProps } from './motion'

export type { LockAnimationId } from './ids'
export { DEFAULT_LOCK_ANIMATION } from './ids'

// What each one does is described on its component.
export const LOCK_ANIMATIONS: {
  id: LockAnimationId
  label: string
  Component: React.ComponentType<LockArtProps>
}[] = [
  { id: 'classic', label: 'Classic', Component: Classic },
  { id: 'spin3d', label: '3D', Component: Spin3D },
  { id: 'pixels', label: 'Pixels', Component: Pixels },
  { id: 'liquid', label: 'Liquid', Component: Liquid },
  { id: 'key', label: 'Key', Component: KeyTurn },
  { id: 'magnet', label: 'Magnet', Component: Magnet },
  { id: 'flip', label: 'Flip', Component: Flip },
  { id: 'gummy', label: 'Gummy', Component: Gummy },
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
