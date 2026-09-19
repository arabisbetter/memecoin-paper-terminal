'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Filter, Radar, RefreshCw, Save, ShieldCheck, Zap } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

type Risk={score:number;top10HolderPct:number|null;devHolderPct:number|null;holderCount:number|null;bundledWalletScore:number;sniperScore:number;mintAuthorityPresent:boolean|null;freezeAuthorityPresent:boolean|null;devSellDetected:boolean|null;dataStatus:string}
type Filters={
  maxAgeMin:number;minLiquidity:number;minMarketCap:number;maxMarketCap:number;minVolume5m:number;minBuys5m:number;minBuyPct:number;minMove5m:number;
  minHolders:number;maxTop10:number;maxDev:number;maxRisk:number;maxBundle:number;maxSniper:number;authority:'any'|'revoked';devSell:'any'|'no'|'yes'
}
const defaults:Filters={maxAgeMin:180,minLiquidity:10000,minMarketCap:0,maxMarketCap:1000000,minVolume5m:5000,minBuys5m:10,minBuyPct:55,minMove5m:0,minHolders:0,maxTop10:100,maxDev:100,maxRisk:100,maxBundle:100,maxSniper:100,authority:'any',devSell:'any'}
const money=(n:number)=>n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(0)
const age=(ms?:number)=>{if(!ms)return'—';const m=Math.max(0,(Date.now()-ms)/60000);return m<60?m.toFixed(0)+'m':(m/60).toFixed(1)+'h'}

