'use client'

import { useMemo } from 'react'
import type { MarketToken } from '@/lib/types'

type Timeframe='5m'|'1h'|'6h'|'24h'
const finite=(n:unknown)=>{const v=Number(n);return Number.isFinite(v)?v:0}
const historicRelative=(changePct:number)=>{const ratio=1+changePct/100;return ratio>0?1/ratio:1}

export default function MarketMiniChart({token,timeframe}:{token:MarketToken;timeframe:Timeframe}){
  const graph=useMemo(()=>{
    const c5=finite(token.priceChange5m),c1=finite(token.priceChange1h),c6=finite(token.priceChange6h),c24=finite(token.priceChange24h)
    const snapshots=[{label:'24h',v:historicRelative(c24)},{label:'6h',v:historicRelative(c6)},{label:'1h',v:historicRelative(c1)},{label:'5m',v:historicRelative(c5)},{label:'now',v:1}]
    const start=timeframe==='24h'?0:timeframe==='6h'?1:timeframe==='1h'?2:3
    const take=snapshots.slice(start)
    const min=Math.min(...take.map(p=>p.v)),max=Math.max(...take.map(p=>p.v)),span=Math.max(max-min,.0000001)
    const pts=take.map((p,i)=>({x:(i/Math.max(1,take.length-1))*100,y:30-((p.v-min)/span)*25}))
    const line=pts.map(p=>`${p.x},${p.y}`).join(' '),area=`0,34 ${line} 100,34`
    const change=timeframe==='24h'?c24:timeframe==='6h'?c6:timeframe==='1h'?c1:c5
    return {line,area,up:change>=0,change}
  },[token,timeframe])

  return <div className={`spark market-snapshot-spark ${graph.up?'up':'down'}`} title={`Real DexScreener ${timeframe} price change: ${graph.change>=0?'+':''}${graph.change.toFixed(2)}%`}>
    <svg viewBox="0 0 100 34" preserveAspectRatio="none"><polygon className="spark-fill" points={graph.area}/><polyline points={graph.line} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></svg>
  </div>
}
