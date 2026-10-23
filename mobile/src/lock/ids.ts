// Kept free of imports so lib/config can use it without pulling in Skia (or
// importing the registry, which imports config).
export type LockAnimationId =
  | 'jello'
  | 'liquid'
  | 'gummy'
  | 'taffy'
  | 'goo'
  | 'bubble'
  | 'sprinkles'
  | 'splash'

export const DEFAULT_LOCK_ANIMATION: LockAnimationId = 'jello'
