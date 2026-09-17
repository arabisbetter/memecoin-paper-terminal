'use client'

import { useEffect, useMemo, useState } from 'react'

type Candle={time:number;open:number;high:number;low:number;close:number;volume:number}

export default function MiniSparkline({pool,timeframe='5m'}:{pool?:string;timeframe?:'1m'|'5m'|'15m'|'30m'|'1h'}){
  const [candles,setCandles]=useState<Candle[]>([])
  useEffect(()=>{
    if(!pool){setCandles([]);return}
    let alive=true
    const load=async()=>{
      try{
        const r=await fetch(`/api/market/ohlcv/${encodeURIComponent(pool)}?tf=${timeframe}`,{cache:'no-store'})
        const j=await r.json()
        if(alive&&r.ok)setCandles((j.candles||[]).slice(-36))
      }catch{if(alive)setCandles([])}
    }
    void load();const id=setInterval(load,30000)
    return()=>{alive=false;clearInterval(id)}
  },[pool,timeframe])

  const graph=useMemo(()=>{
    if(candles.length<2)return null
    const values=candles.map(c=>Number(c.close)).filter(Number.isFinite)
    if(values.length<2)return null
    const min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,Number.EPSILON)
    const pts=values.map((v,i)=>({x:(i/(values.length-1))*100,y:31-((v-min)/span)*27}))
    return {line:pts.map(p=>`${p.x},${p.y}`).join(' '),area:`0,34 ${pts.map(p=>`${p.x},${p.y}`).join(' ')} 100,34`,up:values.at(-1)!>=values[0]}
  },[candles])

  if(!graph)return <div className="spark spark-loading"><span>—</span></div>
  return <div className={`spark ${graph.up?'up':'down'}`} title={`Real ${timeframe} market candles`}><svg viewBox="0 0 100 34" preserveAspectRatio="none"><polygon className="spark-fill" points={graph.area}/><polyline points={graph.line} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></svg></div>
}
