import { NextRequest, NextResponse } from 'next/server'

export const dynamic='force-dynamic'

type Candle={time:number;open:number;high:number;low:number;close:number;volume:number}
type CacheRow={at:number;body:unknown}
const cache=new Map<string,CacheRow>()
const TTL=15_000

function ema(values:number[],period:number){
  if(!values.length)return[]
  const alpha=2/(period+1);let v=values[0]
  return values.map((x,i)=>{v=i===0?x:x*alpha+v*(1-alpha);return v})
}
function rsi(values:number[],period=14){
  if(values.length<period+1)return null
  let gains=0,losses=0
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>=0)gains+=d;else losses-=d}
  let avgGain=gains/period,avgLoss=losses/period
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];avgGain=(avgGain*(period-1)+Math.max(0,d))/period;avgLoss=(avgLoss*(period-1)+Math.max(0,-d))/period}
  if(avgLoss===0)return 100
  const rs=avgGain/avgLoss
  return 100-100/(1+rs)
}
function std(values:number[]){if(!values.length)return 0;const m=values.reduce((a,b)=>a+b,0)/values.length;return Math.sqrt(values.reduce((s,v)=>s+(v-m)*(v-m),0)/values.length)}
function tfSpec(tf:string){if(tf==='5m')return['minute',5] as const;if(tf==='15m')return['minute',15] as const;if(tf==='1h')return['hour',1] as const;return['minute',1] as const}

export async function GET(req:NextRequest,ctx:{params:Promise<{pool:string}>}){
  const {pool}=await ctx.params
  if(!pool)return NextResponse.json({error:'pool required'},{status:400})
  const tf=req.nextUrl.searchParams.get('tf')||'1m'
  const key=pool+':'+tf,hit=cache.get(key)
  if(hit&&Date.now()-hit.at<TTL)return NextResponse.json({...hit.body as object,cached:true},{headers:{'Cache-Control':'public, s-maxage=10, stale-while-revalidate=30'}})
  try{
    const [unit,aggregate]=tfSpec(tf)
    const url='https://api.geckoterminal.com/api/v2/networks/solana/pools/'+encodeURIComponent(pool)+'/ohlcv/'+unit+'?aggregate='+aggregate+'&limit=250&currency=usd&token=base&include_empty_intervals=false'
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000)
    const r=await fetch(url,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json;version=20230203'}}).finally(()=>clearTimeout(timer))
    if(!r.ok)throw new Error('GeckoTerminal '+r.status)
    const j=await r.json()
    const raw=(j?.data?.attributes?.ohlcv_list||[]) as Array<[number,number,number,number,number,number]>
    const rows:Candle[]=raw.map(x=>({time:Number(x[0]),open:Number(x[1]),high:Number(x[2]),low:Number(x[3]),close:Number(x[4]),volume:Number(x[5])})).filter(x=>Number.isFinite(x.close)&&x.close>0).sort((a,b)=>a.time-b.time)
    if(rows.length<30)throw new Error('not enough live candles for indicators')
    const closes=rows.map(x=>x.close),e9=ema(closes,9),e21=ema(closes,21),e12=ema(closes,12),e26=ema(closes,26)
    const macd=e12.map((v,i)=>v-e26[i]),signal=ema(macd,9),last=rows.at(-1)!
    const window20=closes.slice(-20),mid=window20.reduce((a,b)=>a+b,0)/window20.length,sd=std(window20)
    let cumVol=0,cumPv=0
    for(const row of rows){const v=Math.max(0,row.volume),typ=(row.high+row.low+row.close)/3;cumVol+=v;cumPv+=typ*v}
    const body={
      live:true,cached:false,asOf:Date.now(),source:'geckoterminal',timeframe:tf,candles:rows.length,
      price:last.close,
      indicators:{
        ema9:e9.at(-1),ema21:e21.at(-1),vwap:cumVol>0?cumPv/cumVol:last.close,rsi14:rsi(closes,14),
        macd:{line:macd.at(-1),signal:signal.at(-1),histogram:Number(macd.at(-1)||0)-Number(signal.at(-1)||0)},
        bollinger20:{upper:mid+2*sd,middle:mid,lower:mid-2*sd}
      }
    }
    cache.set(key,{at:Date.now(),body})
    if(cache.size>200){const oldest=[...cache.entries()].sort((a,b)=>a[1].at-b[1].at).slice(0,50);for(const [k] of oldest)cache.delete(k)}
    return NextResponse.json(body,{headers:{'Cache-Control':'public, s-maxage=10, stale-while-revalidate=30'}})
  }catch(error){
    if(hit)return NextResponse.json({...hit.body as object,cached:true,stale:true,warning:error instanceof Error?error.message:'indicator refresh failed'})
    return NextResponse.json({error:error instanceof Error?error.message:'indicators unavailable'},{status:502})
  }
}
