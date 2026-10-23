import AsyncStorage from '@react-native-async-storage/async-storage'
import { DEFAULT_LOCK_ANIMATION, isLockAnimationId, type LockAnimationId } from '../lock/ids'
import type { ThemeName } from '../theme'

// The app has no window.location to inherit an origin from, so the connection
// target is stored explicitly. The usual deployment is a cloudflared tunnel
// hostname pointing at the web-controller, behind Cloudflare Access; the lock
// API (/state, /battery, /open, /close) sits at the root of that host.
export interface LockConfig {
  // Tunnel hostname, e.g. 'lock.example.com' (served over https). A full
  // origin such as 'http://192.168.1.20:8080' is also accepted for LAN use.
  host: string
  // Cloudflare Access service token. Sent as CF-Access-Client-Id /
  // CF-Access-Client-Secret on every request.
  cfAccessClientId: string
  cfAccessClientSecret: string
  // Whether to check GitHub Releases for a newer APK when the app comes to the
  // foreground. The manual "Check for updates" in Settings always works.
  autoUpdateCheck: boolean
  // Color palette (see src/theme.ts). Saved the moment it's picked.
  themeName: ThemeName
  // Which lock animation the lock screen plays (see src/lock/registry.tsx).
  // Saved the moment it's picked, like the theme.
  lockAnimation: LockAnimationId
}

export const DEFAULT_CONFIG: LockConfig = {
  host: '',
  cfAccessClientId: '',
  cfAccessClientSecret: '',
  autoUpdateCheck: true,
  themeName: 'dark',
  lockAnimation: DEFAULT_LOCK_ANIMATION,
}

const KEY = 'superlock.config'

// A synchronous cache so non-React callers (the API client) can read config
// without awaiting. Kept fresh by load/save.
let cache: LockConfig = DEFAULT_CONFIG

// Observers notified whenever the config cache changes (load or save). Lets
// RootNavigator re-evaluate isConfigured() after first-run setup.
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

export function isConfigured(c: LockConfig): boolean {
  return c.host.trim().length > 0
}

export async function loadConfig(): Promise<LockConfig> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (raw) {
      cache = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<LockConfig>) }
      if (!isLockAnimationId(cache.lockAnimation)) cache.lockAnimation = DEFAULT_LOCK_ANIMATION
      notify()
    }
  } catch {
    // Corrupt or unavailable storage — fall back to defaults.
  }
  return cache
}

export async function saveConfig(next: LockConfig): Promise<void> {
  cache = next
  notify()
  await AsyncStorage.setItem(KEY, JSON.stringify(next))
}

// A bare hostname means the tunnel (https on 443); anything with a scheme is
// used as given, minus a trailing slash.
export function baseUrl(c: LockConfig): string {
  const h = c.host.trim()
  if (/^https?:\/\//i.test(h)) return h.replace(/\/+$/, '')
  return `https://${h}`
}

// Headers for Cloudflare Access, or {} when no token is configured.
export function accessHeaders(c: LockConfig): Record<string, string> {
  if (!c.cfAccessClientId || !c.cfAccessClientSecret) return {}
  return {
    'CF-Access-Client-Id': c.cfAccessClientId,
    'CF-Access-Client-Secret': c.cfAccessClientSecret,
  }
}
