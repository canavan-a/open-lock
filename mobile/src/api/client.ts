import { accessHeaders, baseUrl, getConfig, type LockConfig } from '../lib/config'

// The web-controller's HTTP API (see web-controller/readme.md).

export type DoorState = 'open' | 'closed' | 'unknown'

// /battery reports this when the fuel gauge is unavailable.
export const BATTERY_UNAVAILABLE = 999

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const TIMEOUT_MS = 8000

// `c` defaults to the saved config; Settings passes the unsaved form values
// to test a connection before committing to it.
async function request<T>(path: string, init?: RequestInit, c: LockConfig = getConfig()): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${baseUrl(c)}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        ...accessHeaders(c),
        ...(init?.headers ?? {}),
      },
    })
  } catch (e) {
    throw new ApiError(0, ctrl.signal.aborted ? 'timed out' : String(e))
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  let body: any
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    // Cloudflare Access answers a missing or rejected service token with its
    // HTML login page (a 200 after the redirect) or a 403, never JSON.
    throw new ApiError(
      res.status,
      res.status === 403 || /cloudflare/i.test(text)
        ? 'blocked by Cloudflare Access — check the service token'
        : `unexpected response (${res.status})`,
    )
  }
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `${res.status} ${res.statusText}`)
  }
  return body as T
}

export const getState = (c?: LockConfig) =>
  request<{ state: DoorState }>('/state', undefined, c)

export const getBattery = (c?: LockConfig) =>
  request<{ battery: number }>('/battery', undefined, c)

export const openLock = () => request<{ sent: string }>('/open', { method: 'POST' })

export const closeLock = () => request<{ sent: string }>('/close', { method: 'POST' })
