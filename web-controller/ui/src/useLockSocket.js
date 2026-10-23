import { useEffect, useRef, useState } from "react";

const MIN_RETRY_MS = 500;
const MAX_RETRY_MS = 10000;
// The server sends a snapshot at least every 25s; after this much silence the
// socket is assumed dead (e.g. the phone slept or switched networks) and is
// replaced.
const STALE_MS = 60000;

// Live lock snapshots ({state, battery}) pushed over /ws. Reconnects with
// exponential backoff, and immediately when the tab becomes visible or the
// browser comes back online. Returns whether the socket is currently open so
// the caller can fall back to polling while it isn't.
export const useLockSocket = (onSnapshot) => {
  const [connected, setConnected] = useState(false);
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;

  useEffect(() => {
    let ws = null;
    let retryTimer = null;
    let staleTimer = null;
    let delay = MIN_RETRY_MS;
    let disposed = false;

    const markAlive = () => {
      clearTimeout(staleTimer);
      staleTimer = setTimeout(() => ws && ws.close(), STALE_MS);
    };

    const connect = () => {
      clearTimeout(retryTimer);
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const sock = new WebSocket(`${proto}//${window.location.host}/ws`);
      ws = sock;
      sock.onopen = () => {
        delay = MIN_RETRY_MS;
        setConnected(true);
        markAlive();
      };
      sock.onmessage = (e) => {
        markAlive();
        try {
          onSnapshotRef.current(JSON.parse(e.data));
        } catch {
          // ignore malformed frames
        }
      };
      // onerror is always followed by onclose, so retries live here only.
      sock.onclose = () => {
        if (ws !== sock) return;
        ws = null;
        clearTimeout(staleTimer);
        setConnected(false);
        if (disposed) return;
        retryTimer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, MAX_RETRY_MS);
      };
    };

    const reconnectNow = () => {
      if (disposed || document.visibilityState !== "visible") return;
      if (ws && ws.readyState <= WebSocket.OPEN) return;
      delay = MIN_RETRY_MS;
      connect();
    };

    connect();
    document.addEventListener("visibilitychange", reconnectNow);
    window.addEventListener("online", reconnectNow);

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearTimeout(staleTimer);
      document.removeEventListener("visibilitychange", reconnectNow);
      window.removeEventListener("online", reconnectNow);
      if (ws) ws.close();
    };
  }, []);

  return connected;
};
