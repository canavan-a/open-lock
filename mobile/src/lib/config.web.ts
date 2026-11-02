import { DEFAULT_LOCK_ANIMATION, isLockAnimationId, type LockAnimationId } from '../lock/ids'
import type { ThemeName } from '../theme'

// The web build's config (config.ts is the app's). There is nothing to
// connect to by hand: the web-controller origin is fixed at build time
// (__API_ORIGIN__, see vite.config.ts), or is the page's own origin. No
// Cloudflare Access service token either: a browser behind Access signs in
// with Access's own login and its cookie rides along on every request.
export interface LockConfig {
  themeName: ThemeName
  lockAnimation: LockAnimationId
}

export const DEFAULT_CONFIG: LockConfig = {
  themeName: 'dark',
  lockAnimation: DEFAULT_LOCK_ANIMATION,
}

const KEY = 'superlock.config'

let cache: LockConfig = DEFAULT_CONFIG

const listeners = new Set<() => void>()

export function subscribeConfig(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function notify(): void {
  listeners.forEach((l) => l())
}

export function getConfig(): LockConfig {
  return cache
}

export function isConfigured(_c: LockConfig): boolean {
  return true
}

export async function loadConfig(): Promise<LockConfig> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<LockConfig>
      cache = { themeName: saved.themeName ?? cache.themeName, lockAnimation: saved.lockAnimation ?? cache.lockAnimation }
      if (!isLockAnimationId(cache.lockAnimation)) cache.lockAnimation = DEFAULT_LOCK_ANIMATION
      notify()
    }
  } catch {
    // Blocked or corrupt storage — fall back to defaults.
  }
  return cache
}

export async function saveConfig(next: LockConfig): Promise<void> {
  cache = next
  notify()
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode etc. — the choice still holds until the page closes.
  }
}

export function baseUrl(_c?: LockConfig): string {
  return __API_ORIGIN__ || window.location.origin
}

export function accessHeaders(_c?: LockConfig): Record<string, string> {
  return {}
}

// Super Matrix's edge answers an API call without a session with a 401 and
// X-Supermatrix-Auth "required" or "expired". The service worker serves the
// app from cache, so the edge never gets to redirect the page load itself:
// go to its sign-in page here, and come back to this page after. Only on the
// app's own origin, where the session cookie lives. Returns whether it went.
export function startSignIn(auth: string): boolean {
  if (auth !== 'required' && auth !== 'expired') return false
  if (__API_ORIGIN__ && __API_ORIGIN__ !== window.location.origin) return false
  const next = window.location.pathname + window.location.search
  window.location.assign(
    `/_supermatrix/login?next=${encodeURIComponent(next)}${auth === 'expired' ? '&expired=1' : ''}`,
  )
  return true
}
