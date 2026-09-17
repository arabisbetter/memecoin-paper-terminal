'use client'

import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'

type Candle={time:number;open:number;high:number;low:number;close:number;volume:number}
type Timeframe='1m'|'5m'|'15m'|'30m'|'1h'|'4h'|'1d'|'1M'
const timeframes:Timeframe[]=['1m','5m','15m','30m','1h','4h','1d','1M']
const formatPrice=(n:number)=>!Number.isFinite(n)?'—':n>=1?`$${n.toFixed(4)}`:n>=.01?`$${n.toFixed(6)}`:`$${n.toPrecision(5)}`

export default function CandleChart({poolAddress,currentPrice}:{poolAddress?:string;currentPrice?:number}){
  const wrap=useRef<HTMLDivElement|null>(null)
  const chartRef=useRef<IChartApi|null>(null)
  const candleRef=useRef<ISeriesApi<'Candlestick'>|null>(null)
  const volumeRef=useRef<ISeriesApi<'Histogram'>|null>(null)
  const priceLineRef=useRef<any>(null)
  const [tf,setTf]=useState<Timeframe>('1m'),[candles,setCandles]=useState<Candle[]>([]),[hover,setHover]=useState<Candle|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[status,setStatus]=useState<'LIVE'|'DEGRADED'|'STALE'>('DEGRADED'),[asOf,setAsOf]=useState(0)

  useEffect(()=>{
    if(!wrap.current)return
    const chart=createChart(wrap.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#080a0f'},textColor:'#8a92a3',fontSize:11},grid:{vertLines:{color:'#151922'},horzLines:{color:'#151922'}},crosshair:{mode:CrosshairMode.Normal,vertLine:{color:'#65708a',width:1,labelBackgroundColor:'#283044'},horzLine:{color:'#65708a',width:1,labelBackgroundColor:'#283044'}},rightPriceScale:{borderColor:'#202532',scaleMargins:{top:.08,bottom:.22}},timeScale:{borderColor:'#202532',timeVisible:true,secondsVisible:false,rightOffset:4,barSpacing:8,minBarSpacing:3},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true}})
    const cs=chart.addSeries(CandlestickSeries,{upColor:'#2de0b0',downColor:'#ff3f80',borderVisible:false,wickUpColor:'#2de0b0',wickDownColor:'#ff3f80',priceLineVisible:true,lastValueVisible:true})
    const vs=chart.addSeries(HistogramSeries,{priceScaleId:'',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false})
    vs.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}})
    chart.subscribeCrosshairMove(param=>{const value=param.seriesData.get(cs) as unknown as Candle|undefined;if(value&&typeof value.open==='number')setHover(value);else setHover(null)})
    chartRef.current=chart;candleRef.current=cs;volumeRef.current=vs
    return()=>{chart.remove();chartRef.current=null;candleRef.current=null;volumeRef.current=null;priceLineRef.current=null}
  },[])

  useEffect(()=>{
    if(!poolAddress){setCandles([]);setError('');setStatus('DEGRADED');return}
    let alive=true
    async function load(force=false){
      if(!force&&document.hidden)return
      if(alive)setLoading(true)
      try{const r=await fetch(`/api/market/ohlcv/${encodeURIComponent(poolAddress!)}?tf=${tf}`,{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'chart unavailable');if(alive&&Array.isArray(j.candles)&&j.candles.length){setCandles(j.candles);setError(j.warning||'');setAsOf(Number(j.asOf||Date.now()));setStatus(j.stale?'STALE':j.warning||j.live===false?'DEGRADED':'LIVE')}}catch(e){if(alive){setError(e instanceof Error?e.message:'chart unavailable');setStatus('DEGRADED')}}finally{if(alive)setLoading(false)}
    }
    setCandles([]);setHover(null);void load(true)
    const id=window.setInterval(()=>void load(),tf==='1M'||tf==='1d'?120_000:30_000),visible=()=>{if(!document.hidden)void load(true)};document.addEventListener('visibilitychange',visible)
    return()=>{alive=false;clearInterval(id);document.removeEventListener('visibilitychange',visible)}
  },[poolAddress,tf])

  useEffect(()=>{
    if(!candleRef.current||!volumeRef.current||!candles.length)return
    candleRef.current.setData(candles.map(c=>({time:c.time as UTCTimestamp,open:c.open,high:c.high,low:c.low,close:c.close})))
    volumeRef.current.setData(candles.map(c=>({time:c.time as UTCTimestamp,value:c.volume,color:c.close>=c.open?'rgba(45,224,176,.24)':'rgba(255,63,128,.24)'})))
    chartRef.current?.timeScale().fitContent()
  },[candles])

  useEffect(()=>{
    const series=candleRef.current
    if(!series||!currentPrice||!Number.isFinite(currentPrice))return
    if(!priceLineRef.current)priceLineRef.current=series.createPriceLine({price:currentPrice,color:'#5b76ff',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'LIVE'})
    else priceLineRef.current.applyOptions({price:currentPrice})
  },[currentPrice])

  const latest=hover||candles[candles.length-1]
  return <div className="chart-card lw-chart-card">
    <div className="chart-toolbar"><div className="chart-readout"><span className="chart-title">REAL OHLCV</span><span className={`chart-live-badge ${status.toLowerCase()}`}><i/>{loading?'SYNCING':status}</span>{latest&&<span className="ohlc-readout">O {formatPrice(latest.open)} · H {formatPrice(latest.high)} · L {formatPrice(latest.low)} · C {formatPrice(latest.close)}</span>}</div><div className="tf-group">{timeframes.map(v=><button key={v} title={v==='1M'?'1 month view':v} className={tf===v?'tf active':'tf'} onClick={()=>setTf(v)}>{v}</button>)}</div></div>
    <div className="lw-chart-wrap">{!poolAddress&&<div className="chart-state">Select a token to load its chart.</div>}{poolAddress&&!candles.length&&!error&&<div className="chart-state"><span className="chart-loader"/>Loading real {tf} candles…</div>}{error&&!candles.length&&<div className="chart-state">Chart feed unavailable · retrying automatically.</div>}<div ref={wrap} className="lw-chart-canvas"/></div>
    <div className="chart-foot"><span>{asOf?`Updated ${new Date(asOf).toLocaleTimeString()}`:'Waiting for market data'}</span>{error&&candles.length>0&&<span className="loss">{error}</span>}<a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Charts by TradingView</a></div>
  </div>
}
