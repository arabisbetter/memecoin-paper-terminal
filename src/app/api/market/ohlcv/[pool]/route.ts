import { NextRequest, NextResponse } from 'next/server'

export const dynamic='force-dynamic'
type Candle={time:number;open:number;high:number;low:number;close:number;volume:number}
type GeckoResponse={data?:{attributes?:{ohlcv_list?:Array<[number,number,number,number,number,number]>}}}
type GeckoTrade={attributes?:{kind?:string;block_timestamp?:string;volume_in_usd?:string|number;price_usd?:string|number;price_from_in_usd?:string|number;price_to_in_usd?:string|number}}
type GeckoTradesResponse={data?:GeckoTrade[]}
type Config={unit:'minute'|'hour'|'day';aggregate:string;limit:number;bucketSeconds?:number;cacheMs:number;cdnSeconds:number}

const configs:Record<string,Config>={
  '1m':{unit:'minute',aggregate:'1',limit:300,cacheMs:30_000,cdnSeconds:20},
  '3m':{unit:'minute',aggregate:'1',limit:540,bucketSeconds:180,cacheMs:45_000,cdnSeconds:30},
  '5m':{unit:'minute',aggregate:'5',limit:300,cacheMs:60_000,cdnSeconds:30},
  '15m':{unit:'minute',aggregate:'15',limit:300,cacheMs:90_000,cdnSeconds:45},
  '30m':{unit:'minute',aggregate:'15',limit:360,bucketSeconds:1800,cacheMs:120_000,cdnSeconds:60},
  '1h':{unit:'hour',aggregate:'1',limit:300,cacheMs:180_000,cdnSeconds:90},
  '4h':{unit:'hour',aggregate:'4',limit:300,cacheMs:60_000,cdnSeconds:45},
  '6h':{unit:'hour',aggregate:'1',limit:720,bucketSeconds:21600,cacheMs:60_000,cdnSeconds:45},
  '12h':{unit:'hour',aggregate:'1',limit:720,bucketSeconds:43200,cacheMs:90_000,cdnSeconds:60},
  '24h':{unit:'day',aggregate:'1',limit:300,cacheMs:120_000,cdnSeconds:60},
  '1d':{unit:'day',aggregate:'1',limit:300,cacheMs:120_000,cdnSeconds:60},
  '1M':{unit:'day',aggregate:'1',limit:35,cacheMs:120_000,cdnSeconds:60},
}
const secondBuckets:Record<string,{seconds:number;cacheMs:number}>={
  '1s':{seconds:1,cacheMs:2500},
  '5s':{seconds:5,cacheMs:4500},
  '15s':{seconds:15,cacheMs:7000},
  '30s':{seconds:30,cacheMs:9500},
}
const cache=new Map<string,{at:number;candles:Candle[]}>()

function aggregateCandles(rows:Candle[],bucketSeconds:number){
  const groups=new Map<number,Candle[]>()
  for(const row of rows){const bucket=Math.floor(row.time/bucketSeconds)*bucketSeconds,list=groups.get(bucket)||[];list.push(row);groups.set(bucket,list)}
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([time,list])=>{const ordered=[...list].sort((a,b)=>a.time-b.time);return{time,open:ordered[0].open,high:Math.max(...ordered.map(x=>x.high)),low:Math.min(...ordered.map(x=>x.low)),close:ordered[ordered.length-1].close,volume:ordered.reduce((s,x)=>s+x.volume,0)}})
}

const timeframeSeconds:Record<string,number>={
  '1s':1,'5s':5,'15s':15,'30s':30,'1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,
  '1h':3600,'4h':14400,'6h':21600,'12h':43200,'24h':86400,'1d':86400,'1M':2592000,
}
function normalizeCandles(rows:Candle[],bucketSeconds:number,maxRows=420){
  if(!rows.length||bucketSeconds<=0)return[]
  const grouped=aggregateCandles(rows,bucketSeconds)
  if(!grouped.length)return[]
  const byTime=new Map(grouped.map(row=>[row.time,row]))
  const firstTime=grouped[0].time,lastTime=grouped[grouped.length-1].time
  const out:Candle[]=[]
  let previousClose=Number(grouped[0].open||grouped[0].close)
  for(let time=firstTime;time<=lastTime&&out.length<2000;time+=bucketSeconds){
    const row=byTime.get(time)
    if(row){
      const close=Number(row.close)>0?Number(row.close):previousClose
      const open=out.length?previousClose:Number(row.open||close)
      const high=Math.max(open,close,Number(row.high||close))
      const low=Math.min(open,close,Number(row.low||close))
      out.push({time,open,high,low,close,volume:Math.max(0,Number(row.volume||0))})
      previousClose=close
    }else if(previousClose>0){
      out.push({time,open:previousClose,high:previousClose,low:previousClose,close:previousClose,volume:0})
    }
  }
  return out.slice(-maxRows)
}

