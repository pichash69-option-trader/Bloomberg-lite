import { useEffect, useRef, useState } from 'react'
import { WS_URL, type Live } from '../api'

/**
 * Subscribe to the live tick stream for `symbol`. Opens a WebSocket to the
 * backend; the backend starts/stops the (mock) feed per subscriber. Returns the
 * latest live state, or null while connecting / when no symbol is selected.
 */
export function useLive(symbol: string | null): Live | null {
  const [live, setLive] = useState<Live | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!symbol) {
      setLive(null)
      return
    }
    setLive(null)
    const ws = new WebSocket(`${WS_URL}/ws/live?symbol=${encodeURIComponent(symbol)}`)
    wsRef.current = ws
    ws.onmessage = (e) => {
      try {
        setLive(JSON.parse(e.data) as Live)
      } catch {
        /* ignore malformed frame */
      }
    }
    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [symbol])

  return live
}
