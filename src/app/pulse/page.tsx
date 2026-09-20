'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Filter, LayoutList, RefreshCw } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import FastPulseStrip from '@/components/FastPulseStrip'
import MarketFilterDrawer from '@/components/MarketFilterDrawer'
import { activeFilterCount, defaultMarketFilters, tokenMatchesFilters, type MarketFilters } from '@/lib/market-filters'
import type { MarketToken } from '@/lib/types'

const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(n<1?6:2)
const age=(ms?:number)=>{if(!ms)return'—';const s=Math.floor(Math.max(0,Date.now()-ms)/1000);if(s<60)return s+'s';const m=Math.floor(s/60);if(m<60)return m+'m';const h=Math.floor(m/60);return h<24?h+'h':Math.floor(h/24)+'d'}
type Venue='all'|'pump'|'raydium'|'meteora'|'other'
type QueryKey='new'|'final'|'migrated'

function PulseCard({token,compact,onOpen}:{token:MarketToken;compact:boolean;onOpen:()=>void}){
  const buys=Number(token.buys5m||0),sells=Number(token.sells5m||0),tx=buys+sells,buyPct=Math.round(buys/Math.max(1,tx)*100)
  const lqRatio=token.marketCap>0?Math.min(999,token.liquidityUsd/token.marketCap*100):0,change=Number(token.priceChange5m||0)
  return <button type="button" className={'pulse-card-terminal '+(compact?'compact':'')} onClick={onOpen}>
    <span className="pulse-img-terminal">{token.image?<img src={token.image} alt="" loading="lazy"/>:<span>{token.symbol.slice(0,2)}</span>}</span>
    <span className="pulse-card-body"><span className="pulse-card-title"><b>{'$'+token.symbol}</b><span>{token.name}</span><i>MC <strong>{money(token.marketCap)}</strong></i></span><span className="pulse-card-meta"><em>{age(token.pairCreatedAt)}</em><span className="pulse-live-dot">LIVE</span><span>5m V {money(Number(token.volume5m||0))}</span><span>{tx} tx</span></span><span className="pulse-card-badges"><span className={buyPct>=50?'metric-pill good':'metric-pill bad'}>B {buyPct}%</span><span className="metric-pill">LQ {lqRatio.toFixed(1)}%</span><span className={change>=0?'metric-pill good':'metric-pill bad'}>{change>=0?'+':''}{change.toFixed(1)}%</span><span className="metric-pill blue">{String(token.dexId||'SOL').slice(0,10)}</span></span></span>
    <span className="pulse-open-token">Open</span>
  </button>
}

