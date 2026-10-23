// Kept free of imports so lib/config can use it without pulling in Skia (or
// importing the registry, which imports config).
export const LOCK_ANIMATION_IDS = ['classic', 'jello', 'gummy', 'liquid'] as const

export type LockAnimationId = (typeof LOCK_ANIMATION_IDS)[number]

export const DEFAULT_LOCK_ANIMATION: LockAnimationId = 'classic'

// Saved configs can name animations that have since been removed.
export function isLockAnimationId(v: unknown): v is LockAnimationId {
  return (LOCK_ANIMATION_IDS as readonly unknown[]).includes(v)
}
