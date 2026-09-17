'use client'

import { useEffect, useMemo, useState } from 'react'

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number }
type Timeframe = '1m' | '5m' | '15m' | '1h'

const formatPrice = (n: number) => {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1) return `$${n.toFixed(4)}`
  if (n >= 0.01) return `$${n.toFixed(6)}`
  return `$${n.toPrecision(5)}`
}

export default function CandleChart({ poolAddress, currentPrice }: { poolAddress?: string; currentPrice?: number }) {
  const [tf, setTf] = useState<Timeframe>('1m')
  const [candles, setCandles] = useState<Candle[]>([])
  const [hovered, setHovered] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!poolAddress) {
      setCandles([])
      setError('')
      return
    }
    let alive = true
    async function load() {
      if (document.hidden) return
      if (alive) setLoading(true)
      try {
        const r = await fetch(`/api/market/ohlcv/${encodeURIComponent(poolAddress)}?tf=${tf}`, { cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'chart unavailable')
        if (alive) {
          const next = (j.candles || []) as Candle[]
          if (next.length) setCandles(next)
          setError('')
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'chart unavailable')
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    const id = window.setInterval(() => void load(), 12000)
    const onVisible = () => { if (!document.hidden) void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [poolAddress, tf])

  const visible = useMemo(() => candles.slice(-90), [candles])
  const geom = useMemo(() => {
    if (!visible.length) return null
    const hi = Math.max(...visible.map(c => c.high), currentPrice || 0)
    const lo = Math.min(...visible.map(c => c.low).filter(v => v > 0), currentPrice || Infinity)
    const maxVol = Math.max(...visible.map(c => c.volume), 1)
    const pad = Math.max((hi - lo) * 0.08, hi * 0.002)
    return { hi: hi + pad, lo: Math.max(0, lo - pad), maxVol }
  }, [visible, currentPrice])

  const xFor = (i: number) => 46 + (i / Math.max(visible.length - 1, 1)) * 900
  const yFor = (price: number) => {
    if (!geom) return 180
    const range = Math.max(geom.hi - geom.lo, 1e-12)
    return 20 + ((geom.hi - price) / range) * 280
  }

  const hoverCandle = hovered == null ? visible[visible.length - 1] : visible[hovered]

  return <div className={`chart-card ${loading ? 'is-loading' : ''}`}>
    <div className="chart-toolbar">
      <div>
        <span className="chart-title">LIVE CHART</span>
        {hoverCandle && <span className="ohlc-readout">O {formatPrice(hoverCandle.open)} · H {formatPrice(hoverCandle.high)} · L {formatPrice(hoverCandle.low)} · C {formatPrice(hoverCandle.close)}</span>}
      </div>
      <div className="tf-group">
        {(['1m','5m','15m','1h'] as Timeframe[]).map(v => <button key={v} className={tf===v?'tf active':'tf'} onClick={()=>setTf(v)}>{v}</button>)}
      </div>
    </div>
    <div className="chart-stage" onMouseLeave={()=>setHovered(null)}>
      {!poolAddress && <div className="chart-state">Select a token to load its chart.</div>}
      {poolAddress && !visible.length && !error && <div className="chart-state chart-loading">Loading real market candles…</div>}
      {error && !visible.length && <div className="chart-state">Historical candles are temporarily unavailable.</div>}
      {!!visible.length && geom && <svg viewBox="0 0 1000 390" preserveAspectRatio="none" role="img" aria-label="Live candlestick chart">
        {[0,1,2,3,4].map(i => {
          const y = 20 + i * 70
          const price = geom.hi - (i/4) * (geom.hi-geom.lo)
          return <g key={i}><line x1="46" x2="970" y1={y} y2={y} className="chart-grid-line"/><text x="975" y={y+4} className="axis-label">{formatPrice(price)}</text></g>
        })}
        {visible.map((c,i) => {
          const x=xFor(i); const up=c.close>=c.open; const colorClass=up?'candle-up':'candle-down'
          const yOpen=yFor(c.open); const yClose=yFor(c.close); const yHigh=yFor(c.high); const yLow=yFor(c.low)
          const width=Math.max(3, Math.min(9, 820/Math.max(visible.length,1)*0.62))
          const bodyY=Math.min(yOpen,yClose); const bodyH=Math.max(1.5,Math.abs(yClose-yOpen))
          const volH=(c.volume/geom.maxVol)*54
          return <g key={`${c.time}-${i}`} onMouseEnter={()=>setHovered(i)} className="candle-hit">
            <rect x={x-width*0.9} y="12" width={width*1.8} height="355" fill="transparent"/>
            <line x1={x} x2={x} y1={yHigh} y2={yLow} className={colorClass}/>
            <rect x={x-width/2} y={bodyY} width={width} height={bodyH} rx="1" className={colorClass}/>
            <rect x={x-width/2} y={365-volH} width={width} height={volH} className={up?'vol-up':'vol-down'}/>
          </g>
        })}
        {hovered != null && <line x1={xFor(hovered)} x2={xFor(hovered)} y1="12" y2="368" className="crosshair"/>}
        {currentPrice && Number.isFinite(currentPrice) && <g><line x1="46" x2="970" y1={yFor(currentPrice)} y2={yFor(currentPrice)} className="price-line"/><text x="895" y={yFor(currentPrice)-7} className="price-tag">{formatPrice(currentPrice)}</text></g>}
      </svg>}
      {loading && visible.length > 0 && <div className="chart-refresh-indicator" aria-label="Refreshing chart"/>}
    </div>
  </div>
}
