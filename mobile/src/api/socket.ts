import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { accessHeaders, baseUrl, getConfig } from '../lib/config'
import type { DoorState } from './client'

// What the web-controller pushes on /ws: on connect, on every firmware report
// and as a heartbeat at least every 25s.
export interface LockSnapshot {
  state: DoorState
  battery: number
  // average battery current in mA, positive while charging
  current: number
  charging: boolean
}

// React Native's WebSocket constructor, which also takes headers. Spelled out
// so the web build, typed against the DOM's, compiles this too.
type RNWebSocket = new (
  url: string,
  protocols: null,
  options: { headers: Record<string, string> },
) => WebSocket

const MIN_RETRY_MS = 500
const MAX_RETRY_MS = 10000
// A few missed heartbeats means the socket is dead even if the OS hasn't
// noticed yet (network switch, tunnel restart), so it gets replaced.
const STALE_MS = 60000

// Live lock snapshots over the web-controller's /ws socket, with the
// Cloudflare Access headers on the upgrade request. Open only while the
// screen is focused and the app is in the foreground, like the polling it
// replaces. Reconnects with exponential backoff, and immediately on returning
// to the foreground. Returns whether the socket is open so the caller can
// poll while it isn't.
export function useLockSocket(onSnapshot: (s: LockSnapshot) => void): boolean {
  const [connected, setConnected] = useState(false)
  const onSnapshotRef = useRef(onSnapshot)
  onSnapshotRef.current = onSnapshot

  useFocusEffect(
    useCallback(() => {
      let ws: WebSocket | null = null
      let retryTimer = 0
      let staleTimer = 0
      let delay = MIN_RETRY_MS
      let active = false

      const markAlive = () => {
        clearTimeout(staleTimer)
        staleTimer = setTimeout(() => ws?.close(), STALE_MS)
      }

      const connect = () => {
        clearTimeout(retryTimer)
        const c = getConfig()
        const url = `${baseUrl(c).replace(/^http/i, 'ws')}/ws`
        const headers = accessHeaders(c)
        // Custom headers are an RN extension; a browser's WebSocket takes
        // none (and would send a literal "null" subprotocol).
        const sock = Object.keys(headers).length
          ? new (WebSocket as unknown as RNWebSocket)(url, null, { headers })
          : new WebSocket(url)
        ws = sock
        sock.onopen = () => {
          delay = MIN_RETRY_MS
          setConnected(true)
          markAlive()
        }
        sock.onmessage = (e) => {
          markAlive()
          try {
            onSnapshotRef.current(JSON.parse(String(e.data)) as LockSnapshot)
          } catch {
            // ignore malformed frames
          }
        }
        // onerror is always followed by onclose, so retries live here only.
        sock.onclose = () => {
          if (ws !== sock) return
          ws = null
          clearTimeout(staleTimer)
          setConnected(false)
          if (!active) return
          retryTimer = setTimeout(connect, delay)
          delay = Math.min(delay * 2, MAX_RETRY_MS)
        }
      }

      const start = () => {
        if (active) return
        active = true
        delay = MIN_RETRY_MS
        connect()
      }

      const stop = () => {
        active = false
        clearTimeout(retryTimer)
        clearTimeout(staleTimer)
        const sock = ws
        ws = null
        sock?.close()
        setConnected(false)
      }

      if (AppState.currentState === 'active') start()
      const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()))
      return () => {
        sub.remove()
        stop()
      }
    }, []),
  )

  return connected
}