export default function ScannerPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [tokens,setTokens]=useState<MarketToken[]>([]),[filters,setFilters]=useState<Filters>(defaults),[loading,setLoading]=useState(true),[error,setError]=useState(''),[name,setName]=useState('Launch scanner'),[saved,setSaved]=useState<{id:string;name:string;filters:Filters}[]>([])
  const [risks,setRisks]=useState<Record<string,Risk>>({}),[deepBusy,setDeepBusy]=useState(0),[deepDone,setDeepDone]=useState(0)
  const scanning=useRef(new Set<string>())

  async function load(){setLoading(true);try{const r=await fetch('/api/market/latest',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Market feed unavailable');setTokens(j.tokens||[]);setError('')}catch(e){setError(e instanceof Error?e.message:'Market feed unavailable')}finally{setLoading(false)}}
  async function loadSaved(){if(!supabase)return;try{const u=await ensurePaperUser(supabase);const {data}=await supabase.from('paper_saved_scanners').select('id,name,filters').eq('user_id',u.id).order('updated_at',{ascending:false});setSaved((data||[]) as any)}catch{}}
  useEffect(()=>{void load();void loadSaved();const id=setInterval(()=>{if(!document.hidden)void load()},4000);return()=>clearInterval(id)},[])

  const base=useMemo(()=>tokens.map(t=>{const buys=Number(t.buys5m||0),sells=Number(t.sells5m||0),buyPct=buys/Math.max(1,buys+sells)*100,ageMin=t.pairCreatedAt?(Date.now()-t.pairCreatedAt)/60000:999999;const velocity=Number(t.volume5m||0)/5+buys*200+Math.max(0,Number(t.priceChange5m||0))*800;return{...t,buyPct,ageMin,velocity}}).filter(t=>t.ageMin<=filters.maxAgeMin&&t.liquidityUsd>=filters.minLiquidity&&t.marketCap>=filters.minMarketCap&&t.marketCap<=filters.maxMarketCap&&Number(t.volume5m||0)>=filters.minVolume5m&&Number(t.buys5m||0)>=filters.minBuys5m&&t.buyPct>=filters.minBuyPct&&Number(t.priceChange5m||0)>=filters.minMove5m).sort((a,b)=>b.velocity-a.velocity),[tokens,filters.maxAgeMin,filters.minLiquidity,filters.minMarketCap,filters.maxMarketCap,filters.minVolume5m,filters.minBuys5m,filters.minBuyPct,filters.minMove5m])

  async function deepScan(list=base.slice(0,12)){
    if(!supabase||!list.length)return
    setDeepBusy(list.length);setDeepDone(0)
    try{await ensurePaperUser(supabase)}catch{return}
    for(let i=0;i<list.length;i+=3){
      const batch=list.slice(i,i+3)
      await Promise.all(batch.map(async t=>{
        if(scanning.current.has(t.mint))return
        scanning.current.add(t.mint)
        try{
          const {data,error}=await supabase.functions.invoke('market-risk-scan',{body:{mint:t.mint}})
          if(error)throw error
          if(data?.risk)setRisks(v=>({...v,[t.mint]:{...data.risk,dataStatus:data.dataStatus||'DEGRADED'}}))
        }catch{}finally{scanning.current.delete(t.mint);setDeepDone(v=>v+1)}
      }))
    }
    setDeepBusy(0)
  }
  useEffect(()=>{if(base.length&&Object.keys(risks).length===0)void deepScan(base.slice(0,8))},[base.length,supabase])

  const rows=useMemo(()=>base.filter(t=>{
    const r=risks[t.mint]
    const needsRisk=filters.minHolders>0||filters.maxTop10<100||filters.maxDev<100||filters.maxRisk<100||filters.maxBundle<100||filters.maxSniper<100||filters.authority!=='any'||filters.devSell!=='any'
    if(needsRisk&&!r)return false
    if(!r)return true
    if(filters.minHolders>0&&Number(r.holderCount||0)<filters.minHolders)return false
    if(r.top10HolderPct!=null&&r.top10HolderPct>filters.maxTop10)return false
    if(r.devHolderPct!=null&&r.devHolderPct>filters.maxDev)return false
    if(r.score>filters.maxRisk||r.bundledWalletScore>filters.maxBundle||r.sniperScore>filters.maxSniper)return false
    if(filters.authority==='revoked'&&(r.mintAuthorityPresent!==false||r.freezeAuthorityPresent!==false))return false
    if(filters.devSell==='no'&&r.devSellDetected!==false)return false
    if(filters.devSell==='yes'&&r.devSellDetected!==true)return false
    return true
  }).slice(0,80),[base,risks,filters])

  async function savePreset(e:FormEvent){e.preventDefault();if(!supabase)return;try{const u=await ensurePaperUser(supabase);const {error}=await supabase.from('paper_saved_scanners').upsert({user_id:u.id,name:name.trim()||'Scanner',filters,updated_at:new Date().toISOString()},{onConflict:'user_id,name'});if(error)throw error;await loadSaved()}catch(e){setError(e instanceof Error?e.message:'Could not save scanner')}}
  const numeric:[string,keyof Filters][]=[['Max age (min)','maxAgeMin'],['Min liquidity $','minLiquidity'],['Min market cap $','minMarketCap'],['Max market cap $','maxMarketCap'],['Min 5m volume $','minVolume5m'],['Min 5m buys','minBuys5m'],['Min buy %','minBuyPct'],['Min 5m move %','minMove5m'],['Min holders','minHolders'],['Max top-10 %','maxTop10'],['Max dev %','maxDev'],['Max risk score','maxRisk'],['Max bundle signal','maxBundle'],['Max sniper signal','maxSniper']]

  return <div className="ax-app"><AppHeader active="pulse"/><main className="terminal-page"><div className="terminal-page-inner">
    <div className="final-page-hero"><div><div className="terminal-eyebrow">ADVANCED LAUNCH SCANNER · LIVE + ON-CHAIN</div><h1>Filter the launch, then deep-scan the risk.</h1><p className="terminal-lead">Market filters use the live Solana feed. Deep filters are populated by the live risk engine and stay unknown when the upstream chain source cannot verify them.</p></div><Radar size={28}/></div>
    <section className="scanner-layout"><aside className="scanner-filter-card"><div className="panel-title"><b>SCANNER FILTERS</b><Filter size={14}/></div>
      {numeric.map(([label,key])=><label key={String(key)}>{label}<input type="number" value={Number(filters[key])} onChange={e=>setFilters(v=>({...v,[key]:Number(e.target.value)||0}))}/></label>)}
      <label>Authorities<select value={filters.authority} onChange={e=>setFilters(v=>({...v,authority:e.target.value as Filters['authority']}))}><option value="any">Any</option><option value="revoked">Mint + freeze revoked</option></select></label>
      <label>Dev sell<select value={filters.devSell} onChange={e=>setFilters(v=>({...v,devSell:e.target.value as Filters['devSell']}))}><option value="any">Any / unknown</option><option value="no">Verified no recent dev sell</option><option value="yes">Dev sell detected</option></select></label>
      <button onClick={()=>setFilters(defaults)}>Reset</button><button onClick={()=>void deepScan(base.slice(0,20))} disabled={deepBusy>0}><ShieldCheck size={12}/>{deepBusy?' Deep scan '+deepDone+'/'+deepBusy:' Deep scan top 20'}</button>
      <form onSubmit={savePreset}><input value={name} maxLength={48} onChange={e=>setName(e.target.value)} placeholder="Preset name"/><button><Save size={12}/> Save preset</button></form>{saved.length>0&&<div className="scanner-presets">{saved.map(s=><button key={s.id} onClick={()=>setFilters({...defaults,...s.filters})}>{s.name}</button>)}</div>}
    </aside>
      <section className="scanner-results"><div className="panel-title"><b>LIVE MATCHES</b><span>{rows.length} / {tokens.length} · risk scanned {Object.keys(risks).length}</span><button onClick={()=>void load()}><RefreshCw size={11}/></button></div>{error&&<div className="error-card">{error}</div>}{loading&&!tokens.length?<div className="empty-card">Scanning live pairs…</div>:rows.length===0?<div className="empty-card">No tokens match these filters right now. Deep-risk filters exclude tokens whose required fields are still unknown.</div>:<div className="scanner-table"><div className="scanner-row scanner-deep head"><span>Token</span><span>Age</span><span>MC</span><span>Liq</span><span>5m Vol</span><span>Buy %</span><span>Holders</span><span>Top10</span><span>Dev</span><span>Risk</span><span>Bundle</span><span>Sniper</span><span>Velocity</span></div>{rows.map(t=>{const r=risks[t.mint];return <Link key={t.mint} href={'/spot?mint='+t.mint} className="scanner-row scanner-deep"><span><b>{'$'+t.symbol}</b><small>{t.name}</small></span><span>{age(t.pairCreatedAt)}</span><span>{money(t.marketCap)}</span><span>{money(t.liquidityUsd)}</span><span>{money(Number(t.volume5m||0))}</span><span>{t.buyPct.toFixed(0)}%</span><span>{r?.holderCount?.toLocaleString()??'…'}</span><span>{r?.top10HolderPct==null?'…':r.top10HolderPct.toFixed(1)+'%'}</span><span>{r?.devHolderPct==null?'…':r.devHolderPct.toFixed(1)+'%'}</span><strong className={r&&r.score>=60?'loss':r&&r.score<30?'gain':''}>{r?.score??'…'}</strong><span>{r?.bundledWalletScore??'…'}</span><span>{r?.sniperScore??'…'}</span><span><Zap size={11}/>{Math.round(t.velocity).toLocaleString()}</span></Link>})}</div>}</section>
    </section>
  </div></main><BottomDock active="pulse"/></div>
}
