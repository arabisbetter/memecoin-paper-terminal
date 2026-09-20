'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Radar, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type RiskPayload={
  ok?:boolean
  dataStatus?:'LIVE'|'DEGRADED'|'STALE'|'UNAVAILABLE'
  paperSimulationAllowed?:boolean
  fundedBuyBlocked?:boolean
  risk?:{
    score?:number;level?:string;top10HolderPct?:number|null;top20HolderPct?:number|null;devHolderPct?:number|null
    liquidityUsd?:number;mintAuthorityPresent?:boolean|null;freezeAuthorityPresent?:boolean|null
    holderCount?:number|null;holderCountIsLowerBound?:boolean;devSellDetected?:boolean|null
    bundledWalletScore?:number;sniperScore?:number;suspiciousClusterScore?:number;tokenAgeSeconds?:number|null
  }
  sources?:string[]
  heuristicWarning?:string
  error?:string
}
const pct=(v:number|null|undefined)=>v==null?'—':`${Number(v).toFixed(1)}%`
const bool=(v:boolean|null|undefined)=>v==null?'UNKNOWN':v?'YES':'NO'
const compact=(n:number|null|undefined)=>{
  const v=Number(n||0)
  if(!Number.isFinite(v))return '—'
  if(v>=1e9)return `$${(v/1e9).toFixed(1)}B`
  if(v>=1e6)return `$${(v/1e6).toFixed(1)}M`
  if(v>=1e3)return `$${(v/1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

export default function TokenRiskPanel({mint}:{mint:string}){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [data,setData]=useState<RiskPayload|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')

  useEffect(()=>{
    if(!supabase||!mint)return
    let live=true
    const start=window.setTimeout(()=>{setData(null);setBusy(true);setError('');void(async()=>{
      try{
        const {data:body,error:invokeError}=await supabase.functions.invoke('market-risk-scan',{body:{mint}})
        if(invokeError)throw invokeError
        if(body?.error)throw new Error(body.error)
        if(live)setData(body as RiskPayload)
      }catch(e){
        if(live){setData(null);setError(e instanceof Error?e.message:'Risk scan unavailable')}
      }finally{if(live)setBusy(false)}
    })()},0)
    return()=>{live=false;clearTimeout(start)}
  },[supabase,mint])

  if(busy&&!data)return <section className="p23-risk-panel loading-risk"><Radar size={15}/><span>Scanning verified token risk data…</span></section>
  if(error&&!data)return <section className="p23-risk-panel unavailable-risk"><AlertTriangle size={15}/><div><b>Risk scan unavailable</b><span>{error}</span></div></section>
  if(!data?.risk)return null
  const r=data.risk,level=String(r.level||'UNKNOWN').toLowerCase()

  return <section className={`p23-risk-panel risk-${level}`}>
    <div className="p23-risk-head">
      <div><ShieldAlert size={16}/><span><b>TOKEN RISK</b><small>Verified fields + explicitly labeled heuristics</small></span></div>
      <strong>{r.score??0}/100 · {r.level||'UNKNOWN'}</strong>
      <span className={`data-health ${String(data.dataStatus||'DEGRADED').toLowerCase()}`}>{data.dataStatus||'DEGRADED'}</span>
    </div>
    <div className="p23-risk-grid">
      <span><small>TOP 10 HOLDERS</small><b>{pct(r.top10HolderPct)}</b></span>
      <span><small>TOP 20 HOLDERS</small><b>{pct(r.top20HolderPct)}</b></span>
      <span><small>DEV / CREATOR</small><b>{pct(r.devHolderPct)}</b></span>
      <span><small>HOLDERS</small><b>{r.holderCount==null?'—':`${r.holderCountIsLowerBound?'≥':''}${Number(r.holderCount).toLocaleString()}`}</b></span>
      <span><small>LIQUIDITY</small><b>{compact(r.liquidityUsd)}</b></span>
      <span><small>MINT AUTHORITY</small><b>{bool(r.mintAuthorityPresent)}</b></span>
      <span><small>FREEZE AUTHORITY</small><b>{bool(r.freezeAuthorityPresent)}</b></span>
      <span><small>DEV SELL FOUND</small><b>{bool(r.devSellDetected)}</b></span>
    </div>
    <div className="p23-heuristics">
      <span><small>BUNDLE SIGNAL*</small><b>{r.bundledWalletScore??0}</b></span>
      <span><small>SNIPER SIGNAL*</small><b>{r.sniperScore??0}</b></span>
      <span><small>CLUSTER SIGNAL*</small><b>{r.suspiciousClusterScore??0}</b></span>
    </div>
    <div className="p23-risk-foot">
      {data.fundedBuyBlocked?<><AlertTriangle size={13}/><b>FUNDED BUY BLOCK</b><span>Current risk policy would reject a future real-funded buy. PAPER simulation remains available.</span></>:<><CheckCircle2 size={13}/><b>PAPER OK</b><span>No current funded-block threshold was triggered. Real-funded trading is still globally disabled.</span></>}
    </div>
    <small className="p23-risk-disclaimer">* Heuristic signals are review indicators, not proof of coordinated wallets or misconduct. Sources: {(data.sources||[]).join(', ')||'limited data'}.</small>
  </section>
}
