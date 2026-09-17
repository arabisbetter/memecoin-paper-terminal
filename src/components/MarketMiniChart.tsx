'use client'

import { useMemo } from 'react'
import type { MarketToken } from '@/lib/types'

type Timeframe='1m'|'5m'|'30m'|'1h'

const finite=(n:unknown)=>{const v=Number(n);return Number.isFinite(v)?v:0}
const historicRelative=(changePct:number)=>{
  const ratio=1+changePct/100
  return ratio>0?1/ratio:1
}

export default function MarketMiniChart({token,timeframe}:{token:MarketToken;timeframe:Timeframe}){
  const graph=useMemo(()=>{
    const c5=finite(token.priceChange5m)
    const c1=finite(token.priceChange1h)
    const c6=finite(token.priceChange6h)
    const c24=finite(token.priceChange24h)
    const snapshots=[
      {label:'24h',v:historicRelative(c24)},
      {label:'6h',v:historicRelative(c6)},
      {label:'1h',v:historicRelative(c1)},
      {label:'5m',v:historicRelative(c5)},
      {label:'now',v:1},
    ]
    const take=timeframe==='1h'?snapshots.slice(2):timeframe==='30m'?snapshots.slice(2):timeframe==='5m'?snapshots.slice(3):snapshots.slice(3)
    const min=Math.min(...take.map(p=>p.v));const max=Math.max(...take.map(p=>p.v));const span=Math.max(max-min,.0000001)
    const pts=take.map((p,i)=>({x:take.length===1?100:(i/(take.length-1))*100,y:30-((p.v-min)/span)*25,label:p.label,v:p.v}))
    const line=pts.map(p=>`${p.x},${p.y}`).join(' ')
    const area=`0,34 ${line} 100,34`
    const change=timeframe==='1h'?c1:timeframe==='30m'?c1:c5
    return {line,area,up:change>=0,change,window:timeframe==='30m'?'1h snapshot':timeframe==='1m'?'5m snapshot':timeframe}
  },[token,timeframe])

  return <div className={`spark market-snapshot-spark ${graph.up?'up':'down'}`} title={`Real DexScreener ${graph.window}: ${graph.change>=0?'+':''}${graph.change.toFixed(2)}%`}>
    <svg viewBox="0 0 100 34" preserveAspectRatio="none"><polygon className="spark-fill" points={graph.area}/><polyline points={graph.line} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></svg>
  </div>
}
