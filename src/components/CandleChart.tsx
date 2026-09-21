'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Camera, Check, ChevronDown, Crosshair, Eye, Maximize2, Minimize2,
  Minus, Plus, Redo2, RotateCcw, SlidersHorizontal, Undo2, TrendingUp, Square, MoveRight, Trash2
} from 'lucide-react'
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, PriceScaleMode,
  createChart, createSeriesMarkers, type IChartApi, type ISeriesApi, type UTCTimestamp
} from 'lightweight-charts'
import { createClient } from '@/lib/supabase/client'
import { logClientError } from '@/lib/client-telemetry'
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
const quickTfs:Timeframe[]=['1s','5s','1m','5m']
const tfSeconds:Record<Timeframe,number>={'1s':1,'5s':5,'15s':15,'30s':30,'1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'6h':21600,'12h':43200,'24h':86400,'1M':2592000}
const timeframeLabel=(tf:Timeframe)=>timeframeGroups.flatMap(g=>g.items).find(x=>x.value===tf)?.label||tf
const isSecondTf=(tf:Timeframe)=>tf.endsWith('s')
const refreshMs=(tf:Timeframe)=>tf==='1s'?3000:tf==='5s'?5000:tf==='15s'?7500:tf==='30s'?10000:tf==='1m'?30000:tf==='3m'?45000:tf==='5m'?60000:tf==='15m'||tf==='30m'?90000:tf==='1h'?120000:tf==='4h'||tf==='6h'?180000:tf==='12h'?240000:300000
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
const sma=(rows:Candle[],period:number)=>{
  if(period<=0||rows.length<period)return[]
  const points:{time:UTCTimestamp;value:number}[]=[]
  let sum=0
  for(let i=0;i<rows.length;i++){
    sum+=rows[i].close
    if(i>=period)sum-=rows[i-period].close
    if(i>=period-1)points.push({time:rows[i].time as UTCTimestamp,value:sum/period})
  }
  return points
}
const bollinger=(rows:Candle[],period=20,deviations=2)=>{
  const upper:{time:UTCTimestamp;value:number}[]=[],middle:{time:UTCTimestamp;value:number}[]=[],lower:{time:UTCTimestamp;value:number}[]=[]
  if(period<=0||rows.length<period)return{upper,middle,lower}
  for(let i=period-1;i<rows.length;i++){
    const window=rows.slice(i-period+1,i+1).map(row=>row.close)
    const mean=window.reduce((sum,value)=>sum+value,0)/period
    const variance=window.reduce((sum,value)=>sum+(value-mean)*(value-mean),0)/period
    const sd=Math.sqrt(variance)
    const time=rows[i].time as UTCTimestamp
    middle.push({time,value:mean})
    upper.push({time,value:mean+deviations*sd})
    lower.push({time,value:mean-deviations*sd})
  }
  return{upper,middle,lower}
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
  const ema50Ref=useRef<ISeriesApi<'Line'>|null>(null)
  const sma20Ref=useRef<ISeriesApi<'Line'>|null>(null)
  const sma50Ref=useRef<ISeriesApi<'Line'>|null>(null)
  const bbUpperRef=useRef<ISeriesApi<'Line'>|null>(null)
  const bbMiddleRef=useRef<ISeriesApi<'Line'>|null>(null)
  const bbLowerRef=useRef<ISeriesApi<'Line'>|null>(null)
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
  const activePoolRef=useRef<string|undefined>(undefined)
  const fittedKeyRef=useRef('')
  const chartRequestGeneration=useRef(0)

  const [tf,setTf]=useState<Timeframe>('1m')
  const [tfOpen,setTfOpen]=useState(false)
  const [mode,setMode]=useState<ChartMode>('price')
  const [quote,setQuote]=useState<QuoteMode>('usd')
  const [scaleMode,setScaleMode]=useState<ScaleMode>('log')
  const [candles,setCandles]=useState<Candle[]>([])
  const [hover,setHover]=useState<Candle|null>(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const [status,setStatus]=useState<'LIVE'|'DEGRADED'|'STALE'>('DEGRADED')
  const [asOf,setAsOf]=useState(0)
  const [liveClock,setLiveClock]=useState(()=>Date.now())
  const [expanded,setExpanded]=useState(false)
  const [indicatorOpen,setIndicatorOpen]=useState(false)
  const [displayOpen,setDisplayOpen]=useState(false)
  const [showVolume,setShowVolume]=useState(true)
  const [showGrid,setShowGrid]=useState(true)
  const [showCrosshair,setShowCrosshair]=useState(true)
  const [showEma9,setShowEma9]=useState(false)
  const [showEma21,setShowEma21]=useState(false)
  const [showVwap,setShowVwap]=useState(false)
  const [showEma50,setShowEma50]=useState(false)
  const [showSma20,setShowSma20]=useState(false)
  const [showSma50,setShowSma50]=useState(false)
  const [showBollinger,setShowBollinger]=useState(false)
  const [showTradeMarkers,setShowTradeMarkers]=useState(true)
  const [trades,setTrades]=useState<PaperTradeMarker[]>([])
  const [drawingTool,setDrawingTool]=useState<DrawingTool>('none'),[drawingClearSignal,setDrawingClearSignal]=useState(0)
  const [levelVersion,setLevelVersion]=useState(0),[undoCount,setUndoCount]=useState(0),[redoCount,setRedoCount]=useState(0)

  const impliedSupply=useMemo(()=>{
    const price=Number(currentPrice||0),mc=Number(currentMarketCap||0)
    return price>0&&mc>0?mc/price:0
  },[currentPrice,currentMarketCap])
  const mcAvailable=impliedSupply>0
  const solUsd=Number(currentSolUsd||0)
  const solAvailable=solUsd>0

  useEffect(()=>{const start=window.setTimeout(()=>{if(mcAvailable&&!userPickedMode.current)setMode('marketCap');if(!mcAvailable&&mode==='marketCap')setMode('price')},0);return()=>clearTimeout(start)},[mcAvailable,mode])
  useEffect(()=>{if(quote!=='sol'||solAvailable)return;const start=window.setTimeout(()=>setQuote('usd'),0);return()=>clearTimeout(start)},[quote,solAvailable])
  useEffect(()=>{const start=window.setTimeout(()=>setHover(null),0);return()=>clearTimeout(start)},[mode,quote])
  useEffect(()=>{const tick=()=>setLiveClock(Date.now()),id=window.setInterval(tick,1000);return()=>clearInterval(id)},[])

  useEffect(()=>{
    const start=window.setTimeout(()=>{
    try{
      const v3=localStorage.getItem('paper.chart.workspace.v3')
      const saved=JSON.parse(v3||localStorage.getItem('paper.chart.workspace.v2')||'{}')
      if(saved.tf&&timeframeGroups.flatMap(g=>g.items).some(i=>i.value===saved.tf)){const savedTf=saved.tf as Timeframe;setTf(savedTf==='1s'?'1m':savedTf)}
      if(saved.mode==='price'||saved.mode==='marketCap'){setMode(saved.mode);userPickedMode.current=true}
      if(saved.quote==='usd'||saved.quote==='sol')setQuote(saved.quote)
      if(v3&&(saved.scaleMode==='normal'||saved.scaleMode==='percent'||saved.scaleMode==='log'))setScaleMode(saved.scaleMode)
      else setScaleMode('log')
      if(typeof saved.showVolume==='boolean')setShowVolume(saved.showVolume)
      if(typeof saved.showGrid==='boolean')setShowGrid(saved.showGrid)
      if(typeof saved.showCrosshair==='boolean')setShowCrosshair(saved.showCrosshair)
      if(typeof saved.showEma9==='boolean')setShowEma9(saved.showEma9)
      if(typeof saved.showEma21==='boolean')setShowEma21(saved.showEma21)
      if(typeof saved.showVwap==='boolean')setShowVwap(saved.showVwap)
      if(typeof saved.showEma50==='boolean')setShowEma50(saved.showEma50)
      if(typeof saved.showSma20==='boolean')setShowSma20(saved.showSma20)
      if(typeof saved.showSma50==='boolean')setShowSma50(saved.showSma50)
      if(typeof saved.showBollinger==='boolean')setShowBollinger(saved.showBollinger)
      if(typeof saved.showTradeMarkers==='boolean')setShowTradeMarkers(saved.showTradeMarkers)
      if(Array.isArray(saved.levels))userLevels.current=saved.levels.filter((l:any)=>Number(l?.price)>0&&(l?.mode==='price'||l?.mode==='marketCap')&&(l?.quote==='usd'||l?.quote==='sol')).slice(0,25)
    }catch{}
    workspaceLoaded.current=true
    setUndoCount(userLevels.current.length);setRedoCount(redoLevels.current.length);setLevelVersion(v=>v+1)
    },0)
    return()=>clearTimeout(start)
  },[])

  useEffect(()=>{
    if(!workspaceLoaded.current)return
    localStorage.setItem('paper.chart.workspace.v3',JSON.stringify({
      tf,mode,quote,scaleMode,showVolume,showGrid,showCrosshair,showEma9,showEma21,showEma50,showSma20,showSma50,showVwap,showBollinger,showTradeMarkers,
      levels:userLevels.current
    }))
  },[tf,mode,quote,scaleMode,showVolume,showGrid,showCrosshair,showEma9,showEma21,showEma50,showSma20,showSma50,showVwap,showBollinger,showTradeMarkers,levelVersion])

  useEffect(()=>{
    if(!wrap.current)return
    const chart=createChart(wrap.current,{
      autoSize:true,
      layout:{background:{type:ColorType.Solid,color:'#0a0b0d'},textColor:'#b4bac4',fontSize:12,fontFamily:'Inter,ui-sans-serif,system-ui,sans-serif'},
      grid:{vertLines:{color:'#1d232c'},horzLines:{color:'#1d232c'}},
      crosshair:{
        mode:CrosshairMode.Normal,
        vertLine:{color:'#677181',width:1,labelBackgroundColor:'#262d36'},
        horzLine:{color:'#677181',width:1,labelBackgroundColor:'#262d36'}
      },
      rightPriceScale:{borderColor:'#242a32',scaleMargins:{top:.07,bottom:.16},entireTextOnly:true,ticksVisible:true,minimumWidth:86},
      timeScale:{borderColor:'#242a32',timeVisible:true,secondsVisible:true,rightOffset:8,barSpacing:7,minBarSpacing:2,maxBarSpacing:9,fixLeftEdge:false,fixRightEdge:false},
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
    const ema50Series=chart.addSeries(LineSeries,{color:'#ff7b72',lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
    const sma20Series=chart.addSeries(LineSeries,{color:'#4dd0a8',lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
    const sma50Series=chart.addSeries(LineSeries,{color:'#f0d45c',lineWidth:1,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
    const bbUpperSeries=chart.addSeries(LineSeries,{color:'#7f8c9f',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
    const bbMiddleSeries=chart.addSeries(LineSeries,{color:'#657286',lineWidth:1,lineStyle:LineStyle.Dotted,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
    const bbLowerSeries=chart.addSeries(LineSeries,{color:'#7f8c9f',lineWidth:1,lineStyle:LineStyle.Dashed,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})

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
    ema50Ref.current=ema50Series
    sma20Ref.current=sma20Series
    sma50Ref.current=sma50Series
    bbUpperRef.current=bbUpperSeries
    bbMiddleRef.current=bbMiddleSeries
    bbLowerRef.current=bbLowerSeries
    return()=>{
      chart.remove()
      chartRef.current=null
      candleRef.current=null
      volumeRef.current=null
      ema9Ref.current=null
      ema21Ref.current=null
      vwapRef.current=null
      ema50Ref.current=null
      sma20Ref.current=null
      sma50Ref.current=null
      bbUpperRef.current=null
      bbMiddleRef.current=null
      bbLowerRef.current=null
      priceLineRef.current=null
      costLineRef.current=null
      tradeMarkersRef.current=null
      userPriceLines.current=[]
    }
  },[])

  useEffect(()=>{
    chartRef.current?.timeScale().applyOptions({
      timeVisible:true,secondsVisible:isSecondTf(tf),rightOffset:isSecondTf(tf)?8:6,
      barSpacing:isSecondTf(tf)?6:7,minBarSpacing:2,maxBarSpacing:9
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
    if(!poolAddress){activePoolRef.current=undefined;const reset=window.setTimeout(()=>{setCandles([]);setError('');setStatus('DEGRADED')},0);return()=>clearTimeout(reset)}
    activePoolRef.current=poolAddress
    fittedKeyRef.current=''
    let alive=true,inFlight=false
    const generation=++chartRequestGeneration.current
    let activeController:AbortController|null=null
    async function load(force=false){
      if(inFlight||(!force&&document.hidden))return
      inFlight=true
      activeController?.abort()
      const controller=new AbortController()
      activeController=controller
      if(alive&&!hasDataRef.current)setLoading(true)
      try{
        const response=await fetch('/api/market/ohlcv/'+encodeURIComponent(poolAddress!)+'?tf='+tf,{cache:'no-store',signal:controller.signal})
        const json=await response.json()
        if(!response.ok)throw new Error(json.error||'chart unavailable')
        if(!Array.isArray(json.candles)||!json.candles.length)throw new Error(json.error||'chart returned zero candles')
        if(alive&&generation===chartRequestGeneration.current){
          setCandles(json.candles)
          setError(json.warning||'')
          setAsOf(Number(json.asOf||Date.now()))
          setStatus(json.stale?'STALE':json.warning||json.live===false?'DEGRADED':'LIVE')
        }
      }catch(e){
        if((e as Error)?.name!=='AbortError'){
          void logClientError('chart',e,{poolAddress:String(poolAddress||''),timeframe:tf})
          if(alive&&generation===chartRequestGeneration.current){setError(e instanceof Error?e.message:'chart unavailable');setStatus('DEGRADED')}
        }
      }finally{
        inFlight=false
        if(alive&&generation===chartRequestGeneration.current)setLoading(false)
      }
    }
    const start=window.setTimeout(()=>{setCandles([]);setStatus('DEGRADED');setHover(null);setError('');void load(true)},0)
    const id=window.setInterval(()=>void load(),refreshMs(tf))
    const visible=()=>{if(!document.hidden)void load(true)}
    document.addEventListener('visibilitychange',visible)
    return()=>{alive=false;clearTimeout(start);activeController?.abort();clearInterval(id);document.removeEventListener('visibilitychange',visible)}
  },[poolAddress,tf])

  useEffect(()=>{
    if(!supabase||!tokenId){const reset=window.setTimeout(()=>setTrades([]),0);return()=>clearTimeout(reset)}
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
    const start=window.setTimeout(()=>void loadTrades(),0)
    const id=window.setInterval(()=>void loadTrades(),8000)
    const changed=()=>void loadTrades()
    window.addEventListener('paper:account-changed',changed)
    return()=>{alive=false;clearTimeout(start);clearInterval(id);window.removeEventListener('paper:account-changed',changed)}
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
    const grouped=new Map<string,{time:number;side:'buy'|'sell';count:number}>()
    for(const trade of trades){
      const timestamp=Math.floor(new Date(trade.ts).getTime()/1000)
      if(!Number.isFinite(timestamp)||timestamp<first-86400||timestamp>last+86400)continue
      const time=nearest(timestamp),side=trade.action==='buy'?'buy':'sell',key=`${time}:${side}`
      const previous=grouped.get(key)
      grouped.set(key,{time,side,count:(previous?.count||0)+1})
    }
    const markers=[...grouped.values()].map(marker=>({
      time:marker.time as UTCTimestamp,
      position:marker.side==='buy'?'belowBar':'aboveBar',
      color:marker.side==='buy'?'#17d7aa':'#ff4d77',
      shape:marker.side==='buy'?'arrowUp':'arrowDown',
      text:marker.count>1?`${marker.side==='buy'?'BUY':'SELL'} ×${marker.count}`:(marker.side==='buy'?'BUY':'SELL'),
      size:.8,
    }))
    primitive.setMarkers(markers as any)
  },[candles,trades,showTradeMarkers])

  const liveCandles=useMemo(()=>{
    const price=Number(currentPrice||0)
    if(!candles.length||!Number.isFinite(price)||price<=0)return candles
    const rows=candles.map(row=>({...row}))
    const seconds=tfSeconds[tf]||60
    const bucket=Math.floor(Math.floor(liveClock/1000)/seconds)*seconds
    const last=rows[rows.length-1]
    if(bucket<last.time)return rows
    if(bucket===last.time){
      rows[rows.length-1]={...last,high:Math.max(last.high,price),low:Math.min(last.low,price),close:price}
      return rows
    }
    const open=last.close>0?last.close:price
    rows.push({time:bucket,open,high:Math.max(open,price),low:Math.min(open,price),close:price,volume:0})
    return rows.slice(-420)
  },[candles,currentPrice,tf,liveClock])

  const multiplier=useMemo(()=>{
    const base=mode==='marketCap'&&mcAvailable?impliedSupply:1
    const quoteFactor=quote==='sol'&&solAvailable?1/solUsd:1
    return base*quoteFactor
  },[mode,mcAvailable,impliedSupply,quote,solAvailable,solUsd])

  const displayCandles=useMemo(()=>liveCandles.map(c=>({
    ...c,open:c.open*multiplier,high:c.high*multiplier,low:c.low*multiplier,close:c.close*multiplier
  })),[liveCandles,multiplier])

  useEffect(()=>{
    const candle=candleRef.current,volume=volumeRef.current
    if(!candle||!volume||!displayCandles.length)return

    const first=displayCandles[0].time
    const last=displayCandles[displayCandles.length-1].time
    const previous=renderedRef.current
    const candlePoint=(c:Candle)=>{
      const empty=Number(c.volume||0)===0
      return{time:c.time as UTCTimestamp,open:c.open,high:c.high,low:c.low,close:c.close,...(empty?{color:'#5f6773',borderColor:'#5f6773',wickColor:'#5f6773'}:{})}
    }
    const volumePoint=(c:Candle)=>({time:c.time as UTCTimestamp,value:c.volume,color:Number(c.volume||0)===0?'rgba(95,103,115,.45)':c.close>=c.open?'rgba(34,197,94,.28)':'rgba(239,68,68,.25)'})

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
    ema50Ref.current?.setData(showEma50?ema(displayCandles,50):[])
    sma20Ref.current?.setData(showSma20?sma(displayCandles,20):[])
    sma50Ref.current?.setData(showSma50?sma(displayCandles,50):[])
    vwapRef.current?.setData(showVwap?vwap(displayCandles):[])
    const bands=showBollinger?bollinger(displayCandles,20,2):{upper:[],middle:[],lower:[]}
    bbUpperRef.current?.setData(bands.upper)
    bbMiddleRef.current?.setData(bands.middle)
    bbLowerRef.current?.setData(bands.lower)

    renderedRef.current={first,last,mode,quote}
    hasDataRef.current=true
    const fitKey=(poolAddress||'')+':'+tf
    if(fittedKeyRef.current!==fitKey){
      fittedKeyRef.current=fitKey
      requestAnimationFrame(()=>{
        const scale=chartRef.current?.timeScale()
        if(!scale)return
        if(displayCandles.length<48){
          scale.setVisibleLogicalRange({from:displayCandles.length-72,to:displayCandles.length+8})
        }else if(displayCandles.length>110){
          scale.setVisibleLogicalRange({from:displayCandles.length-105,to:displayCandles.length+6})
        }else{
          scale.fitContent()
        }
      })
    }else{
      requestAnimationFrame(()=>{
        const scale=chartRef.current?.timeScale()
        if(!scale)return
        const position=scale.scrollPosition()
        if(Number.isFinite(position)&&position<3)scale.scrollToRealTime()
      })
    }
  },[displayCandles,mode,quote,showEma9,showEma21,showEma50,showSma20,showSma50,showVwap,showBollinger,poolAddress,tf])

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
    fittedKeyRef.current=''
    chartRef.current?.priceScale('right').applyOptions({autoScale:true})
    setMode(next)
  }
  function toggleQuote(){
    if(!solAvailable)return
    fittedKeyRef.current=''
    chartRef.current?.priceScale('right').applyOptions({autoScale:true})
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
    setUndoCount(userLevels.current.length);setRedoCount(0);setLevelVersion(v=>v+1)
  }
  function undoLevel(){
    const series=candleRef.current
    const line=userPriceLines.current.pop()
    const level=userLevels.current.pop()
    if(series&&line)series.removePriceLine(line)
    if(level)redoLevels.current.push(level)
    setUndoCount(userLevels.current.length);setRedoCount(redoLevels.current.length);setLevelVersion(v=>v+1)
  }
  function redoLevel(){
    const series=candleRef.current
    const level=redoLevels.current.pop()
    if(!series||!level)return
    userLevels.current.push(level)
    setUndoCount(userLevels.current.length);setRedoCount(redoLevels.current.length);setLevelVersion(v=>v+1)
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

  return <div className={'chart-card lw-chart-card p23-chart axiom-chart '+(expanded?'expanded':'')} data-chart-close={latest?.close??''} data-current-chart-value={currentDisplayValue||''} data-chart-mode={mode} data-chart-quote={quote}>
    <div className="axiom-chart-toolbar">
      <div className="axiom-quick-tfs">
        {quickTfs.map(value=><button type="button" aria-label={'Chart timeframe '+value} key={value} className={tf===value?'active':''} onClick={()=>chooseTimeframe(value)}>{value}</button>)}
      </div>

      <div className="axiom-toolbar-separator"/>
      <span className="axiom-tool-label active"><Activity size={13}/>Candles</span>

      <div className="axiom-popover-wrap">
        <button className={(indicatorOpen?'active ':'')+'axiom-tool-label'} onClick={()=>{setIndicatorOpen(v=>!v);setDisplayOpen(false)}}><SlidersHorizontal size={13}/>Indicators</button>
        {indicatorOpen&&<div className="axiom-popover indicator-popover">
          <b>INDICATORS</b>
          <label><input type="checkbox" checked={showEma9} onChange={e=>setShowEma9(e.target.checked)}/>EMA 9 <i className="ema9-dot"/></label>
          <label><input type="checkbox" checked={showEma21} onChange={e=>setShowEma21(e.target.checked)}/>EMA 21 <i className="ema21-dot"/></label>
          <label><input type="checkbox" checked={showEma50} onChange={e=>setShowEma50(e.target.checked)}/>EMA 50 <i className="ema50-dot"/></label>
          <label><input type="checkbox" checked={showSma20} onChange={e=>setShowSma20(e.target.checked)}/>SMA 20 <i className="sma20-dot"/></label>
          <label><input type="checkbox" checked={showSma50} onChange={e=>setShowSma50(e.target.checked)}/>SMA 50 <i className="sma50-dot"/></label>
          <label><input type="checkbox" checked={showVwap} onChange={e=>setShowVwap(e.target.checked)}/>VWAP <i className="vwap-dot"/></label>
          <label><input type="checkbox" checked={showBollinger} onChange={e=>setShowBollinger(e.target.checked)}/>Bollinger 20 <i className="bollinger-dot"/></label>
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
      <div className="axiom-switch-group" role="group" aria-label="Chart quote currency"><button type="button" className={quote==='usd'?'active':''} onClick={()=>{if(quote!=='usd')toggleQuote()}}>USD</button><button type="button" className={quote==='sol'?'active':''} disabled={!solAvailable} onClick={()=>{if(quote!=='sol')toggleQuote()}}>SOL</button></div>
      <div className="axiom-switch-group" role="group" aria-label="Chart value mode"><button type="button" className={mode==='price'?'active':''} onClick={()=>chooseMode('price')}>Price</button><button type="button" className={mode==='marketCap'?'active':''} disabled={!mcAvailable} onClick={()=>chooseMode('marketCap')}>MarketCap</button></div>

      <div className="axiom-toolbar-separator"/>
      <button className="axiom-icon-button" disabled={!undoCount} onClick={undoLevel} title="Undo level"><Undo2 size={14}/></button>
      <button className="axiom-icon-button" disabled={!redoCount} onClick={redoLevel} title="Redo level"><Redo2 size={14}/></button>

      <div className="axiom-chart-brand">PAPER</div>
      <button className="axiom-icon-button" onClick={()=>setExpanded(v=>!v)} title={expanded?'Exit fullscreen':'Fullscreen'}>{expanded?<Minimize2 size={14}/>:<Maximize2 size={14}/>}</button>
      <button className="axiom-icon-button" onClick={saveScreenshot} title="Save chart image"><Camera size={14}/></button>
    </div>

    <div className="axiom-chart-body">
      <div className="axiom-draw-rail">
        <button className={drawingTool==='none'?'active':''} title="Crosshair" onClick={()=>setDrawingTool('none')}><Crosshair size={16}/></button>
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
