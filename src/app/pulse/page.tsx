'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import type { MarketToken } from '@/lib/types'

const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(n<1?6:2)}`
const age=(ms?:number)=>{if(!ms)return'—';const s=Math.floor(Math.max(0,Date.now()-ms)/1000);if(s<60)return`${s}s`;const m=Math.floor(s/60);if(m<60)return`${m}m`;const h=Math.floor(m/60);return h<24?`${h}h`:`${Math.floor(h/24)}d`}

function Card({t,onOpen}:{t:MarketToken;onOpen:()=>void}){
  const tx=t.buys24h+t.sells24h
  const buyPct=Math.round(t.buys24h/Math.max(1,tx)*100)
  return <button className="pulse-card" onClick={onOpen}>
    <div className="pulse-img">{t.image?<img src={t.image} alt=""/>:<span>{t.symbol.slice(0,2)}</span>}</div>
    <div className="pulse-card-main">
      <div className="pulse-card-top"><b>{t.symbol}</b><span>{t.name}</span><i>MC <strong>{money(t.marketCap)}</strong></i></div>
      <div className="pulse-card-meta"><em>{age(t.pairCreatedAt)}</em><span>◯</span><span>⌕</span><span>◎ {tx}</span><span>≋ {t.priceNative?t.priceNative.toFixed(3):'—'}</span></div>
      <div className="pulse-card-bottom"><span className={buyPct>=50?'good':'bad'}>⚯ {buyPct}%</span><span className="good">⌂ {Math.max(0,Math.round(t.liquidityUsd/10000))}%</span><span className={t.priceChange24h>=0?'good':'bad'}>◉ {Math.abs(Math.round(t.priceChange24h))}%</span><span className="good">☊ {Math.min(99,Math.round(tx/10))}%</span></div>
    </div>
  </button>
}

export default function PulsePage(){
  const [tokens,setTokens]=useState<MarketToken[]>([])
  const [query,setQuery]=useState('')
  const router=useRouter()
  async function load(){try{const r=await fetch('/api/market/latest',{cache:'no-store'});const j=await r.json();if(r.ok)setTokens(j.tokens||[])}catch{}}
  useEffect(()=>{void load();const id=setInterval(load,9000);return()=>clearInterval(id)},[])
  const filtered=useMemo(()=>tokens.filter(t=>!query||t.symbol.toLowerCase().includes(query.toLowerCase())||t.name.toLowerCase().includes(query.toLowerCase())),[tokens,query])
  const newer=useMemo(()=>[...filtered].sort((a,b)=>(b.pairCreatedAt||0)-(a.pairCreatedAt||0)).slice(0,10),[filtered])
  const final=useMemo(()=>[...filtered].filter(t=>t.marketCap>0&&t.marketCap<500000).sort((a,b)=>b.marketCap-a.marketCap).slice(0,10),[filtered])
  const migrated=useMemo(()=>[...filtered].filter(t=>/(raydium|meteora|pumpswap)/i.test(t.dexId||'')||t.liquidityUsd>20000).sort((a,b)=>b.volume24h-a.volume24h).slice(0,10),[filtered])
  return <div className="ax-app"><AppHeader active="pulse"/>
    <main className="pulse-page">
      <div className="pulse-page-head"><h1>Pulse</h1><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by ticker"/><button onClick={()=>void load()}>↻ Refresh</button></div>
      <div className="pulse-columns">
        {[
          ['New Pairs',newer],['Final Stretch',final],['Migrated',migrated]
        ].map(([title,list])=><section className="pulse-column" key={title as string}>
          <div className="pulse-column-head"><b>{title as string}</b><span>Search by ticker</span><small>Live</small></div>
          <div className="pulse-column-list">{(list as MarketToken[]).map(t=><Card key={t.mint} t={t} onOpen={()=>router.push(`/spot?mint=${t.mint}`)}/>)}</div>
        </section>)}
      </div>
    </main>
  </div>
}
