'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Camera, Check, ChevronDown, Crosshair, Eye, Maximize2, Minimize2,
  Minus, MousePointer2, Plus, Redo2, RotateCcw, Settings2, SlidersHorizontal, Undo2, TrendingUp, Square, MoveRight, Trash2
} from 'lucide-react'
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, PriceScaleMode,
  createChart, createSeriesMarkers, type IChartApi, type ISeriesApi, type UTCTimestamp
} from 'lightweight-charts'
import { createClient } from '@/lib/supabase/client'
import ChartDrawingOverlay, { type DrawingTool } from '@/components/ChartDrawingOverlay'

type Candle={time:number;open:number;high:number;low:number;close:number;volume:number}
type Timeframe='1s'|'5s'|'15s'|'30s'|'1m'|'3m'|'5m'|'15m'|'30m'|'1h'|'4h'|'6h'|'12h'|'24h'|'1M'
type TimeframeOption={value:Timeframe;label:string}
type TimeframeGroup={label:string;items:TimeframeOption[]}
type ChartMode='price'|'marketCap'
type QuoteMode='usd'|'sol'
type ScaleMode='normal'|'percent'|'log'
type UserLevel={price:number;color:string;title:string;mode:ChartMode;quote:QuoteMode}
type PaperTradeMarker={id:string;action:'buy'|'sell';simulated_fill_price_usd:number;simulated_fill_mc_usd:number|null;ts:string}

const timeframeGroups:TimeframeGroup[]=[
  {label:'SECONDS',items:[{value:'1s',label:'1 second'},{value:'5s',label:'5 seconds'},{value:'15s',label:'15 seconds'},{value:'30s',label:'30 seconds'}]},
  {label:'MINUTES',items:[{value:'1m',label:'1 minute'},{value:'3m',label:'3 minutes'},{value:'5m',label:'5 minutes'},{value:'15m',label:'15 minutes'},{value:'30m',label:'30 minutes'}]},
  {label:'HOURS',items:[{value:'1h',label:'1 hour'},{value:'4h',label:'4 hours'},{value:'6h',label:'6 hours'},{value:'12h',label:'12 hours'},{value:'24h',label:'24 hours'}]},
  {label:'LONGER',items:[{value:'1M',label:'1 month'}]},
]
const quickTfs:Timeframe[]=['1s','5s','15s','30s','1m','5m','15m','1h']
const timeframeLabel=(tf:Timeframe)=>timeframeGroups.flatMap(g=>g.items).find(x=>x.value===tf)?.label||tf
const isSecondTf=(tf:Timeframe)=>tf.endsWith('s')
const refreshMs=(tf:Timeframe)=>tf==='1s'?1050:tf==='5s'?1500:tf==='15s'?2250:tf==='30s'?3000:tf==='1m'?10000:tf==='3m'?12000:tf==='5m'?14000:tf==='15m'||tf==='30m'?22000:tf==='1h'?35000:tf==='4h'||tf==='6h'?60000:tf==='12h'?90000:120000
const compact=(n:number,prefix='$')=>{
  if(!Number.isFinite(n))return'—'
  if(n>=1e9)return prefix+(n/1e9).toFixed(2)+'B'
  if(n>=1e6)return prefix+(n/1e6).toFixed(2)+'M'
  if(n>=1e3)return prefix+(n/1e3).toFixed(1)+'K'
  return prefix+n.toFixed(n>=100?0:n>=1?2:4)
}
const formatRaw=(n:number,quote:QuoteMode)=>{
  if(!Number.isFinite(n))return'—'
  const prefix=quote==='usd'?'$':'◎'
  if(n>=1)return prefix+n.toFixed(4)
  if(n>=.01)return prefix+n.toFixed(6)
  return prefix+n.toPrecision(5)
}
const ema=(rows:Candle[],period:number)=>{
  if(!rows.length)return[]
  const alpha=2/(period+1)
  let value=rows[0].close
  return rows.map((row,index)=>{
    value=index===0?row.close:(row.close*alpha)+(value*(1-alpha))
    return{time:row.time as UTCTimestamp,value}
  })
}
const vwap=(rows:Candle[])=>{
  let cumulativeVolume=0,cumulativeValue=0
  return rows.map(row=>{
    const volume=Math.max(0,Number(row.volume||0))
    const typical=(row.high+row.low+row.close)/3
    cumulativeVolume+=volume
    cumulativeValue+=typical*volume
    return{time:row.time as UTCTimestamp,value:cumulativeVolume>0?cumulativeValue/cumulativeVolume:row.close}
  })
}

