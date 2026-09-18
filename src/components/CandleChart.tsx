'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'

type Candle={time:number;open:number;high:number;low:number;close:number;volume:number}
type Timeframe='1s'|'5s'|'15s'|'30s'|'1m'|'3m'|'5m'|'15m'|'30m'|'1h'|'4h'|'6h'|'12h'|'24h'|'1M'
type TimeframeOption={value:Timeframe;label:string}
type TimeframeGroup={label:string;items:TimeframeOption[]}
type ChartMode='price'|'marketCap'

const timeframeGroups:TimeframeGroup[]=[
  {label:'SECONDS',items:[{value:'1s',label:'1 second'},{value:'5s',label:'5 seconds'},{value:'15s',label:'15 seconds'},{value:'30s',label:'30 seconds'}]},
  {label:'MINUTES',items:[{value:'1m',label:'1 minute'},{value:'3m',label:'3 minutes'},{value:'5m',label:'5 minutes'},{value:'15m',label:'15 minutes'},{value:'30m',label:'30 minutes'}]},
  {label:'HOURS',items:[{value:'1h',label:'1 hour'},{value:'4h',label:'4 hours'},{value:'6h',label:'6 hours'},{value:'12h',label:'12 hours'},{value:'24h',label:'24 hours'}]},
  {label:'LONGER',items:[{value:'1M',label:'1 month'}]},
]
const timeframeLabel=(tf:Timeframe)=>timeframeGroups.flatMap(g=>g.items).find(x=>x.value===tf)?.label||tf
const isSecondTf=(tf:Timeframe)=>tf.endsWith('s')
const formatPrice=(n:number)=>!Number.isFinite(n)?'—':n>=1?`$${n.toFixed(4)}`:n>=.01?`$${n.toFixed(6)}`:`$${n.toPrecision(5)}`
const compact=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(0)}`
const refreshMs=(tf:Timeframe)=>tf==='1s'?1_150:tf==='5s'?1_700:tf==='15s'?2_500:tf==='30s'?3_500:tf==='1m'?12_000:tf==='3m'?13_000:tf==='5m'?15_000:tf==='15m'||tf==='30m'?25_000:tf==='1h'?35_000:tf==='4h'||tf==='6h'?60_000:tf==='12h'?90_000:120_000

export default function CandleChart({poolAddress,currentPrice,currentMarketCap,symbol}:{poolAddress?:string;currentPrice?:number;currentMarketCap?:number;symbol?:string}){
  const wrap=useRef<HTMLDivElement|null>(null)
  const pickerRef=useRef<HTMLDivElement|null>(null)
  const chartRef=useRef<IChartApi|null>(null)
  const candleRef=useRef<ISeriesApi<'Candlestick'>|null>(null)
  const volumeRef=useRef<ISeriesApi<'Histogram'>|null>(null)
  const priceLineRef=useRef<any>(null)
  const renderedRef=useRef<{first:number;last:number;mode:ChartMode}|null>(null)
  const hasDataRef=useRef(false)
  const [tf,setTf]=useState<Timeframe>('1m'),[tfOpen,setTfOpen]=useState(false),[mode,setMode]=useState<ChartMode>('price'),[candles,setCandles]=useState<Candle[]>([]),[hover,setHover]=useState<Candle|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[status,setStatus]=useState<'LIVE'|'DEGRADED'|'STALE'>('DEGRADED'),[asOf,setAsOf]=useState(0),[expanded,setExpanded]=useState(false)

  const impliedSupply=useMemo(()=>{const price=Number(currentPrice||0),mc=Number(currentMarketCap||0);return price>0&&mc>0?mc/price:0},[currentPrice,currentMarketCap])
  const mcAvailable=impliedSupply>0
  useEffect(()=>{if(mode==='marketCap'&&!mcAvailable)setMode('price')},[mode,mcAvailable])
  useEffect(()=>{setHover(null)},[mode])

  useEffect(()=>{
    if(!wrap.current)return
    const chart=createChart(wrap.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#07090d'},textColor:'#8d96aa',fontSize:11},grid:{vertLines:{color:'#141821'},horzLines:{color:'#141821'}},crosshair:{mode:CrosshairMode.Normal,vertLine:{color:'#68738d',width:1,labelBackgroundColor:'#273044'},horzLine:{color:'#68738d',width:1,labelBackgroundColor:'#273044'}},rightPriceScale:{borderColor:'#202632',scaleMargins:{top:.06,bottom:.22}},timeScale:{borderColor:'#202632',timeVisible:true,secondsVisible:false,rightOffset:5,barSpacing:8,minBarSpacing:2,fixLeftEdge:false,fixRightEdge:false},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true}})
    const cs=chart.addSeries(CandlestickSeries,{upColor:'#2de0b0',downColor:'#ff3f80',borderVisible:false,wickUpColor:'#2de0b0',wickDownColor:'#ff3f80',priceLineVisible:true,lastValueVisible:true})
    const vs=chart.addSeries(HistogramSeries,{priceScaleId:'',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false})
    vs.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}})
    chart.subscribeCrosshairMove(param=>{const value=param.seriesData.get(cs) as unknown as Candle|undefined;if(value&&typeof value.open==='number')setHover(value);else setHover(null)})
    chartRef.current=chart;candleRef.current=cs;volumeRef.current=vs
    return()=>{chart.remove();chartRef.current=null;candleRef.current=null;volumeRef.current=null;priceLineRef.current=null}
  },[])

  useEffect(()=>{chartRef.current?.timeScale().applyOptions({timeVisible:true,secondsVisible:isSecondTf(tf),rightOffset:isSecondTf(tf)?3:5,barSpacing:isSecondTf(tf)?10:8})},[tf])

  useEffect(()=>{const series=candleRef.current;if(!series)return;if(mode==='marketCap')series.applyOptions({priceFormat:{type:'volume'}});else series.applyOptions({priceFormat:{type:'price',precision:10,minMove:0.0000000001}})},[mode])

  useEffect(()=>{
    if(!tfOpen)return
    const onPointer=(event:PointerEvent)=>{if(pickerRef.current&&!pickerRef.current.contains(event.target as Node))setTfOpen(false)}
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setTfOpen(false)}
    window.addEventListener('pointerdown',onPointer);window.addEventListener('keydown',onKey)
    return()=>{window.removeEventListener('pointerdown',onPointer);window.removeEventListener('keydown',onKey)}
  },[tfOpen])

  useEffect(()=>{
    renderedRef.current=null;hasDataRef.current=false
    if(!poolAddress){setCandles([]);setError('');setStatus('DEGRADED');return}
    let alive=true
    async function load(force=false){
      if(!force&&document.hidden)return
      if(alive&&!hasDataRef.current)setLoading(true)
      try{
        const r=await fetch(`/api/market/ohlcv/${encodeURIComponent(poolAddress!)}?tf=${tf}`,{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'chart unavailable')
        if(alive&&Array.isArray(j.candles)&&j.candles.length){setCandles(j.candles);setError(j.warning||'');setAsOf(Number(j.asOf||Date.now()));setStatus(j.stale?'STALE':j.warning||j.live===false?'DEGRADED':'LIVE')}
      }catch(e){if(alive){setError(e instanceof Error?e.message:'chart unavailable');setStatus('DEGRADED')}}finally{if(alive)setLoading(false)}
    }
    setCandles([]);setHover(null);setError('');void load(true)
    const id=window.setInterval(()=>void load(),refreshMs(tf)),visible=()=>{if(!document.hidden)void load(true)};document.addEventListener('visibilitychange',visible)
    return()=>{alive=false;clearInterval(id);document.removeEventListener('visibilitychange',visible)}
  },[poolAddress,tf])

  const displayCandles=useMemo(()=>mode==='price'||!mcAvailable?candles:candles.map(c=>({...c,open:c.open*impliedSupply,high:c.high*impliedSupply,low:c.low*impliedSupply,close:c.close*impliedSupply})),[candles,mode,mcAvailable,impliedSupply])

  useEffect(()=>{
    const cs=candleRef.current,vs=volumeRef.current
    if(!cs||!vs||!displayCandles.length)return
    const first=displayCandles[0].time,last=displayCandles[displayCandles.length-1].time,previous=renderedRef.current
    const candlePoint=(c:Candle)=>({time:c.time as UTCTimestamp,open:c.open,high:c.high,low:c.low,close:c.close})
    const volumePoint=(c:Candle)=>({time:c.time as UTCTimestamp,value:c.volume,color:c.close>=c.open?'rgba(45,224,176,.24)':'rgba(255,63,128,.24)'})
    let fit=false
    if(mode==='marketCap'||!previous||previous.first!==first||previous.mode!==mode){
      cs.setData(displayCandles.map(candlePoint));vs.setData(displayCandles.map(volumePoint));fit=!previous||previous.mode!==mode
    }else{
      const start=displayCandles.findIndex(c=>c.time===previous.last)
      if(start<0){cs.setData(displayCandles.map(candlePoint));vs.setData(displayCandles.map(volumePoint))}
      else for(let i=start;i<displayCandles.length;i++){cs.update(candlePoint(displayCandles[i]));vs.update(volumePoint(displayCandles[i]))}
    }
    renderedRef.current={first,last,mode};hasDataRef.current=true
    if(fit)requestAnimationFrame(()=>chartRef.current?.timeScale().fitContent())
  },[displayCandles,mode])

  const currentDisplayValue=mode==='marketCap'?Number(currentMarketCap||0):Number(currentPrice||0)
  useEffect(()=>{
    const series=candleRef.current
    if(!series||!currentDisplayValue||!Number.isFinite(currentDisplayValue))return
    if(!priceLineRef.current)priceLineRef.current=series.createPriceLine({price:currentDisplayValue,color:'#6179ff',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:mode==='marketCap'?'LIVE MC':'LIVE'})
    else priceLineRef.current.applyOptions({price:currentDisplayValue,title:mode==='marketCap'?'LIVE MC':'LIVE'})
  },[currentDisplayValue,mode])

  useEffect(()=>{if(!expanded)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false)};window.addEventListener('keydown',key);return()=>{document.body.style.overflow=old;window.removeEventListener('keydown',key)}},[expanded])
  useEffect(()=>{requestAnimationFrame(()=>chartRef.current?.timeScale().fitContent())},[expanded])

  const latest=hover||displayCandles[displayCandles.length-1]
  const summary=useMemo(()=>{if(displayCandles.length<2)return{change:0,volume:displayCandles.reduce((s,c)=>s+Number(c.volume||0),0)};const first=displayCandles[0],last=displayCandles[displayCandles.length-1];return{change:first.open>0?(last.close/first.open-1)*100:0,volume:displayCandles.reduce((s,c)=>s+Number(c.volume||0),0)}},[displayCandles])
  const formatDisplay=(value:number)=>mode==='marketCap'?compact(value):formatPrice(value)

  function chooseTimeframe(value:Timeframe){setTf(value);setTfOpen(false)}

  return <div className={`chart-card lw-chart-card p23-chart chart-v2 ${expanded?'expanded':''}`}>
    <div className="chart-toolbar p23-chart-toolbar chart-v2-toolbar">
      <div className="chart-readout">
        <div className="chart-readout-top"><span className="chart-title">{symbol?"$"+symbol+" · ":""}{mode==="marketCap"?"MC CANDLES":isSecondTf(tf)?"REAL TRADE CANDLES":"REAL OHLCV"}</span><span className={`chart-live-badge ${status.toLowerCase()}`}><i/>{loading?"SYNCING":status}</span></div>
        {latest&&<span className="ohlc-readout">O {formatDisplay(latest.open)} · H {formatDisplay(latest.high)} · L {formatDisplay(latest.low)} · C {formatDisplay(latest.close)}</span>}
      </div>
      <div className="chart-summary chart-v2-summary"><span className={summary.change>=0?"gain":"loss"}>{summary.change>=0?"+":""}{summary.change.toFixed(2)}%</span><span>{compact(summary.volume)} vol</span>{currentMarketCap&&<span className="chart-live-mc">MC {compact(currentMarketCap)}</span>}</div>
      <div className="chart-mode-switch" aria-label="Chart value mode"><button className={mode==="price"?"active":""} onClick={()=>setMode("price")}>PRICE</button><button className={mode==="marketCap"?"active":""} disabled={!mcAvailable} title={mcAvailable?"Show market-cap candles":"Market cap unavailable for this token"} onClick={()=>setMode("marketCap")}>MC</button></div>
      <div className="tf-picker" ref={pickerRef}><button className={`tf-picker-button ${tfOpen?"active":""}`} aria-expanded={tfOpen} onClick={()=>setTfOpen(v=>!v)}><span>{timeframeLabel(tf)}</span><ChevronDown size={14}/></button>{tfOpen&&<div className="tf-picker-menu" role="menu">{timeframeGroups.map(group=><div className="tf-picker-section" key={group.label}><div className="tf-picker-label">{group.label}</div>{group.items.map(item=><button key={item.value} role="menuitem" className={tf===item.value?"active":""} onClick={()=>chooseTimeframe(item.value)}><span>{item.label}</span>{tf===item.value&&<Check size={14}/>}</button>)}</div>)}</div>}</div>
      <div className="chart-tools"><button title="Fit chart" onClick={()=>chartRef.current?.timeScale().fitContent()}><RotateCcw size={13}/></button><button title={expanded?"Exit full chart":"Expand chart"} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize2 size={13}/>:<Maximize2 size={13}/>}</button></div>
    </div>
    {mode==="marketCap"&&<div className="chart-mode-note">MC candles use current implied supply × historical pool price. Live MC comes from the current market snapshot.</div>}
    <div className="lw-chart-wrap">{!poolAddress&&<div className="chart-state">Select a token to load its chart.</div>}{poolAddress&&!displayCandles.length&&!error&&<div className="chart-state"><span className="chart-loader"/>Loading real {timeframeLabel(tf)} candles…</div>}{error&&!displayCandles.length&&<div className="chart-state">{isSecondTf(tf)?'No recent trades yet for this sub-minute view · retrying automatically.':'Chart feed unavailable · retrying automatically.'}</div>}<div ref={wrap} className="lw-chart-canvas"/></div>
    <div className="chart-foot"><span>{asOf?`Updated ${new Date(asOf).toLocaleTimeString()}`:'Waiting for market data'}</span><span>{tf==='1M'?'30 daily candles · one-month view':`${displayCandles.length} ${isSecondTf(tf)?'trade-built ':''}candles · ${tf}`}</span>{error&&displayCandles.length>0&&<span className="loss">{error}</span>}<span className="chart-provider">{isSecondTf(tf)?'Recent real trades':'Market OHLCV'} · GeckoTerminal</span></div>
  </div>
}
