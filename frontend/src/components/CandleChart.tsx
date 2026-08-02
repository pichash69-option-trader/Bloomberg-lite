import { useEffect, useRef } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useQuery } from '@tanstack/react-query'
import { getJSON, type History } from '../api'

export default function CandleChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['history', symbol],
    queryFn: () => getJSON<History>(`/history?symbol=${encodeURIComponent(symbol)}&interval=1d`),
  })

  useEffect(() => {
    if (!containerRef.current || !data) return

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
        fontFamily: 'Outfit, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(28,35,51,0.6)' },
        horzLines: { color: 'rgba(28,35,51,0.6)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1c2333' },
      timeScale: { borderColor: '#1c2333', timeVisible: false },
    })
    chartRef.current = chart

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })
    candleSeries.setData(
      data.candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    )

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })
    volumeSeries.setData(
      data.candles.map((c) => ({
        time: c.time,
        value: c.volume ?? 0,
        color: c.close >= c.open ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
      })),
    )

    chart.timeScale().fitContent()

    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [data])

  return (
    <div className="relative">
      {isLoading && (
        <div className="grid h-[360px] place-items-center text-sm text-slate-500">
          chart load ho raha…
        </div>
      )}
      {isError && (
        <div className="grid h-[360px] place-items-center text-sm text-down">
          {symbol}: koi history nahi (backfill/mock chala?)
        </div>
      )}
      {!isLoading && !isError && (
        <div ref={containerRef} className="h-[360px] w-full" />
      )}
    </div>
  )
}
