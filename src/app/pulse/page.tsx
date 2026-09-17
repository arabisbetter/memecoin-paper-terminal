'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, LayoutList, RefreshCw, Zap } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import FastPulseStrip from '@/components/FastPulseStrip'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(n<1?6:2)}`
const age=(ms?:number)=>{if(!ms)return'—';const s=Math.floor(Math.max(0,Date.now()-ms)/1000);if(s<60)return`${s}s`;const m=Math.floor(s/60);if(m<60)return`${m}m`;const h=Math.floor(m/60);return h<24?`${h}h`:`${Math.floor(h/24)}d`}
type Venue='all'|'pump'|'other'
const presets=[{id:'P1',value:.1},{id:'P2',value:.5},{id:'P3',value:1}]

function PulseCard({t,compact,buySize,buying,onOpen,onBuy}:{t:MarketToken;compact:boolean;buySize:number;buying:boolean;onOpen:()=>void;onBuy:()=>void}){
  const buys=Number(t.buys5m||0),sells=Number(t.sells5m||0),tx=buys+sells,buyPct=Math.round(buys/Math.max(1,tx)*100),lqRatio=t.marketCap>0?Math.min(999,(t.liquidityUsd/t.marketCap)*100):0,liveChange=Number(t.priceChange5m||0)
  return <div className={`pulse-card-terminal ${compact?'compact':''}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen()}}}>
    <div className="pulse-img-terminal">{t.image?<img src={t.image} alt="" loading="lazy"/>:<span>{t.symbol.slice(0,2)}</span>}</div>
    <div className="pulse-card-body"><div className="pulse-card-title"><b>{t.symbol}</b><span>{t.name}</span><i>MC <strong>{money(t.marketCap)}</strong></i></div><div className="pulse-card-meta"><em>{age(t.pairCreatedAt)}</em><span className="pulse-live-dot">LIVE</span><span>5m V {money(Number(t.volume5m||0))}</span><span>◎ {tx}</span><span>≋ {t.priceNative?t.priceNative.toFixed(4):'—'}</span></div><div className="pulse-card-badges"><span className={buyPct>=50?'metric-pill good':'metric-pill bad'}>B {buyPct}%</span><span className="metric-pill">LQ {lqRatio.toFixed(1)}%</span><span className={liveChange>=0?'metric-pill good':'metric-pill bad'}>{liveChange>=0?'+':''}{liveChange.toFixed(1)}%</span><span className="metric-pill blue">{String(t.dexId||'SOL').slice(0,8)}</span></div></div>
    <button className="pulse-quick-buy" title={`Buy ${buySize} PAPER SOL`} disabled={buying} onClick={e=>{e.stopPropagation();onBuy()}}>{buying?'…':<Zap size={12}/>}</button>
  </div>
}

export default function PulsePage(){
  const [tokens,setTokens]=useState<MarketToken[]>([]),[queries,setQueries]=useState({new:'',final:'',migrated:''})
  const [refreshing,setRefreshing]=useState(false),[feedError,setFeedError]=useState(''),[source,setSource]=useState(''),[compact,setCompact]=useState(false),[hideLowLiquidity,setHideLowLiquidity]=useState(false)
  const [venue,setVenue]=useState<Venue>('all'),[buySize,setBuySize]=useState(.1),[presetId,setPresetId]=useState('P1'),[buying,setBuying]=useState(''),[notice,setNotice]=useState('')
  const loadBusy=useRef(false),router=useRouter(),supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])

  async function load(force=false){
    if(loadBusy.current||document.hidden&&!force)return
    loadBusy.current=true;if(force)setRefreshing(true)
    try{const r=await fetch('/api/market/latest',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||`market feed ${r.status}`);const next=(j.tokens||[]) as MarketToken[];if(!next.length)throw new Error('Market feed returned zero Solana tokens.');setTokens(next);setSource(j.source||'market feed');setFeedError(j.warning||'')}catch(e){setFeedError(e instanceof Error?e.message:'Live market feed unavailable')}finally{if(force)setRefreshing(false);loadBusy.current=false}
  }
  useEffect(()=>{void load(true);const id=window.setInterval(()=>void load(),1800),onVisible=()=>{if(!document.hidden)void load(true)};document.addEventListener('visibilitychange',onVisible);return()=>{window.clearInterval(id);document.removeEventListener('visibilitychange',onVisible)}},[])
  useEffect(()=>{const savedId=localStorage.getItem('paper.quickBuyPreset'),savedSize=Number(localStorage.getItem('paper.quickBuySize'));if(savedId&&presets.some(p=>p.id===savedId))setPresetId(savedId);if(savedSize>0)setBuySize(savedSize);const handler=(event:Event)=>{const detail=(event as CustomEvent<{id:string;value:number}>).detail;if(detail){setPresetId(detail.id);setBuySize(detail.value)}};window.addEventListener('paper:preset',handler);return()=>window.removeEventListener('paper:preset',handler)},[])
  useEffect(()=>{if(!notice)return;const id=window.setTimeout(()=>setNotice(''),4200);return()=>window.clearTimeout(id)},[notice])
  function choosePreset(id:string,value:number){setPresetId(id);setBuySize(value);localStorage.setItem('paper.quickBuyPreset',id);localStorage.setItem('paper.quickBuySize',String(value))}

  async function quickBuy(t:MarketToken){
    if(!supabase){setNotice('PAPER account service is unavailable.');return}
    try{setBuying(t.mint);setNotice('');await ensurePaperUser(supabase);const {data,error}=await supabase.functions.invoke('paper-trade',{body:{mint:t.mint,side:'buy',amountSol:buySize,idempotencyKey:crypto.randomUUID()}});if(error)throw error;if(data?.error)throw new Error(data.error);setNotice(`PAPER BUY FILLED · $${t.symbol} · ${money(Number(data.fill?.requestedAmountUsd||0))} · fee ${money(Number(data.fill?.paperFeeUsd||0))}`);window.dispatchEvent(new Event('paper:account-changed'))}catch(e){setNotice(e instanceof Error?e.message:'PAPER buy failed')}finally{setBuying('')}
  }

  const base=useMemo(()=>{let list=[...tokens];if(venue==='pump')list=list.filter(t=>/pump/i.test(t.dexId||''));if(venue==='other')list=list.filter(t=>!(/pump/i.test(t.dexId||'')));if(hideLowLiquidity)list=list.filter(t=>t.liquidityUsd>=10000);return list},[tokens,venue,hideLowLiquidity])
  const newer=useMemo(()=>[...base].sort((a,b)=>(b.pairCreatedAt||0)-(a.pairCreatedAt||0)).slice(0,20),[base])
  const final=useMemo(()=>{const pump=base.filter(t=>/pump/i.test(t.dexId||'')&&t.marketCap>0&&t.marketCap<500000);return [...(pump.length?pump:base.filter(t=>t.marketCap>0&&t.marketCap<500000))].sort((a,b)=>(Number(b.volume5m||0)+Number(b.buys5m||0)*200)-(Number(a.volume5m||0)+Number(a.buys5m||0)*200)).slice(0,20)},[base])
  const migrated=useMemo(()=>[...base.filter(t=>/(raydium|meteora|pumpswap)/i.test(t.dexId||'')||t.liquidityUsd>20000)].sort((a,b)=>(Number(b.volume5m||0)+Math.abs(Number(b.priceChange5m||0))*3000)-(Number(a.volume5m||0)+Math.abs(Number(a.priceChange5m||0))*3000)).slice(0,20),[base])
  function filterColumn(list:MarketToken[],key:keyof typeof queries){const q=queries[key].trim().toLowerCase();return q?list.filter(t=>t.symbol.toLowerCase().includes(q)||t.name.toLowerCase().includes(q)):list}
  const columns=[{key:'new' as const,title:'New Pairs',list:filterColumn(newer,'new')},{key:'final' as const,title:'Final Stretch',list:filterColumn(final,'final')},{key:'migrated' as const,title:'Migrated',list:filterColumn(migrated,'migrated')}]

  return <div className="ax-app"><AppHeader active="pulse"/><main className="pulse-console"><section className="pulse-console-head"><h1>Pulse</h1><div className="pulse-chain-strip"><button className={venue==='all'?'active':''} onClick={()=>setVenue('all')}>All</button><button className={venue==='pump'?'active':''} onClick={()=>setVenue('pump')}>⚡</button><button className={venue==='other'?'active':''} onClick={()=>setVenue('other')}>≋</button></div><span className="beta-feed-terminal">BETA FEED</span><div className="pulse-console-spacer"/><button className={`pulse-head-control ${compact?'active':''}`} onClick={()=>setCompact(v=>!v)}><LayoutList size={14}/> Display</button><button className={`pulse-head-control ${hideLowLiquidity?'active':''}`} onClick={()=>setHideLowLiquidity(v=>!v)}>{hideLowLiquidity?<EyeOff size={14}/>:<Eye size={14}/>} Liquidity</button><button className="pulse-head-control" onClick={()=>void load(true)} disabled={refreshing}><RefreshCw className={refreshing?'spin':''} size={14}/>{refreshing?'Refreshing':'Refresh'}</button><div className="preset-strip">{presets.map(p=><button key={p.id} className={presetId===p.id?'active':''} onClick={()=>choosePreset(p.id,p.value)}>{p.id}</button>)}</div></section><FastPulseStrip tokens={tokens}/>{feedError&&<div className="pulse-error"><b>DEGRADED:</b> {feedError}</div>}{notice&&<div className="terminal-toast">{notice}</div>}<section className="pulse-grid">{columns.map(col=><article className="pulse-board-column" key={col.key}><div className="pulse-board-head"><b>{col.title}</b><input value={queries[col.key]} onChange={e=>setQueries(q=>({...q,[col.key]:e.target.value}))} placeholder="Search by ticker"/><small>{col.list.length}</small></div><div className="pulse-board-scroll">{col.list.map(t=><PulseCard key={t.mint} t={t} compact={compact} buySize={buySize} buying={buying===t.mint} onOpen={()=>router.push(`/spot?mint=${t.mint}`)} onBuy={()=>void quickBuy(t)}/>)}{!tokens.length&&refreshing&&Array.from({length:5}).map((_,i)=><div className="pulse-skeleton-card" key={i}><span/><span/><span/></div>)}{tokens.length>0&&!col.list.length&&<div className="pulse-empty">No matching tokens right now.</div>}{!tokens.length&&!refreshing&&feedError&&<div className="pulse-empty">Feed unavailable — retrying automatically.</div>}</div></article>)}</section><div className="terminal-source"><i/> {feedError?'DEGRADED':`LIVE · ${source||'market feed'} · ~1.8s client refresh`} · New/Final/Migrated are approximate until direct Pump.fun ingestion is connected.</div></main><BottomDock active="pulse"/></div>
}