export default function CandleChart({
  poolAddress,tokenId,currentPrice,currentMarketCap,currentSolUsd,averageEntryPrice,averageEntryMarketCap,symbol,venue
}:{
  poolAddress?:string
  tokenId?:string
  currentPrice?:number
  currentMarketCap?:number
  currentSolUsd?:number
  averageEntryPrice?:number
  averageEntryMarketCap?:number
  symbol?:string
  venue?:string
}){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const wrap=useRef<HTMLDivElement|null>(null)
  const pickerRef=useRef<HTMLDivElement|null>(null)
  const chartRef=useRef<IChartApi|null>(null)
  const candleRef=useRef<ISeriesApi<'Candlestick'>|null>(null)
  const volumeRef=useRef<ISeriesApi<'Histogram'>|null>(null)
  const ema9Ref=useRef<ISeriesApi<'Line'>|null>(null)
  const ema21Ref=useRef<ISeriesApi<'Line'>|null>(null)
  const vwapRef=useRef<ISeriesApi<'Line'>|null>(null)
  const priceLineRef=useRef<any>(null)
  const costLineRef=useRef<any>(null)
  const tradeMarkersRef=useRef<any>(null)
  const userPriceLines=useRef<any[]>([])
  const userLevels=useRef<UserLevel[]>([])
  const redoLevels=useRef<UserLevel[]>([])
  const renderedRef=useRef<{first:number;last:number;mode:ChartMode;quote:QuoteMode}|null>(null)
  const hasDataRef=useRef(false)
  const userPickedMode=useRef(false)
  const workspaceLoaded=useRef(false)

  const [tf,setTf]=useState<Timeframe>('1s')
  const [tfOpen,setTfOpen]=useState(false)
  const [mode,setMode]=useState<ChartMode>('price')
  const [quote,setQuote]=useState<QuoteMode>('usd')
  const [scaleMode,setScaleMode]=useState<ScaleMode>('normal')
  const [candles,setCandles]=useState<Candle[]>([])
  const [hover,setHover]=useState<Candle|null>(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const [status,setStatus]=useState<'LIVE'|'DEGRADED'|'STALE'>('DEGRADED')
  const [asOf,setAsOf]=useState(0)
  const [expanded,setExpanded]=useState(false)
  const [indicatorOpen,setIndicatorOpen]=useState(false)
  const [displayOpen,setDisplayOpen]=useState(false)
  const [showVolume,setShowVolume]=useState(true)
  const [showGrid,setShowGrid]=useState(true)
  const [showCrosshair,setShowCrosshair]=useState(true)
  const [showEma9,setShowEma9]=useState(false)
  const [showEma21,setShowEma21]=useState(false)
  const [showVwap,setShowVwap]=useState(false)
  const [showTradeMarkers,setShowTradeMarkers]=useState(true)
  const [trades,setTrades]=useState<PaperTradeMarker[]>([])
  const [drawingTool,setDrawingTool]=useState<DrawingTool>('none'),[drawingClearSignal,setDrawingClearSignal]=useState(0)
  const [levelVersion,setLevelVersion]=useState(0)

  const impliedSupply=useMemo(()=>{
    const price=Number(currentPrice||0),mc=Number(currentMarketCap||0)
    return price>0&&mc>0?mc/price:0
  },[currentPrice,currentMarketCap])
  const mcAvailable=impliedSupply>0
  const solUsd=Number(currentSolUsd||0)
  const solAvailable=solUsd>0

  useEffect(()=>{
    if(mcAvailable&&!userPickedMode.current)setMode('marketCap')
    if(!mcAvailable&&mode==='marketCap')setMode('price')
  },[mcAvailable,mode])
  useEffect(()=>{if(quote==='sol'&&!solAvailable)setQuote('usd')},[quote,solAvailable])
  useEffect(()=>{setHover(null)},[mode,quote])

  useEffect(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem('paper.chart.workspace.v2')||'{}')
      if(saved.tf&&timeframeGroups.flatMap(g=>g.items).some(i=>i.value===saved.tf))setTf(saved.tf)
      if(saved.mode==='price'||saved.mode==='marketCap'){setMode(saved.mode);userPickedMode.current=true}
      if(saved.quote==='usd'||saved.quote==='sol')setQuote(saved.quote)
      if(saved.scaleMode==='normal'||saved.scaleMode==='percent'||saved.scaleMode==='log')setScaleMode(saved.scaleMode)
      if(typeof saved.showVolume==='boolean')setShowVolume(saved.showVolume)
      if(typeof saved.showGrid==='boolean')setShowGrid(saved.showGrid)
      if(typeof saved.showCrosshair==='boolean')setShowCrosshair(saved.showCrosshair)
      if(typeof saved.showEma9==='boolean')setShowEma9(saved.showEma9)
      if(typeof saved.showEma21==='boolean')setShowEma21(saved.showEma21)
      if(typeof saved.showVwap==='boolean')setShowVwap(saved.showVwap)
      if(typeof saved.showTradeMarkers==='boolean')setShowTradeMarkers(saved.showTradeMarkers)
      if(Array.isArray(saved.levels))userLevels.current=saved.levels.filter((l:any)=>Number(l?.price)>0&&(l?.mode==='price'||l?.mode==='marketCap')&&(l?.quote==='usd'||l?.quote==='sol')).slice(0,25)
    }catch{}
    workspaceLoaded.current=true
    setLevelVersion(v=>v+1)
  },[])

  useEffect(()=>{
    if(!workspaceLoaded.current)return
    localStorage.setItem('paper.chart.workspace.v2',JSON.stringify({
      tf,mode,quote,scaleMode,showVolume,showGrid,showCrosshair,showEma9,showEma21,showVwap,showTradeMarkers,
      levels:userLevels.current
    }))
  },[tf,mode,quote,scaleMode,showVolume,showGrid,showCrosshair,showEma9,showEma21,showVwap,showTradeMarkers,levelVersion])

  useEffect(()=>{
    if(!wrap.current)return
    const chart=createChart(wrap.current,{
      autoSize:true,
      layout:{background:{type:ColorType.Solid,color:'#080b0f'},textColor:'#949dac',fontSize:11,fontFamily:'Inter,ui-sans-serif,system-ui,sans-serif'},
      grid:{vertLines:{color:'#1d232c'},horzLines:{color:'#1d232c'}},
      crosshair:{
        mode:CrosshairMode.Normal,
        vertLine:{color:'#677181',width:1,labelBackgroundColor:'#262d36'},
        horzLine:{color:'#677181',width:1,labelBackgroundColor:'#262d36'}
      },
      rightPriceScale:{borderColor:'#242a32',scaleMargins:{top:.04,bottom:.17},entireTextOnly:true},
      timeScale:{borderColor:'#242a32',timeVisible:true,secondsVisible:true,rightOffset:8,barSpacing:6,minBarSpacing:1.4,fixLeftEdge:false,fixRightEdge:false},
      handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
      handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true},
    })
    const candle=chart.addSeries(CandlestickSeries,{
      upColor:'#11c7a3',downColor:'#ef394f',borderVisible:false,
      wickUpColor:'#11c7a3',wickDownColor:'#ef394f',
      priceLineVisible:false,lastValueVisible:true,
    })
    const markerPrimitive=createSeriesMarkers(candle,[])
    const volume=chart.addSeries(HistogramSeries,{
      priceScaleId:'',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false
    })
    volume.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}})
    const ema9Series=chart.addSeries(LineSeries,{color:'#f2b84b',lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
    const ema21Series=chart.addSeries(LineSeries,{color:'#a875ff',lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
    const vwapSeries=chart.addSeries(LineSeries,{color:'#55a8ff',lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})

    chart.subscribeCrosshairMove(param=>{
      const value=param.seriesData.get(candle) as unknown as Candle|undefined
      if(value&&typeof value.open==='number')setHover(value)
      else setHover(null)
    })

    chartRef.current=chart
    candleRef.current=candle
    tradeMarkersRef.current=markerPrimitive
    volumeRef.current=volume
    ema9Ref.current=ema9Series
    ema21Ref.current=ema21Series
    vwapRef.current=vwapSeries
    return()=>{
      chart.remove()
      chartRef.current=null
      candleRef.current=null
      volumeRef.current=null
      ema9Ref.current=null
      ema21Ref.current=null
      vwapRef.current=null
      priceLineRef.current=null
      costLineRef.current=null
      tradeMarkersRef.current=null
      userPriceLines.current=[]
    }
  },[])

  useEffect(()=>{
    chartRef.current?.timeScale().applyOptions({
      timeVisible:true,secondsVisible:isSecondTf(tf),rightOffset:isSecondTf(tf)?8:6,
      barSpacing:isSecondTf(tf)?5:7
    })
  },[tf])

  useEffect(()=>{
    chartRef.current?.applyOptions({
      grid:{
        vertLines:{color:showGrid?'#1d232c':'transparent'},
        horzLines:{color:showGrid?'#1d232c':'transparent'}
      },
      crosshair:{
        vertLine:{visible:showCrosshair,color:'#677181',width:1,labelBackgroundColor:'#262d36'},
        horzLine:{visible:showCrosshair,color:'#677181',width:1,labelBackgroundColor:'#262d36'}
      }
    })
    volumeRef.current?.applyOptions({visible:showVolume})
  },[showGrid,showCrosshair,showVolume])

  useEffect(()=>{
    chartRef.current?.priceScale('right').applyOptions({
      mode:scaleMode==='log'?PriceScaleMode.Logarithmic:scaleMode==='percent'?PriceScaleMode.Percentage:PriceScaleMode.Normal,
      autoScale:true
    })
  },[scaleMode])

  useEffect(()=>{
    const series=candleRef.current
    if(!series)return
    if(mode==='marketCap'){
      series.applyOptions({priceFormat:{type:'volume'}})
    }else{
      series.applyOptions({priceFormat:{type:'price',precision:10,minMove:0.0000000001}})
    }
  },[mode,quote])

  useEffect(()=>{
    if(!tfOpen&&!indicatorOpen&&!displayOpen)return
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setTfOpen(false);setIndicatorOpen(false);setDisplayOpen(false)}
    }
    window.addEventListener('keydown',onKey)
    return()=>window.removeEventListener('keydown',onKey)
  },[tfOpen,indicatorOpen,displayOpen])

  useEffect(()=>{
    renderedRef.current=null
    hasDataRef.current=false
    if(!poolAddress){setCandles([]);setError('');setStatus('DEGRADED');return}
    let alive=true
    async function load(force=false){
      if(!force&&document.hidden)return
      if(alive&&!hasDataRef.current)setLoading(true)
      try{
        const response=await fetch('/api/market/ohlcv/'+encodeURIComponent(poolAddress!)+'?tf='+tf,{cache:'no-store'})
        const json=await response.json()
        if(!response.ok)throw new Error(json.error||'chart unavailable')
        if(alive&&Array.isArray(json.candles)&&json.candles.length){
          setCandles(json.candles)
          setError(json.warning||'')
          setAsOf(Number(json.asOf||Date.now()))
          setStatus(json.stale?'STALE':json.warning||json.live===false?'DEGRADED':'LIVE')
        }
      }catch(e){
        if(alive){setError(e instanceof Error?e.message:'chart unavailable');setStatus('DEGRADED')}
      }finally{
        if(alive)setLoading(false)
      }
    }
    setCandles([])
    setHover(null)
    setError('')
    void load(true)
    const id=window.setInterval(()=>void load(),refreshMs(tf))
    const visible=()=>{if(!document.hidden)void load(true)}
    document.addEventListener('visibilitychange',visible)
    return()=>{alive=false;clearInterval(id);document.removeEventListener('visibilitychange',visible)}
  },[poolAddress,tf])

  useEffect(()=>{
    if(!supabase||!tokenId){setTrades([]);return}
    let alive=true
    const loadTrades=async()=>{
      if(document.hidden)return
      try{
        const {data,error}=await supabase.from('paper_trades')
          .select('id,action,simulated_fill_price_usd,simulated_fill_mc_usd,ts')
          .eq('token_id',tokenId).order('ts',{ascending:true}).limit(120)
        if(error)throw error
        if(alive)setTrades((data||[]) as PaperTradeMarker[])
      }catch{if(alive)setTrades([])}
    }
    void loadTrades()
    const id=window.setInterval(()=>void loadTrades(),8000)
    const changed=()=>void loadTrades()
    window.addEventListener('paper:account-changed',changed)
    return()=>{alive=false;clearInterval(id);window.removeEventListener('paper:account-changed',changed)}
  },[supabase,tokenId])

  useEffect(()=>{
    const primitive=tradeMarkersRef.current
    if(!primitive)return
    if(!showTradeMarkers||!candles.length||!trades.length){primitive.setMarkers([]);return}
    const first=candles[0].time,last=candles[candles.length-1].time
    const nearest=(value:number)=>{
      let best=candles[0].time,bestDelta=Math.abs(best-value)
      for(let i=1;i<candles.length;i++){const delta=Math.abs(candles[i].time-value);if(delta<bestDelta){best=candles[i].time;bestDelta=delta}}
      return best
    }
    const markers=trades.map(trade=>{
      const timestamp=Math.floor(new Date(trade.ts).getTime()/1000)
      if(!Number.isFinite(timestamp)||timestamp<first-86400||timestamp>last+86400)return null
      const isBuy=trade.action==='buy'
      return{
        time:nearest(timestamp) as UTCTimestamp,
        position:isBuy?'belowBar':'aboveBar',
        color:isBuy?'#17d7aa':'#ff4d77',
        shape:isBuy?'arrowUp':'arrowDown',
        text:isBuy?'BUY':'SELL',
        size:1.15,
      }
    }).filter(Boolean)
    primitive.setMarkers(markers as any)
  },[candles,trades,showTradeMarkers])

  const multiplier=useMemo(()=>{
    const base=mode==='marketCap'&&mcAvailable?impliedSupply:1
    const quoteFactor=quote==='sol'&&solAvailable?1/solUsd:1
    return base*quoteFactor
  },[mode,mcAvailable,impliedSupply,quote,solAvailable,solUsd])

  const displayCandles=useMemo(()=>candles.map(c=>({
    ...c,open:c.open*multiplier,high:c.high*multiplier,low:c.low*multiplier,close:c.close*multiplier
  })),[candles,multiplier])

  useEffect(()=>{
    const candle=candleRef.current,volume=volumeRef.current
    if(!candle||!volume||!displayCandles.length)return

    const first=displayCandles[0].time
    const last=displayCandles[displayCandles.length-1].time
    const previous=renderedRef.current
    const candlePoint=(c:Candle)=>({time:c.time as UTCTimestamp,open:c.open,high:c.high,low:c.low,close:c.close})
    const volumePoint=(c:Candle)=>({time:c.time as UTCTimestamp,value:c.volume,color:c.close>=c.open?'rgba(17,199,163,.28)':'rgba(239,57,79,.25)'})

    const reset=!previous||previous.first!==first||previous.mode!==mode||previous.quote!==quote||mode==='marketCap'
    if(reset){
      candle.setData(displayCandles.map(candlePoint))
      volume.setData(displayCandles.map(volumePoint))
    }else{
      const start=displayCandles.findIndex(c=>c.time===previous.last)
      if(start<0){
        candle.setData(displayCandles.map(candlePoint))
        volume.setData(displayCandles.map(volumePoint))
      }else{
        for(let i=start;i<displayCandles.length;i++){
          candle.update(candlePoint(displayCandles[i]))
          volume.update(volumePoint(displayCandles[i]))
        }
      }
    }

    ema9Ref.current?.setData(showEma9?ema(displayCandles,9):[])
    ema21Ref.current?.setData(showEma21?ema(displayCandles,21):[])
    vwapRef.current?.setData(showVwap?vwap(displayCandles):[])

    renderedRef.current={first,last,mode,quote}
    hasDataRef.current=true
    if(reset)requestAnimationFrame(()=>chartRef.current?.timeScale().fitContent())
  },[displayCandles,mode,quote,showEma9,showEma21,showVwap])

  const currentDisplayValue=useMemo(()=>{
    const raw=mode==='marketCap'?Number(currentMarketCap||0):Number(currentPrice||0)
    return quote==='sol'&&solAvailable?raw/solUsd:raw
  },[mode,currentMarketCap,currentPrice,quote,solAvailable,solUsd])

  const averageDisplayValue=useMemo(()=>{
    const raw=mode==='marketCap'?Number(averageEntryMarketCap||0):Number(averageEntryPrice||0)
    return quote==='sol'&&solAvailable?raw/solUsd:raw
  },[mode,averageEntryMarketCap,averageEntryPrice,quote,solAvailable,solUsd])

  useEffect(()=>{
    const series=candleRef.current
    if(!series||!currentDisplayValue||!Number.isFinite(currentDisplayValue))return
    if(!priceLineRef.current){
      priceLineRef.current=series.createPriceLine({
        price:currentDisplayValue,color:'#18c5a3',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:''
      })
    }else{
      priceLineRef.current.applyOptions({price:currentDisplayValue,color:'#18c5a3'})
    }
  },[currentDisplayValue])

  useEffect(()=>{
    const series=candleRef.current
    if(!series)return
    if(!averageDisplayValue||!Number.isFinite(averageDisplayValue)){
      if(costLineRef.current){series.removePriceLine(costLineRef.current);costLineRef.current=null}
      return
    }
    if(!costLineRef.current){
      costLineRef.current=series.createPriceLine({
        price:averageDisplayValue,color:'#6e9f49',lineWidth:2,lineStyle:1,axisLabelVisible:true,title:'AVG COST'
      })
    }else{
      costLineRef.current.applyOptions({price:averageDisplayValue,color:'#6e9f49',title:'AVG COST'})
    }
  },[averageDisplayValue])

  useEffect(()=>{
    const series=candleRef.current
    if(!series)return
    for(const line of userPriceLines.current){try{series.removePriceLine(line)}catch{}}
    userPriceLines.current=[]
    for(const level of userLevels.current.filter(l=>l.mode===mode&&l.quote===quote)){
      const line=series.createPriceLine({price:level.price,color:level.color,lineWidth:1,lineStyle:1,axisLabelVisible:true,title:''})
      userPriceLines.current.push(line)
    }
  },[mode,quote,levelVersion])

  useEffect(()=>{
    if(!expanded)return
    const old=document.body.style.overflow
    document.body.style.overflow='hidden'
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false)}
    window.addEventListener('keydown',key)
    return()=>{document.body.style.overflow=old;window.removeEventListener('keydown',key)}
  },[expanded])
  useEffect(()=>{requestAnimationFrame(()=>chartRef.current?.timeScale().fitContent())},[expanded])

  const latest=hover||displayCandles[displayCandles.length-1]
  const summary=useMemo(()=>{
    if(displayCandles.length<2)return{change:0,volume:displayCandles.reduce((s,c)=>s+Number(c.volume||0),0)}
    const first=displayCandles[0],last=displayCandles[displayCandles.length-1]
    return{
      change:first.open>0?(last.close/first.open-1)*100:0,
      volume:displayCandles.reduce((s,c)=>s+Number(c.volume||0),0)
    }
  },[displayCandles])

  const formatDisplay=(value:number)=>{
    if(mode==='marketCap')return compact(value,quote==='usd'?'$':'◎')
    return formatRaw(value,quote)
  }

  function chooseTimeframe(value:Timeframe){
    setTf(value)
    setTfOpen(false)
  }
  function chooseMode(next:ChartMode){
    userPickedMode.current=true
    if(next==='marketCap'&&!mcAvailable)return
    setMode(next)
  }
  function toggleQuote(){
    if(!solAvailable)return
    setQuote(v=>v==='usd'?'sol':'usd')
  }
  function zoom(mult:number){
    const scale=chartRef.current?.timeScale()
    const range=scale?.getVisibleLogicalRange()
    if(!scale||!range)return
    const center=(range.from+range.to)/2
    const span=(range.to-range.from)*mult/2
    scale.setVisibleLogicalRange({from:center-span,to:center+span})
  }
  function focusLast(seconds:number){
    const chart=chartRef.current
    if(!chart||!displayCandles.length)return
    const last=displayCandles[displayCandles.length-1].time
    const first=Math.max(displayCandles[0].time,last-seconds)
    chart.timeScale().setVisibleRange({from:first as UTCTimestamp,to:last as UTCTimestamp})
  }
  function addLevel(){
    const series=candleRef.current
    const value=(hover||displayCandles[displayCandles.length-1])?.close
    if(!series||!value)return
    const level:UserLevel={price:value,color:'#8ea66a',title:'Level',mode,quote}
    const line=series.createPriceLine({price:value,color:level.color,lineWidth:1,lineStyle:1,axisLabelVisible:true,title:''})
    userPriceLines.current.push(line)
    userLevels.current.push(level)
    redoLevels.current=[]
    setLevelVersion(v=>v+1)
  }
  function undoLevel(){
    const series=candleRef.current
    const line=userPriceLines.current.pop()
    const level=userLevels.current.pop()
    if(series&&line)series.removePriceLine(line)
    if(level)redoLevels.current.push(level)
    setLevelVersion(v=>v+1)
  }
  function redoLevel(){
    const series=candleRef.current
    const level=redoLevels.current.pop()
    if(!series||!level)return
    userLevels.current.push(level)
    setLevelVersion(v=>v+1)
  }
  function saveScreenshot(){
    const canvas=chartRef.current?.takeScreenshot()
    if(!canvas)return
    canvas.toBlob(blob=>{
      if(!blob)return
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a')
      a.href=url
      a.download=(symbol||'PAPER')+'-'+mode+'-'+tf+'.png'
      a.click()
      setTimeout(()=>URL.revokeObjectURL(url),500)
    },'image/png')
  }

  return <div className={'chart-card lw-chart-card p23-chart axiom-chart '+(expanded?'expanded':'')}>
    <div className="axiom-chart-toolbar">
      <div className="axiom-quick-tfs">
        {quickTfs.map(value=><button key={value} className={tf===value?'active':''} onClick={()=>chooseTimeframe(value)}>{value}</button>)}
      </div>

      <div className="axiom-toolbar-separator"/>
      <button className="axiom-tool-label active"><Activity size={13}/>Candles</button>

      <div className="axiom-popover-wrap">
        <button className={(indicatorOpen?'active ':'')+'axiom-tool-label'} onClick={()=>{setIndicatorOpen(v=>!v);setDisplayOpen(false)}}><SlidersHorizontal size={13}/>Indicators</button>
        {indicatorOpen&&<div className="axiom-popover indicator-popover">
          <b>INDICATORS</b>
          <label><input type="checkbox" checked={showEma9} onChange={e=>setShowEma9(e.target.checked)}/>EMA 9 <i className="ema9-dot"/></label>
          <label><input type="checkbox" checked={showEma21} onChange={e=>setShowEma21(e.target.checked)}/>EMA 21 <i className="ema21-dot"/></label>
          <label><input type="checkbox" checked={showVwap} onChange={e=>setShowVwap(e.target.checked)}/>VWAP <i className="vwap-dot"/></label>
        </div>}
      </div>

      <div className="axiom-popover-wrap">
        <button className={(displayOpen?'active ':'')+'axiom-tool-label'} onClick={()=>{setDisplayOpen(v=>!v);setIndicatorOpen(false)}}><Eye size={13}/>Display <ChevronDown size={11}/></button>
        {displayOpen&&<div className="axiom-popover display-popover">
          <b>DISPLAY</b>
          <label><input type="checkbox" checked={showVolume} onChange={e=>setShowVolume(e.target.checked)}/>Volume</label>
          <label><input type="checkbox" checked={showGrid} onChange={e=>setShowGrid(e.target.checked)}/>Grid</label>
          <label><input type="checkbox" checked={showCrosshair} onChange={e=>setShowCrosshair(e.target.checked)}/>Crosshair</label>
          <label><input type="checkbox" checked={showTradeMarkers} onChange={e=>setShowTradeMarkers(e.target.checked)}/>PAPER trade markers</label>
        </div>}
      </div>

      <div className="axiom-toolbar-separator"/>
      <button className="axiom-switch-button" disabled={!solAvailable} onClick={toggleQuote}>{quote==='usd'?'USD / SOL':'SOL / USD'}</button>
      <button className="axiom-switch-button mode" disabled={!mcAvailable} onClick={()=>chooseMode(mode==='marketCap'?'price':'marketCap')}>{mode==='marketCap'?'MarketCap / Price':'Price / MarketCap'}</button>

      <div className="axiom-toolbar-separator"/>
      <button className="axiom-icon-button" disabled={!userLevels.current.length} onClick={undoLevel} title="Undo level"><Undo2 size={14}/></button>
      <button className="axiom-icon-button" disabled={!redoLevels.current.length} onClick={redoLevel} title="Redo level"><Redo2 size={14}/></button>

      <div className="axiom-chart-brand">PAPER <ChevronDown size={11}/></div>
      <button className="axiom-icon-button" onClick={()=>setDisplayOpen(v=>!v)} title="Chart settings"><Settings2 size={14}/></button>
      <button className="axiom-icon-button" onClick={()=>setExpanded(v=>!v)} title={expanded?'Exit fullscreen':'Fullscreen'}>{expanded?<Minimize2 size={14}/>:<Maximize2 size={14}/>}</button>
      <button className="axiom-icon-button" onClick={saveScreenshot} title="Save chart image"><Camera size={14}/></button>
    </div>

    <div className="axiom-chart-body">
      <div className="axiom-draw-rail">
        <button className={drawingTool==='none'?'active':''} title="Crosshair" onClick={()=>setDrawingTool('none')}><Crosshair size={16}/></button>
        <button title="Pointer" onClick={()=>setDrawingTool('none')}><MousePointer2 size={16}/></button>
        <button className={drawingTool==='trend'?'active':''} title="Trend line" onClick={()=>setDrawingTool('trend')}><TrendingUp size={16}/></button>
        <button className={drawingTool==='ray'?'active':''} title="Ray" onClick={()=>setDrawingTool('ray')}><MoveRight size={16}/></button>
        <button className={drawingTool==='rectangle'?'active':''} title="Rectangle" onClick={()=>setDrawingTool('rectangle')}><Square size={15}/></button>
        <button className={drawingTool==='fib'?'active':''} title="Fibonacci retracement" onClick={()=>setDrawingTool('fib')}><span className="fib-tool">Fib</span></button>
        <button title="Add horizontal level" onClick={addLevel}><Minus size={16}/></button>
        <button title="Clear drawings" onClick={()=>setDrawingClearSignal(v=>v+1)}><Trash2 size={15}/></button>
        <button title="Zoom in" onClick={()=>zoom(.72)}><Plus size={16}/></button>
        <button title="Zoom out" onClick={()=>zoom(1.38)}><Minus size={16}/></button>
        <button title="Fit chart" onClick={()=>chartRef.current?.timeScale().fitContent()}><RotateCcw size={15}/></button>
      </div>

      <div className="axiom-chart-main">
        <div className="axiom-chart-legend">
          <span className="axiom-pair-title">{symbol||'TOKEN'}/{quote==='usd'?'USD':'SOL'} on {venue||'PAPER'} · {tf} · PAPER</span>
          <span className={'axiom-status-dot '+status.toLowerCase()}/>
          {latest&&<>
            <span>O <b>{formatDisplay(latest.open)}</b></span>
            <span>H <b>{formatDisplay(latest.high)}</b></span>
            <span>L <b>{formatDisplay(latest.low)}</b></span>
            <span>C <b>{formatDisplay(latest.close)}</b></span>
            <span className={summary.change>=0?'gain':'loss'}>{summary.change>=0?'+':''}{summary.change.toFixed(2)}%</span>
          </>}
        </div>

        <div className="axiom-live-strip">
          <span className={'chart-live-badge '+status.toLowerCase()}><i/>{loading?'SYNCING':status}</span>
          {mode==='marketCap'&&currentMarketCap?<span>MC {compact(quote==='usd'?Number(currentMarketCap):Number(currentMarketCap)/Math.max(solUsd,1),quote==='usd'?'$':'◎')}</span>:null}
          <span>{displayCandles.length} candles</span>
          <span>{compact(summary.volume)} vol</span>
        </div>

        <div className="lw-chart-wrap axiom-lw-wrap"><ChartDrawingOverlay chartRef={chartRef} seriesRef={candleRef} mode={mode} quote={quote} tool={drawingTool} onToolChange={setDrawingTool} clearSignal={drawingClearSignal}/>
          {!poolAddress&&<div className="chart-state">Select a token to load its chart.</div>}
          {poolAddress&&!displayCandles.length&&!error&&<div className="chart-state"><span className="chart-loader"/>Loading {timeframeLabel(tf)} market data…</div>}
          {error&&!displayCandles.length&&<div className="chart-state">{isSecondTf(tf)?'No recent trades for this sub-minute view · retrying automatically.':'Chart feed unavailable · retrying automatically.'}</div>}
          <div ref={wrap} className="lw-chart-canvas"/>
        </div>

        <div className="axiom-bottom-bar">
          <div className="axiom-range-buttons">
            <button onClick={()=>focusLast(180)}>3m</button>
            <button onClick={()=>focusLast(900)}>15m</button>
            <button onClick={()=>focusLast(3600)}>1h</button>
            <button onClick={()=>chartRef.current?.timeScale().fitContent()}>All</button>
          </div>
          <div className="axiom-chart-clock">{asOf?new Date(asOf).toLocaleTimeString():'—'} · {quote.toUpperCase()}</div>
          <div className="axiom-scale-buttons">
            <button className={scaleMode==='percent'?'active':''} onClick={()=>setScaleMode(v=>v==='percent'?'normal':'percent')}>%</button>
            <button className={scaleMode==='log'?'active':''} onClick={()=>setScaleMode(v=>v==='log'?'normal':'log')}>log</button>
            <button className={scaleMode==='normal'?'active':''} onClick={()=>{setScaleMode('normal');chartRef.current?.timeScale().fitContent()}}>auto</button>
          </div>
        </div>
      </div>
    </div>

    {error&&displayCandles.length>0&&<div className="axiom-chart-warning">{error}</div>}

    <div className="axiom-chart-mobile-controls">
      <div className="tf-picker" ref={pickerRef}>
        <button className={'tf-picker-button '+(tfOpen?'active':'')} aria-expanded={tfOpen} onClick={()=>setTfOpen(v=>!v)}>
          <span>{timeframeLabel(tf)}</span><ChevronDown size={14}/>
        </button>
        {tfOpen&&<div className="tf-picker-menu" role="menu">
          {timeframeGroups.map(group=><div className="tf-picker-section" key={group.label}>
            <div className="tf-picker-label">{group.label}</div>
            {group.items.map(item=><button key={item.value} role="menuitem" className={tf===item.value?'active':''} onClick={()=>chooseTimeframe(item.value)}>
              <span>{item.label}</span>{tf===item.value&&<Check size={14}/>}
            </button>)}
          </div>)}
        </div>}
      </div>
    </div>
  </div>
}
