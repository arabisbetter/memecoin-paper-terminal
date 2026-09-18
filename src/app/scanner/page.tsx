'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Filter, Radar, Save, Zap } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

type Filters={maxAgeMin:number;minLiquidity:number;maxMarketCap:number;minVolume5m:number;minBuys5m:number;minBuyPct:number;minMove5m:number}
const defaults:Filters={maxAgeMin:180,minLiquidity:10000,maxMarketCap:1000000,minVolume5m:5000,minBuys5m:10,minBuyPct:55,minMove5m:0}
const money=(n:number)=>n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(0)
const age=(ms?:number)=>{if(!ms)return'—';const m=Math.max(0,(Date.now()-ms)/60000);return m<60?m.toFixed(0)+'m':(m/60).toFixed(1)+'h'}

export default function ScannerPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [tokens,setTokens]=useState<MarketToken[]>([]),[filters,setFilters]=useState<Filters>(defaults),[loading,setLoading]=useState(true),[error,setError]=useState(''),[name,setName]=useState('Launch scanner'),[saved,setSaved]=useState<{id:string;name:string;filters:Filters}[]>([])
  async function load(){setLoading(true);try{const r=await fetch('/api/market/latest',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Market feed unavailable');setTokens(j.tokens||[]);setError('')}catch(e){setError(e instanceof Error?e.message:'Market feed unavailable')}finally{setLoading(false)}}
  async function loadSaved(){if(!supabase)return;try{const u=await ensurePaperUser(supabase);const {data}=await supabase.from('paper_saved_scanners').select('id,name,filters').eq('user_id',u.id).order('updated_at',{ascending:false});setSaved((data||[]) as any)}catch{}}
  useEffect(()=>{void load();void loadSaved();const id=setInterval(()=>{if(!document.hidden)void load()},4000);return()=>clearInterval(id)},[])
  const rows=useMemo(()=>tokens.map(t=>{const buys=Number(t.buys5m||0),sells=Number(t.sells5m||0),buyPct=buys/Math.max(1,buys+sells)*100,ageMin=t.pairCreatedAt?(Date.now()-t.pairCreatedAt)/60000:999999;const velocity=Number(t.volume5m||0)/5+buys*200+Math.max(0,Number(t.priceChange5m||0))*800;return{...t,buyPct,ageMin,velocity}}).filter(t=>t.ageMin<=filters.maxAgeMin&&t.liquidityUsd>=filters.minLiquidity&&t.marketCap<=filters.maxMarketCap&&Number(t.volume5m||0)>=filters.minVolume5m&&Number(t.buys5m||0)>=filters.minBuys5m&&t.buyPct>=filters.minBuyPct&&Number(t.priceChange5m||0)>=filters.minMove5m).sort((a,b)=>b.velocity-a.velocity).slice(0,80),[tokens,filters])
  async function savePreset(e:FormEvent){e.preventDefault();if(!supabase)return;try{const u=await ensurePaperUser(supabase);const {error}=await supabase.from('paper_saved_scanners').upsert({user_id:u.id,name:name.trim()||'Scanner',filters,updated_at:new Date().toISOString()},{onConflict:'user_id,name'});if(error)throw error;await loadSaved()}catch(e){setError(e instanceof Error?e.message:'Could not save scanner')}}
  return <div className="ax-app"><AppHeader active="pulse"/><main className="terminal-page"><div className="terminal-page-inner">
    <div className="final-page-hero"><div><div className="terminal-eyebrow">LAUNCH SCANNER · LIVE SOLANA FEED</div><h1>Find velocity before the crowd.</h1><p className="terminal-lead">Filter new tokens by age, liquidity, market cap, 5-minute volume, buy pressure and momentum. Rankings are live feed signals, not investment recommendations.</p></div><Radar size={28}/></div>
    <section className="scanner-layout"><aside className="scanner-filter-card"><div className="panel-title"><b>SCANNER FILTERS</b><Filter size={14}/></div>{[['Max age (min)','maxAgeMin'],['Min liquidity $','minLiquidity'],['Max market cap $','maxMarketCap'],['Min 5m volume $','minVolume5m'],['Min 5m buys','minBuys5m'],['Min buy %','minBuyPct'],['Min 5m move %','minMove5m']].map(([label,key])=><label key={key}>{label}<input type="number" value={(filters as any)[key]} onChange={e=>setFilters(v=>({...v,[key]:Number(e.target.value)||0}))}/></label>)}<button onClick={()=>setFilters(defaults)}>Reset</button><form onSubmit={savePreset}><input value={name} maxLength={48} onChange={e=>setName(e.target.value)} placeholder="Preset name"/><button><Save size={12}/> Save preset</button></form>{saved.length>0&&<div className="scanner-presets">{saved.map(s=><button key={s.id} onClick={()=>setFilters({...defaults,...s.filters})}>{s.name}</button>)}</div>}</aside>
      <section className="scanner-results"><div className="panel-title"><b>LIVE MATCHES</b><span>{rows.length} / {tokens.length}</span></div>{error&&<div className="error-card">{error}</div>}{loading&&!tokens.length?<div className="empty-card">Scanning live pairs…</div>:rows.length===0?<div className="empty-card">No tokens match these filters right now.</div>:<div className="scanner-table"><div className="scanner-row head"><span>Token</span><span>Age</span><span>MC</span><span>Liq</span><span>5m Vol</span><span>Buys</span><span>Buy %</span><span>5m</span><span>Velocity</span></div>{rows.map(t=><Link key={t.mint} href={'/spot?mint='+t.mint} className="scanner-row"><span><b>{'$'+t.symbol}</b><small>{t.name}</small></span><span>{age(t.pairCreatedAt)}</span><span>{money(t.marketCap)}</span><span>{money(t.liquidityUsd)}</span><span>{money(Number(t.volume5m||0))}</span><span>{Number(t.buys5m||0)}</span><span>{t.buyPct.toFixed(0)}%</span><strong className={Number(t.priceChange5m||0)>=0?'gain':'loss'}>{Number(t.priceChange5m||0).toFixed(1)}%</strong><span><Zap size={11}/>{Math.round(t.velocity).toLocaleString()}</span></Link>)}</div>}</section></section>
  </div></main><BottomDock active="pulse"/></div>
}