function deriveFromMinuteCache(pool:string,tf:string){
  const seconds=timeframeSeconds[tf]||0
  if(seconds<60||seconds%60!==0)return null
  const minute=cache.get(`${pool}:1m`)
  if(!minute||!minute.candles.length||Date.now()-minute.at>5*60_000)return null
  const candles=normalizeCandles(minute.candles,seconds,tf==='1M'?90:420)
  return candles.length?{candles,at:minute.at}:null
}

const firstPositive=(...values:unknown[])=>{for(const value of values){const n=Number(value);if(Number.isFinite(n)&&n>0)return n}return 0}

async function fetchTradeCandles(pool:string,bucketSeconds:number,signal:AbortSignal){
  const response=await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(pool)}/trades`,{cache:'force-cache',next:{revalidate:Math.max(3,bucketSeconds)},signal,headers:{Accept:'application/json;version=20230203'}})
  if(!response.ok)throw new Error(`trades ${response.status}`)
  const json=await response.json() as GeckoTradesResponse
  const prints=(json.data||[]).map(item=>{const a=item.attributes||{},ms=Date.parse(String(a.block_timestamp||'')),kind=String(a.kind||'').toLowerCase(),tokenSidePrice=kind==='sell'?a.price_from_in_usd:a.price_to_in_usd,oppositeSidePrice=kind==='sell'?a.price_to_in_usd:a.price_from_in_usd,price=firstPositive(a.price_usd,tokenSidePrice,oppositeSidePrice),volume=firstPositive(a.volume_in_usd);return{time:Number.isFinite(ms)?Math.floor(ms/1000):0,price,volume}}).filter(p=>p.time>0&&p.price>0).sort((a,b)=>a.time-b.time)
  const groups=new Map<number,typeof prints>()
  for(const print of prints){const bucket=Math.floor(print.time/bucketSeconds)*bucketSeconds,list=groups.get(bucket)||[];list.push(print);groups.set(bucket,list)}
  const raw=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([time,list])=>({time,open:list[0].price,high:Math.max(...list.map(x=>x.price)),low:Math.min(...list.map(x=>x.price)),close:list[list.length-1].price,volume:list.reduce((sum,x)=>sum+x.volume,0)}))
  return normalizeCandles(raw,bucketSeconds,300)
}

async function fetchRecentTradeFallback(pool:string,bucketSeconds:number){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6_000)
  try{return await fetchTradeCandles(pool,bucketSeconds,controller.signal)}
  finally{clearTimeout(timer)}
}

export async function GET(req:NextRequest,ctx:{params:Promise<{pool:string}>}){
  const {pool}=await ctx.params
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,60}$/.test(pool))return NextResponse.json({error:'Invalid pool address'},{status:400})
  const requested=req.nextUrl.searchParams.get('tf')||'1m'
  const secondConfig=secondBuckets[requested]
  const tf=secondConfig||configs[requested]?requested:'1m'
  const key=`${pool}:${tf}`,previous=cache.get(key)

  if(secondConfig){
    if(previous&&Date.now()-previous.at<secondConfig.cacheMs)return NextResponse.json({candles:previous.candles,timeframe:tf,source:'geckoterminal-trades',live:true,cached:true,asOf:previous.at})
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8_000)
    try{
      const candles=await fetchTradeCandles(pool,secondConfig.seconds,controller.signal)
      if(!candles.length)throw new Error('No recent trades available for sub-minute candles')
      const at=Date.now();cache.set(key,{at,candles})
      return NextResponse.json({candles,timeframe:tf,source:'geckoterminal-trades',live:true,asOf:at},{headers:{'Cache-Control':'public, s-maxage=2, stale-while-revalidate=8'}})
    }catch(error){
      console.error('subminute_ohlcv_error',{pool,tf,error})
      if(previous)return NextResponse.json({candles:previous.candles,timeframe:tf,source:'geckoterminal-trades',live:false,stale:true,asOf:previous.at,warning:error instanceof Error?error.message:'sub-minute chart unavailable'})
      return NextResponse.json({candles:[],error:error instanceof Error?error.message:'sub-minute chart unavailable'},{status:502})
    }finally{clearTimeout(timer)}
  }

  const config=configs[tf]
  if(previous&&Date.now()-previous.at<config.cacheMs)return NextResponse.json({candles:previous.candles,timeframe:tf,source:'geckoterminal',live:true,cached:true,asOf:previous.at})
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8_000)
  try{
    const url=new URL(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(pool)}/ohlcv/${config.unit}`)
    url.searchParams.set('aggregate',config.aggregate);url.searchParams.set('limit',String(config.limit));url.searchParams.set('currency','usd');url.searchParams.set('token','base');url.searchParams.set('include_empty_intervals','false')
    const response=await fetch(url,{cache:'force-cache',next:{revalidate:Math.max(10,config.cdnSeconds)},signal:controller.signal,headers:{Accept:'application/json;version=20230203'}})
    if(!response.ok)throw new Error(`OHLCV ${response.status}`)
    const json=await response.json() as GeckoResponse
    let candles=(json.data?.attributes?.ohlcv_list||[]).map(([time,open,high,low,close,volume])=>({time,open,high,low,close,volume})).filter(c=>[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time)
    if(config.bucketSeconds)candles=aggregateCandles(candles,config.bucketSeconds)
    candles=normalizeCandles(candles,timeframeSeconds[tf]||60,tf==='1M'?90:420)
    if(candles.length<2&&(timeframeSeconds[tf]||0)<=900){
      try{
        const recent=await fetchRecentTradeFallback(pool,timeframeSeconds[tf]||60)
        if(recent.length>candles.length)candles=recent
      }catch{}
    }
    if(!candles.length)throw new Error('OHLCV returned no candles')
    const at=Date.now();cache.set(key,{at,candles})
    return NextResponse.json({candles,timeframe:tf,source:'geckoterminal',live:true,asOf:at},{headers:{'Cache-Control':`public, s-maxage=${config.cdnSeconds}, stale-while-revalidate=${Math.max(config.cdnSeconds*4,30)}`}})
  }catch(error){
    console.error('ohlcv_feed_error',{pool,tf,error})
    if(previous)return NextResponse.json({candles:previous.candles,timeframe:tf,source:'geckoterminal',live:false,stale:true,asOf:previous.at,warning:error instanceof Error?error.message:'chart unavailable'})
    const minuteFallback=deriveFromMinuteCache(pool,tf)
    if(minuteFallback)return NextResponse.json({candles:minuteFallback.candles,timeframe:tf,source:'paper-1m-cache',live:false,stale:true,fallback:true,asOf:minuteFallback.at,warning:'Live '+tf+' provider refresh is temporarily limited. Showing candles derived from the latest real 1m feed.'},{headers:{'Cache-Control':'public, s-maxage=5, stale-while-revalidate=30'}})
    if((timeframeSeconds[tf]||0)>0&&(timeframeSeconds[tf]||0)<=900){
      try{
        const candles=await fetchRecentTradeFallback(pool,timeframeSeconds[tf]||60)
        if(candles.length){
          const at=Date.now();cache.set(key,{at,candles})
          return NextResponse.json({candles,timeframe:tf,source:'geckoterminal-trades',live:true,fallback:true,asOf:at,warning:'Primary OHLCV history is temporarily limited. Showing recent real trade candles.'},{headers:{'Cache-Control':'public, s-maxage=3, stale-while-revalidate=15'}})
        }
      }catch{}
    }
    return NextResponse.json({candles:[],error:error instanceof Error?error.message:'chart unavailable'},{status:502})
  }finally{clearTimeout(timer)}
}
