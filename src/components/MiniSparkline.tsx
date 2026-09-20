'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Candle={time:number;open:number;high:number;low:number;close:number;volume:number}
type Timeframe='1m'|'5m'|'15m'|'30m'|'1h'

type CacheEntry={at:number;candles:Candle[]}
const cache=new Map<string,CacheEntry>()
const CACHE_MS=45_000

export default function MiniSparkline({pool,timeframe='5m'}:{pool?:string;timeframe?:Timeframe}){
  const hostRef=useRef<HTMLDivElement|null>(null)
  const [visible,setVisible]=useState(false)
  const [candles,setCandles]=useState<Candle[]>([])
  const [loading,setLoading]=useState(false)

  useEffect(()=>{
    const node=hostRef.current
    if(!node)return
    if(typeof IntersectionObserver==='undefined'){const start=window.setTimeout(()=>setVisible(true),0);return()=>clearTimeout(start)}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect()}
    },{rootMargin:'260px 0px'})
    observer.observe(node)
    return()=>observer.disconnect()
  },[])

  useEffect(()=>{
    if(!pool||!visible){if(!pool){const reset=window.setTimeout(()=>setCandles([]),0);return()=>clearTimeout(reset)}return}
    const key=`${pool}:${timeframe}`
    let alive=true
    let controller:AbortController|undefined

    const applyCached=()=>{
      const hit=cache.get(key)
      if(hit?.candles.length){setCandles(hit.candles);return hit}
      return null
    }

    const load=async(force=false)=>{
      if(document.hidden&&!force)return
      const hit=cache.get(key)
      if(!force&&hit&&Date.now()-hit.at<CACHE_MS){if(alive)setCandles(hit.candles);return}
      controller?.abort()
      controller=new AbortController()
      if(!hit&&alive)setLoading(true)
      try{
        const r=await fetch(`/api/market/ohlcv/${encodeURIComponent(pool)}?tf=${timeframe}`,{cache:'no-store',signal:controller.signal})
        const j=await r.json()
        const next=((j.candles||[]) as Candle[]).slice(-36)
        if(!r.ok||next.length<2)return
        cache.set(key,{at:Date.now(),candles:next})
        if(alive)setCandles(next)
      }catch(error){
        if((error as {name?:string})?.name!=='AbortError'&&!hit&&alive)setCandles([])
      }finally{if(alive)setLoading(false)}
    }

    applyCached()
    const start=window.setTimeout(()=>void load(),0)
    const id=window.setInterval(()=>void load(true),60_000)
    const onVisible=()=>{if(!document.hidden)void load()}
    document.addEventListener('visibilitychange',onVisible)
    return()=>{alive=false;clearTimeout(start);controller?.abort();window.clearInterval(id);document.removeEventListener('visibilitychange',onVisible)}
  },[pool,timeframe,visible])

  const graph=useMemo(()=>{
    if(candles.length<2)return null
    const values=candles.map(c=>Number(c.close)).filter(Number.isFinite)
    if(values.length<2)return null
    const min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,Number.EPSILON)
    const pts=values.map((v,i)=>({x:(i/(values.length-1))*100,y:31-((v-min)/span)*27}))
    const line=pts.map(p=>`${p.x},${p.y}`).join(' ')
    return {line,area:`0,34 ${line} 100,34`,up:values.at(-1)!>=values[0]}
  },[candles])

  return <div ref={hostRef} className={`spark ${graph?(graph.up?'up':'down'):'spark-loading'} ${loading?'is-refreshing':''}`} title={graph?`Real ${timeframe} market candles`:'Loading market candles'}>
    {graph?<svg viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"><polygon className="spark-fill" points={graph.area}/><polyline points={graph.line} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></svg>:<span>—</span>}
  </div>
}
