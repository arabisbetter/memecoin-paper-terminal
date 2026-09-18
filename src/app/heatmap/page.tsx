'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import type { MarketToken } from '@/lib/types'

const money=(n:number)=>n>=1e6?'$'+(n/1e6).toFixed(1)+'M':n>=1e3?'$'+(n/1e3).toFixed(0)+'K':'$'+n.toFixed(0)
export default function HeatmapPage(){
  const [tokens,setTokens]=useState<MarketToken[]>([]),[metric,setMetric]=useState<'move'|'volume'|'buys'>('move'),[error,setError]=useState('')
  useEffect(()=>{let alive=true;async function load(){try{const r=await fetch('/api/market/latest',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'feed unavailable');if(alive){setTokens(j.tokens||[]);setError('')}}catch(e){if(alive)setError(e instanceof Error?e.message:'feed unavailable')}}void load();const id=setInterval(()=>{if(!document.hidden)void load()},3500);return()=>{alive=false;clearInterval(id)}},[])
  const ranked=useMemo(()=>[...tokens].sort((a,b)=>metric==='volume'?Number(b.volume5m||0)-Number(a.volume5m||0):metric==='buys'?Number(b.buys5m||0)-Number(a.buys5m||0):Math.abs(Number(b.priceChange5m||0))-Math.abs(Number(a.priceChange5m||0))).slice(0,60),[tokens,metric])
  return <div className="ax-app"><AppHeader active="pulse"/><main className="terminal-page"><div className="terminal-page-inner"><div className="final-page-hero"><div><div className="terminal-eyebrow">MARKET HEATMAP</div><h1>Where attention is moving.</h1><p className="terminal-lead">Live relative view of short-term movement, volume and buy activity across the current Solana feed.</p></div><Activity size={28}/></div><div className="leader-mode-tabs"><button className={metric==='move'?'active':''} onClick={()=>setMetric('move')}>5M MOVE</button><button className={metric==='volume'?'active':''} onClick={()=>setMetric('volume')}>5M VOLUME</button><button className={metric==='buys'?'active':''} onClick={()=>setMetric('buys')}>5M BUYS</button></div>{error&&<div className="error-card">{error}</div>}<section className="heatmap-grid">{ranked.map((t,i)=>{const change=Number(t.priceChange5m||0),weight=metric==='volume'?Number(t.volume5m||0):metric==='buys'?Number(t.buys5m||0):Math.abs(change);const size=i<6?'xl':i<18?'lg':'sm';return <Link className={'heat-tile '+size+' '+(change>=0?'up':'down')} key={t.mint} href={'/spot?mint='+t.mint}><b>{'$'+t.symbol}</b><span>{change>=0?'+':''}{change.toFixed(1)}%</span><small>{metric==='volume'?money(weight):metric==='buys'?Math.round(weight)+' buys':money(Number(t.marketCap||0))+' MC'}</small></Link>})}</section></div></main><BottomDock active="pulse"/></div>
}
