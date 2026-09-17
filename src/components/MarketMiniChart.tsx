'use client'

import { useMemo } from 'react'
import type { MarketToken } from '@/lib/types'

type Timeframe='1m'|'5m'|'1h'|'6h'|'24h'
const finite=(n:unknown)=>{const v=Number(n);return Number.isFinite(v)?v:0}
const historicRelative=(changePct:number)=>{const ratio=1+changePct/100;return ratio>0?1/ratio:1}

export default function MarketMiniChart({token,timeframe}:{token:MarketToken;timeframe:Timeframe}){
  const graph=useMemo(()=>{
    const c1m=finite(token.priceChange1m),c5=finite(token.priceChange5m),c1=finite(token.priceChange1h),c6=finite(token.priceChange6h),c24=finite(token.priceChange24h)
    const snapshots=[{label:'24h',v:historicRelative(c24)},{label:'6h',v:historicRelative(c6)},{label:'1h',v:historicRelative(c1)},{label:'5m',v:historicRelative(c5)},{label:'1m',v:historicRelative(c1m)},{label:'now',v:1}]
    const start=timeframe==='24h'?0:timeframe==='6h'?1:timeframe==='1h'?2:timeframe==='5m'?3:4
    const take=snapshots.slice(start)
    const min=Math.min(...take.map(p=>p.v)),max=Math.max(...take.map(p=>p.v)),span=Math.max(max-min,.0000001)
    const pts=take.map((p,i)=>({x:(i/Math.max(1,take.length-1))*100,y:30-((p.v-min)/span)*25}))
    const line=pts.map(p=>`${p.x},${p.y}`).join(' '),area=`0,34 ${line} 100,34`
    const change=timeframe==='24h'?c24:timeframe==='6h'?c6:timeframe==='1h'?c1:timeframe==='5m'?c5:c1m
    return {line,area,up:change>=0,change,ready:timeframe!=='1m'||Boolean(token.observed1mReady)}
  },[token,timeframe])

  return <div className={`spark market-snapshot-spark ${graph.up?'up':'down'} ${graph.ready?'':'warming'}`} title={graph.ready?`Real ${timeframe} observed price change: ${graph.change>=0?'+':''}${graph.change.toFixed(2)}%`:'1m observed window is warming up from live snapshots'}>
    <svg viewBox="0 0 100 34" preserveAspectRatio="none"><polygon className="spark-fill" points={graph.area}/><polyline points={graph.line} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></svg>
    {!graph.ready&&<small className="spark-warming">warming</small>}
  </div>
}
