'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MarketToken } from '@/lib/types'

type PulseEvent={id:string;mint:string;symbol:string;kind:'buy'|'sell'|'move';count:number;change:number;price:number;at:number}
const price=(n:number)=>!Number.isFinite(n)?'—':n>=1?`$${n.toFixed(4)}`:n>=.01?`$${n.toFixed(6)}`:`$${n.toPrecision(4)}`

export default function FastPulseStrip({tokens}:{tokens:MarketToken[]}){
  const previous=useRef<Map<string,MarketToken>>(new Map())
  const [events,setEvents]=useState<PulseEvent[]>([])
  const [cursor,setCursor]=useState(0)

  useEffect(()=>{
    if(!tokens.length)return
    const start=window.setTimeout(()=>{
    const nextMap=new Map(tokens.map(t=>[t.mint,t]))
    const fresh:PulseEvent[]=[]
    for(const token of tokens){
      const before=previous.current.get(token.mint)
      if(!before)continue
      const buyDelta=Math.max(0,Number(token.buys5m||0)-Number(before.buys5m||0))
      const sellDelta=Math.max(0,Number(token.sells5m||0)-Number(before.sells5m||0))
      const change=before.priceUsd>0?(token.priceUsd/before.priceUsd-1)*100:0
      const at=Date.now()
      if(buyDelta>0)fresh.push({id:`b-${token.mint}-${at}`,mint:token.mint,symbol:token.symbol,kind:'buy',count:buyDelta,change,price:token.priceUsd,at})
      if(sellDelta>0)fresh.push({id:`s-${token.mint}-${at}`,mint:token.mint,symbol:token.symbol,kind:'sell',count:sellDelta,change,price:token.priceUsd,at})
      if(!buyDelta&&!sellDelta&&Math.abs(change)>.001)fresh.push({id:`m-${token.mint}-${at}`,mint:token.mint,symbol:token.symbol,kind:'move',count:0,change,price:token.priceUsd,at})
    }
    previous.current=nextMap
    if(fresh.length)setEvents(old=>[...fresh.sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)),...old].slice(0,100))
    },0)
    return()=>clearTimeout(start)
  },[tokens])

  useEffect(()=>{
    if(events.length<2)return
    const id=window.setInterval(()=>setCursor(i=>(i+1)%events.length),420)
    return()=>window.clearInterval(id)
  },[events.length])

  const current=events.length?events[cursor%events.length]:null
  const movers=useMemo(()=>[...tokens].sort((a,b)=>Math.abs(Number(b.priceChange5m||0))-Math.abs(Number(a.priceChange5m||0))).slice(0,5),[tokens])
  return <div className="fast-pulse-strip">
    <div className="fast-pulse-label"><i/><b>LIVE PULSE</b><span>~2s market refresh</span></div>
    {current?<Link href={`/spot?mint=${current.mint}`} className={`fast-pulse-event ${current.kind}`}>
      <b>${current.symbol}</b><span>{current.kind==='buy'?`+${current.count} buy${current.count===1?'':'s'}`:current.kind==='sell'?`+${current.count} sell${current.count===1?'':'s'}`:'price move'}</span><strong className={current.change>=0?'gain':'loss'}>{current.change>=0?'+':''}{current.change.toFixed(2)}%</strong><em>{price(current.price)}</em>
    </Link>:<div className="fast-pulse-idle">Watching {tokens.length} live Solana markets for fresh activity…</div>}
    <div className="fast-pulse-movers">{movers.map(t=><Link key={t.mint} href={`/spot?mint=${t.mint}`}><b>${t.symbol}</b><span className={Number(t.priceChange5m||0)>=0?'gain':'loss'}>{Number(t.priceChange5m||0)>=0?'+':''}{Number(t.priceChange5m||0).toFixed(1)}%</span></Link>)}</div>
  </div>
}
