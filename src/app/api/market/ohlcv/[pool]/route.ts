import { NextRequest, NextResponse } from 'next/server'

export const dynamic='force-dynamic'
type Candle={time:number;open:number;high:number;low:number;close:number;volume:number}
type GeckoResponse={data?:{attributes?:{ohlcv_list?:Array<[number,number,number,number,number,number]>}}}
type GeckoTrade={attributes?:{block_timestamp?:string;volume_in_usd?:string|number;price_usd?:string|number;price_from_in_usd?:string|number;price_to_in_usd?:string|number}}
type GeckoTradesResponse={data?:GeckoTrade[]}
type Config={unit:'minute'|'hour'|'day';aggregate:string;limit:number;bucketSeconds?:number;cacheMs:number;cdnSeconds:number}

const configs:Record<string,Config>={
  '1m':{unit:'minute',aggregate:'1',limit:300,cacheMs:15_000,cdnSeconds:12},
  '3m':{unit:'minute',aggregate:'1',limit:540,bucketSeconds:180,cacheMs:12_000,cdnSeconds:9},
  '5m':{unit:'minute',aggregate:'5',limit:300,cacheMs:14_000,cdnSeconds:10},
  '15m':{unit:'minute',aggregate:'15',limit:300,cacheMs:20_000,cdnSeconds:15},
  '30m':{unit:'minute',aggregate:'15',limit:360,bucketSeconds:1800,cacheMs:25_000,cdnSeconds:20},
  '1h':{unit:'hour',aggregate:'1',limit:300,cacheMs:30_000,cdnSeconds:25},
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

const firstPositive=(...values:unknown[])=>{for(const value of values){const n=Number(value);if(Number.isFinite(n)&&n>0)return n}return 0}

async function fetchTradeCandles(pool:string,bucketSeconds:number,signal:AbortSignal){
  const response=await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(pool)}/trades`,{cache:'no-store',signal,headers:{Accept:'application/json;version=20230203'}})
  if(!response.ok)throw new Error(`trades ${response.status}`)
  const json=await response.json() as GeckoTradesResponse
  const prints=(json.data||[]).map(item=>{const a=item.attributes||{},ms=Date.parse(String(a.block_timestamp||'')),price=firstPositive(a.price_usd,a.price_to_in_usd,a.price_from_in_usd),volume=firstPositive(a.volume_in_usd);return{time:Number.isFinite(ms)?Math.floor(ms/1000):0,price,volume}}).filter(p=>p.time>0&&p.price>0).sort((a,b)=>a.time-b.time)
  const groups=new Map<number,typeof prints>()
  for(const print of prints){const bucket=Math.floor(print.time/bucketSeconds)*bucketSeconds,list=groups.get(bucket)||[];list.push(print);groups.set(bucket,list)}
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([time,list])=>({time,open:list[0].price,high:Math.max(...list.map(x=>x.price)),low:Math.min(...list.map(x=>x.price)),close:list[list.length-1].price,volume:list.reduce((sum,x)=>sum+x.volume,0)})).slice(-300)
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
    const response=await fetch(url,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json;version=20230203'}})
    if(!response.ok)throw new Error(`OHLCV ${response.status}`)
    const json=await response.json() as GeckoResponse
    let candles=(json.data?.attributes?.ohlcv_list||[]).map(([time,open,high,low,close,volume])=>({time,open,high,low,close,volume})).filter(c=>[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time)
    if(config.bucketSeconds)candles=aggregateCandles(candles,config.bucketSeconds).slice(-180)
    if(tf==='1M')candles=candles.slice(-45)
    if(!candles.length)throw new Error('OHLCV returned no candles')
    const at=Date.now();cache.set(key,{at,candles})
    return NextResponse.json({candles,timeframe:tf,source:'geckoterminal',live:true,asOf:at},{headers:{'Cache-Control':`public, s-maxage=${config.cdnSeconds}, stale-while-revalidate=${Math.max(config.cdnSeconds*4,30)}`}})
  }catch(error){
    console.error('ohlcv_feed_error',{pool,tf,error})
    if(previous)return NextResponse.json({candles:previous.candles,timeframe:tf,source:'geckoterminal',live:false,stale:true,asOf:previous.at,warning:error instanceof Error?error.message:'chart unavailable'})
    return NextResponse.json({candles:[],error:error instanceof Error?error.message:'chart unavailable'},{status:502})
  }finally{clearTimeout(timer)}
}
