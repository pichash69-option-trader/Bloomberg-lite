import { useEffect, useRef, useState } from 'react'
import { WS_URL, type LiveState } from '../api'

/**
 * Subscribe to the live-math stream for `symbol`. The backend starts/stops the
 * (mock or real) feed per subscriber and pushes the full Cash/Futures/Options
 * payload every ~1.5s. Returns the latest state, or null while connecting.
 */
export function useLive(symbol: string | null): LiveState | null {
  const [live, setLive] = useState<LiveState | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!symbol) {
      setLive(null)
      return
    }
    setLive(null)
    let closed = false
    let retry: ReturnType<typeof setTimeout>

    const connect = () => {
      const ws = new WebSocket(`${WS_URL}/ws/live?symbol=${encodeURIComponent(symbol)}`)
      wsRef.current = ws
      ws.onmessage = (e) => {
        try {
          setLive(JSON.parse(e.data) as LiveState)
        } catch {
          /* ignore malformed frame */
        }
      }
      // Auto-reconnect on drop (backend restart / network blip) until unmount.
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 2000)
      }
      ws.onerror = () => ws.close()
    }
    connect()

    return () => {
      closed = true
      clearTimeout(retry)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [symbol])

  return live
}
