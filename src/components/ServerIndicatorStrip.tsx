'use client'

import { useEffect, useState } from 'react'

type Data={
  live?:boolean;cached?:boolean;stale?:boolean;timeframe?:string;asOf?:number;error?:string
  indicators?:{ema9?:number;ema21?:number;vwap?:number;rsi14?:number|null;macd?:{line?:number;signal?:number;histogram?:number};bollinger20?:{upper?:number;middle?:number;lower?:number};atr14?:number|null;stochastic14?:{k?:number|null;d?:number|null};roc12?:number|null}
}
const num=(n:unknown,d=4)=>Number.isFinite(Number(n))?Number(n).toPrecision(d):'—'

export default function ServerIndicatorStrip({pool,timeframe}:{pool?:string;timeframe:string}){
  const [data,setData]=useState<Data|null>(null)
  useEffect(()=>{
    if(!pool){const reset=window.setTimeout(()=>setData(null),0);return()=>clearTimeout(reset)}
    let alive=true,inFlight=false
    const tf=['5m','15m','1h'].includes(timeframe)?timeframe:'1m'
    async function load(){
      if(inFlight)return
      inFlight=true
      try{const r=await fetch('/api/market/indicators/'+encodeURIComponent(pool!)+'?tf='+tf,{cache:'no-store'}),j=await r.json();if(alive)setData(r.ok?j:{error:j.error||'indicators unavailable'})}
      catch(e){if(alive)setData({error:e instanceof Error?e.message:'indicators unavailable'})}
      finally{inFlight=false}
    }
    const start=window.setTimeout(()=>void load(),0);const id=window.setInterval(()=>{if(!document.hidden)void load()},30000)
    return()=>{alive=false;clearTimeout(start);clearInterval(id)}
  },[pool,timeframe])
  if(!pool)return null
  if(!data||data.error)return <div className="server-indicator-strip degraded"><span>SERVER INDICATORS</span><small>{data?.error||'SYNCING…'}</small></div>
  const i=data.indicators||{},rsi=Number(i.rsi14||0),hist=Number(i.macd?.histogram||0),stoch=Number(i.stochastic14?.k),roc=Number(i.roc12)
  return <div className={'server-indicator-strip '+(data.stale?'degraded':'live')}>
    <span><b>SERVER</b><small>{data.timeframe||'1m'} · {data.cached?'CACHED':'LIVE'}</small></span>
    <span><small>EMA 9</small><b>{num(i.ema9)}</b></span>
    <span><small>EMA 21</small><b>{num(i.ema21)}</b></span>
    <span><small>VWAP</small><b>{num(i.vwap)}</b></span>
    <span><small>RSI 14</small><b className={rsi>=70?'loss':rsi<=30?'gain':''}>{Number.isFinite(rsi)?rsi.toFixed(1):'—'}</b></span>
    <span><small>MACD HIST</small><b className={hist>=0?'gain':'loss'}>{Number.isFinite(hist)?hist.toPrecision(3):'—'}</b></span>
    <span><small>BB 20</small><b>{num(i.bollinger20?.lower,3)} / {num(i.bollinger20?.upper,3)}</b></span>
    <span><small>ATR 14</small><b>{num(i.atr14,4)}</b></span>
    <span><small>STOCH 14</small><b className={stoch>=80?'loss':stoch<=20?'gain':''}>{Number.isFinite(stoch)?stoch.toFixed(1):'—'}</b></span>
    <span><small>ROC 12</small><b className={roc>=0?'gain':'loss'}>{Number.isFinite(roc)?`${roc>=0?'+':''}${roc.toFixed(2)}%`:'—'}</b></span>
  </div>
}
