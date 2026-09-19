'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Filter, Radar, Save, ScanSearch, Zap } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

type Filters={maxAgeMin:number;minLiquidity:number;maxMarketCap:number;minVolume5m:number;minBuys5m:number;minBuyPct:number;minMove5m:number;minLiqMcPct:number;maxTop10Pct:number;requireMintRevoked:boolean;requireFreezeRevoked:boolean}
type Deep={top10Pct:number;mintRevoked:boolean|null;freezeRevoked:boolean|null;stage:string;source:string[]}
const defaults:Filters={maxAgeMin:180,minLiquidity:10000,maxMarketCap:1000000,minVolume5m:5000,minBuys5m:10,minBuyPct:55,minMove5m:0,minLiqMcPct:0,maxTop10Pct:100,requireMintRevoked:false,requireFreezeRevoked:false}
const money=(n:number)=>n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(0)
const age=(ms?:number)=>{if(!ms)return'—';const m=Math.max(0,(Date.now()-ms)/60000);return m<60?m.toFixed(0)+'m':(m/60).toFixed(1)+'h'}

export default function ScannerPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [tokens,setTokens]=useState<MarketToken[]>([]),[filters,setFilters]=useState<Filters>(defaults),[loading,setLoading]=useState(true),[error,setError]=useState(''),[name,setName]=useState('Launch scanner'),[saved,setSaved]=useState<{id:string;name:string;filters:Filters}[]>([])
  const [deep,setDeep]=useState<Record<string,Deep>>({}),[deepBusy,setDeepBusy]=useState(false),[deepAt,setDeepAt]=useState(0)
  async function load(){setLoading(true);try{const r=await fetch('/api/market/latest',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Market feed unavailable');setTokens(j.tokens||[]);setError('')}catch(e){setError(e instanceof Error?e.message:'Market feed unavailable')}finally{setLoading(false)}}
  async function loadSaved(){if(!supabase)return;try{const u=await ensurePaperUser(supabase);const {data}=await supabase.from('paper_saved_scanners').select('id,name,filters').eq('user_id',u.id).order('updated_at',{ascending:false});setSaved((data||[]) as any)}catch{}}
  useEffect(()=>{void load();void loadSaved();const id=setInterval(()=>{if(!document.hidden)void load()},4000);return()=>clearInterval(id)},[])

  const baseRows=useMemo(()=>tokens.map(t=>{const buys=Number(t.buys5m||0),sells=Number(t.sells5m||0),buyPct=buys/Math.max(1,buys+sells)*100,ageMin=t.pairCreatedAt?(Date.now()-t.pairCreatedAt)/60000:999999,liqMcPct=t.marketCap>0?t.liquidityUsd/t.marketCap*100:0;const velocity=Number(t.volume5m||0)/5+buys*200+Math.max(0,Number(t.priceChange5m||0))*800;return{...t,buyPct,ageMin,liqMcPct,velocity}}).filter(t=>t.ageMin<=filters.maxAgeMin&&t.liquidityUsd>=filters.minLiquidity&&t.marketCap<=filters.maxMarketCap&&Number(t.volume5m||0)>=filters.minVolume5m&&Number(t.buys5m||0)>=filters.minBuys5m&&t.buyPct>=filters.minBuyPct&&Number(t.priceChange5m||0)>=filters.minMove5m&&t.liqMcPct>=filters.minLiqMcPct).sort((a,b)=>b.velocity-a.velocity),[tokens,filters])

  const rows=useMemo(()=>baseRows.filter(t=>{const d=deep[t.mint];if(!d)return !(filters.maxTop10Pct<100||filters.requireMintRevoked||filters.requireFreezeRevoked);return d.top10Pct<=filters.maxTop10Pct&&(!filters.requireMintRevoked||d.mintRevoked===true)&&(!filters.requireFreezeRevoked||d.freezeRevoked===true)}).slice(0,80),[baseRows,deep,filters.maxTop10Pct,filters.requireMintRevoked,filters.requireFreezeRevoked])

  async function deepScan(){
    setDeepBusy(true);setError('')
    const candidates=baseRows.slice(0,10),next={...deep}
    try{
      for(const t of candidates){
        try{const r=await fetch('/api/intelligence/token/'+encodeURIComponent(t.mint),{cache:'no-store'}),j=await r.json();if(r.ok)next[t.mint]={top10Pct:Number(j.distribution?.top10Pct||0),mintRevoked:j.authority?.mintRevoked??null,freezeRevoked:j.authority?.freezeRevoked??null,stage:String(j.token?.stage||'—'),source:j.source||[]}}catch{}
      }
      setDeep(next);setDeepAt(Date.now())
    }finally{setDeepBusy(false)}
  }
  async function savePreset(e:FormEvent){e.preventDefault();if(!supabase)return;try{const u=await ensurePaperUser(supabase);const {error}=await supabase.from('paper_saved_scanners').upsert({user_id:u.id,name:name.trim()||'Scanner',filters,updated_at:new Date().toISOString()},{onConflict:'user_id,name'});if(error)throw error;await loadSaved()}catch(e){setError(e instanceof Error?e.message:'Could not save scanner')}}

  const numeric:[string,keyof Filters][]=[['Max age (min)','maxAgeMin'],['Min liquidity $','minLiquidity'],['Max market cap $','maxMarketCap'],['Min 5m volume $','minVolume5m'],['Min 5m buys','minBuys5m'],['Min buy %','minBuyPct'],['Min 5m move %','minMove5m'],['Min Liq / MC %','minLiqMcPct'],['Max top-10 %','maxTop10Pct']]
  return <div className="ax-app"><AppHeader active="pulse"/><main className="terminal-page"><div className="terminal-page-inner">
    <div className="final-page-hero"><div><div className="terminal-eyebrow">ADVANCED LAUNCH SCANNER · LIVE SOLANA + RPC</div><h1>Filter velocity, then verify concentration.</h1><p className="terminal-lead">Stage one uses the fast live market feed. Deep Scan then checks top-holder concentration and mint/freeze authority directly against Solana RPC for the strongest current matches.</p></div><Radar size={28}/></div>
    <section className="scanner-layout"><aside className="scanner-filter-card"><div className="panel-title"><b>SCANNER FILTERS</b><Filter size={14}/></div>
      {numeric.map(([label,key])=><label key={String(key)}>{label}<input type="number" value={Number(filters[key])} onChange={e=>setFilters(v=>({...v,[key]:Number(e.target.value)||0}))}/></label>)}
      <label className="scanner-check"><input type="checkbox" checked={filters.requireMintRevoked} onChange={e=>setFilters(v=>({...v,requireMintRevoked:e.target.checked}))}/> Require mint authority revoked</label>
      <label className="scanner-check"><input type="checkbox" checked={filters.requireFreezeRevoked} onChange={e=>setFilters(v=>({...v,requireFreezeRevoked:e.target.checked}))}/> Require freeze authority revoked</label>
      <button className="scanner-deep" disabled={deepBusy||!baseRows.length} onClick={()=>void deepScan()}><ScanSearch size={12}/>{deepBusy?'Scanning RPC…':'Deep scan top 10'}</button>
      {deepAt>0&&<small className="scanner-live-note">Deep data refreshed {new Date(deepAt).toLocaleTimeString()}</small>}
      <button onClick={()=>setFilters(defaults)}>Reset</button>
      <form onSubmit={savePreset}><input value={name} maxLength={48} onChange={e=>setName(e.target.value)} placeholder="Preset name"/><button><Save size={12}/> Save preset</button></form>
      {saved.length>0&&<div className="scanner-presets">{saved.map(s=><button key={s.id} onClick={()=>setFilters({...defaults,...s.filters})}>{s.name}</button>)}</div>}
    </aside>
    <section className="scanner-results"><div className="panel-title"><b>LIVE MATCHES</b><span>{rows.length} / {tokens.length}</span></div>{error&&<div className="error-card">{error}</div>}{loading&&!tokens.length?<div className="empty-card">Scanning live pairs…</div>:rows.length===0?<div className="empty-card">No tokens match these filters. If holder/authority filters are enabled, run Deep Scan.</div>:<div className="scanner-table pro"><div className="scanner-row head"><span>Token</span><span>Age</span><span>MC</span><span>Liq</span><span>L/MC</span><span>5m Vol</span><span>Buy %</span><span>Top10</span><span>Auth</span><span>Velocity</span></div>{rows.map(t=>{const d=deep[t.mint];return <Link key={t.mint} href={'/token/'+t.mint+'/intelligence'} className="scanner-row"><span><b>{'$'+t.symbol}</b><small>{t.name}</small></span><span>{age(t.pairCreatedAt)}</span><span>{money(t.marketCap)}</span><span>{money(t.liquidityUsd)}</span><span>{t.liqMcPct.toFixed(1)}%</span><span>{money(Number(t.volume5m||0))}</span><span>{t.buyPct.toFixed(0)}%</span><span>{d?d.top10Pct.toFixed(1)+'%':'SCAN'}</span><span>{d?(d.mintRevoked&&d.freezeRevoked?'✓/✓':(d.mintRevoked?'✓':'×')+'/'+(d.freezeRevoked?'✓':'×')):'—'}</span><span><Zap size={11}/>{Math.round(t.velocity).toLocaleString()}</span></Link>})}</div>}</section></section>
  </div></main><BottomDock active="pulse"/></div>
}