export default function PulsePage(){
  const router=useRouter(),loadBusy=useRef(false)
  const [tokens,setTokens]=useState<MarketToken[]>([]),[queries,setQueries]=useState<Record<QueryKey,string>>({new:'',final:'',migrated:''}),[refreshing,setRefreshing]=useState(false)
  const [feedError,setFeedError]=useState(''),[source,setSource]=useState(''),[dataStatus,setDataStatus]=useState<'LIVE'|'DEGRADED'|'STALE'>('DEGRADED')
  const [compact,setCompact]=useState(false),[hideLowLiquidity,setHideLowLiquidity]=useState(false),[venue,setVenue]=useState<Venue>('all')
  const [filters,setFilters]=useState<MarketFilters>(defaultMarketFilters),[filterOpen,setFilterOpen]=useState(false)
  const filterCount=activeFilterCount(filters)

  async function load(force=false){
    if(loadBusy.current||document.hidden&&!force)return
    loadBusy.current=true;if(force)setRefreshing(true)
    try{
      const r=await fetch('/api/market/latest',{cache:'no-store'}),j=await r.json()
      if(!r.ok)throw new Error(j.error||'market feed '+r.status)
      const next=(j.tokens||[]) as MarketToken[]
      if(next.length)setTokens(next)
      setSource(j.source||'market feed');setFeedError(j.warning||'');setDataStatus(j.stale?'STALE':j.warning||j.live===false?'DEGRADED':'LIVE')
    }catch(error){setFeedError((error instanceof Error?error.message:'Live market feed unavailable')+' · retrying automatically');setDataStatus('DEGRADED')}
    finally{if(force)setRefreshing(false);loadBusy.current=false}
  }
  useEffect(()=>{void load(true);const id=window.setInterval(()=>void load(),10000),visible=()=>{if(!document.hidden)void load(true)};document.addEventListener('visibilitychange',visible);return()=>{clearInterval(id);document.removeEventListener('visibilitychange',visible)}},[])
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('paper.pulse.workspace.v2')||'{}');if(saved.venue&&['all','pump','raydium','meteora','other'].includes(saved.venue))setVenue(saved.venue);if(typeof saved.compact==='boolean')setCompact(saved.compact);if(typeof saved.hideLowLiquidity==='boolean')setHideLowLiquidity(saved.hideLowLiquidity);if(saved.filters)setFilters((cur:MarketFilters)=>({...cur,...saved.filters}))}catch{}},[])
  useEffect(()=>{localStorage.setItem('paper.pulse.workspace.v2',JSON.stringify({venue,compact,hideLowLiquidity,filters}))},[venue,compact,hideLowLiquidity,filters])

  const base=useMemo(()=>{let list=[...tokens].filter(t=>tokenMatchesFilters(t,filters));if(venue==='pump')list=list.filter(t=>/pump/i.test(t.dexId||''));else if(venue==='raydium')list=list.filter(t=>/raydium/i.test(t.dexId||''));else if(venue==='meteora')list=list.filter(t=>/meteora/i.test(t.dexId||''));else if(venue==='other')list=list.filter(t=>!/(pump|raydium|meteora)/i.test(t.dexId||''));if(hideLowLiquidity)list=list.filter(t=>t.liquidityUsd>=10000);return list},[tokens,venue,hideLowLiquidity,filters])
  const newer=useMemo(()=>[...base].sort((a,b)=>(b.pairCreatedAt||0)-(a.pairCreatedAt||0)).slice(0,30),[base])
  const final=useMemo(()=>{const pump=base.filter(t=>/pump/i.test(t.dexId||'')&&t.marketCap>0&&t.marketCap<500000),src=pump.length?pump:base.filter(t=>t.marketCap>0&&t.marketCap<500000);return [...src].sort((a,b)=>(Number(b.volume5m||0)+Number(b.buys5m||0)*200+Math.max(0,Number(b.priceChange5m||0))*1000)-(Number(a.volume5m||0)+Number(a.buys5m||0)*200+Math.max(0,Number(a.priceChange5m||0))*1000)).slice(0,30)},[base])
  const migrated=useMemo(()=>[...base.filter(t=>/(raydium|meteora|pumpswap)/i.test(t.dexId||'')||t.liquidityUsd>20000)].sort((a,b)=>(Number(b.volume5m||0)+Math.abs(Number(b.priceChange5m||0))*3000+Number(b.liquidityUsd||0)*.05)-(Number(a.volume5m||0)+Math.abs(Number(a.priceChange5m||0))*3000+Number(a.liquidityUsd||0)*.05)).slice(0,30),[base])
  function filtered(list:MarketToken[],key:QueryKey){const q=queries[key].trim().toLowerCase();return q?list.filter(t=>t.symbol.toLowerCase().includes(q)||t.name.toLowerCase().includes(q)):list}
  const columns=[{key:'new' as const,title:'New Pairs',list:filtered(newer,'new')},{key:'final' as const,title:'Final Stretch',list:filtered(final,'final')},{key:'migrated' as const,title:'Migrated',list:filtered(migrated,'migrated')}]

  return <div className="ax-app"><AppHeader active="pulse"/><main className="pulse-console master-pulse"><section className="pulse-console-head"><div><h1>Pulse</h1><p>New launches, bonding-curve stretch, and migrated liquidity.</p></div><div className="pulse-chain-strip" aria-label="Venue filter"><button className={venue==='all'?'active':''} onClick={()=>setVenue('all')}>All</button><button className={venue==='pump'?'active':''} onClick={()=>setVenue('pump')}>Pump</button><button className={venue==='raydium'?'active':''} onClick={()=>setVenue('raydium')}>Raydium</button><button className={venue==='meteora'?'active':''} onClick={()=>setVenue('meteora')}>Meteora</button><button className={venue==='other'?'active':''} onClick={()=>setVenue('other')}>Other</button></div><span className={'beta-feed-terminal '+dataStatus.toLowerCase()}>{dataStatus}</span><div className="pulse-console-spacer"/><button className={'pulse-head-control '+(compact?'active':'')} onClick={()=>setCompact(v=>!v)}><LayoutList size={14}/> {compact?'Comfortable':'Compact'}</button><button className={'pulse-head-control '+(hideLowLiquidity?'active':'')} onClick={()=>setHideLowLiquidity(v=>!v)}>{hideLowLiquidity?<EyeOff size={14}/>:<Eye size={14}/>} {hideLowLiquidity?'Show all liquidity':'Hide low liquidity'}</button><button className={'pulse-head-control '+(filterCount?'active':'')} onClick={()=>setFilterOpen(true)}><Filter size={14}/> Filters {filterCount?'('+filterCount+')':''}</button><button className="pulse-head-control" onClick={()=>void load(true)} disabled={refreshing}><RefreshCw className={refreshing?'spin':''} size={14}/> {refreshing?'Refreshing':'Refresh'}</button></section><MarketFilterDrawer open={filterOpen} filters={filters} onChange={setFilters} onClose={()=>setFilterOpen(false)}/><FastPulseStrip tokens={tokens}/>{feedError&&<div className="pulse-error"><b>{dataStatus}:</b> {feedError}</div>}<section className="pulse-grid master-pulse-grid">{columns.map(col=><article className="pulse-board-column" key={col.key}><div className="pulse-board-head"><b>{col.title}</b><input aria-label={'Search '+col.title} value={queries[col.key]} onChange={e=>setQueries(q=>({...q,[col.key]:e.target.value}))} placeholder="Search ticker"/><small>{col.list.length}</small></div><div className="pulse-board-scroll">{col.list.map(item=><PulseCard key={item.mint} token={item} compact={compact} onOpen={()=>router.push('/spot?mint='+encodeURIComponent(item.mint))}/>)}{!tokens.length&&refreshing&&Array.from({length:5}).map((_,i)=><div className="pulse-skeleton-card" key={i}><span/><span/><span/></div>)}{tokens.length>0&&!col.list.length&&<div className="pulse-empty">No matching tokens right now.</div>}{!tokens.length&&!refreshing&&<div className="pulse-empty">Live feed unavailable. PAPER is retrying automatically.</div>}</div></article>)}</section><div className={'terminal-source '+(dataStatus!=='LIVE'?'warning':'')}><i/> {dataStatus} · {source||'market feed'} · {base.length}/{tokens.length} tokens · 10s client refresh</div></main><BottomDock active="pulse"/></div>
}
