import { NextRequest, NextResponse } from 'next/server'

export const dynamic='force-dynamic'
type Candle={time:number;open:number;high:number;low:number;close:number;volume:number}
type GeckoResponse={data?:{attributes?:{ohlcv_list?:Array<[number,number,number,number,number,number]>}}}
type Config={unit:'minute'|'hour'|'day';aggregate:string;limit:number;bucketSeconds?:number;cacheMs:number;cdnSeconds:number}
const configs:Record<string,Config>={
  '1m':{unit:'minute',aggregate:'1',limit:180,cacheMs:10_000,cdnSeconds:8},
  '5m':{unit:'minute',aggregate:'5',limit:180,cacheMs:14_000,cdnSeconds:10},
  '15m':{unit:'minute',aggregate:'15',limit:180,cacheMs:20_000,cdnSeconds:15},
  '30m':{unit:'minute',aggregate:'15',limit:360,bucketSeconds:1800,cacheMs:25_000,cdnSeconds:20},
  '1h':{unit:'hour',aggregate:'1',limit:180,cacheMs:30_000,cdnSeconds:25},
  '4h':{unit:'hour',aggregate:'4',limit:180,cacheMs:60_000,cdnSeconds:45},
  '1d':{unit:'day',aggregate:'1',limit:180,cacheMs:120_000,cdnSeconds:60},
  '1M':{unit:'day',aggregate:'1',limit:35,cacheMs:120_000,cdnSeconds:60},
}
const cache=new Map<string,{at:number;candles:Candle[]}>()

function aggregateCandles(rows:Candle[],bucketSeconds:number){
  const groups=new Map<number,Candle[]>()
  for(const row of rows){const bucket=Math.floor(row.time/bucketSeconds)*bucketSeconds,list=groups.get(bucket)||[];list.push(row);groups.set(bucket,list)}
  return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([time,list])=>{const ordered=[...list].sort((a,b)=>a.time-b.time);return{time,open:ordered[0].open,high:Math.max(...ordered.map(x=>x.high)),low:Math.min(...ordered.map(x=>x.low)),close:ordered[ordered.length-1].close,volume:ordered.reduce((s,x)=>s+x.volume,0)}})
}

export async function GET(req:NextRequest,ctx:{params:Promise<{pool:string}>}){
  const {pool}=await ctx.params
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,60}$/.test(pool))return NextResponse.json({error:'Invalid pool address'},{status:400})
  const requested=req.nextUrl.searchParams.get('tf')||'1m',tf=configs[requested]?requested:'1m',config=configs[tf],key=`${pool}:${tf}`,previous=cache.get(key)
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
    if(tf==='1M')candles=candles.slice(-30)
    if(!candles.length)throw new Error('OHLCV returned no candles')
    const at=Date.now();cache.set(key,{at,candles})
    return NextResponse.json({candles,timeframe:tf,source:'geckoterminal',live:true,asOf:at},{headers:{'Cache-Control':`public, s-maxage=${config.cdnSeconds}, stale-while-revalidate=${Math.max(config.cdnSeconds*4,30)}`}})
  }catch(error){
    console.error('ohlcv_feed_error',{pool,tf,error})
    if(previous)return NextResponse.json({candles:previous.candles,timeframe:tf,source:'geckoterminal',live:false,stale:true,asOf:previous.at,warning:error instanceof Error?error.message:'chart unavailable'})
    return NextResponse.json({candles:[],error:error instanceof Error?error.message:'chart unavailable'},{status:502})
  }finally{clearTimeout(timer)}
}
