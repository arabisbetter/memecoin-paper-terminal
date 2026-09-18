'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertOctagon, Database, PauseCircle, PlayCircle, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'

type Dashboard={
  ok?:boolean;role?:string;strongAuth?:boolean;activeEvaluations?:number
  flags?:Record<string,boolean>;control?:any;treasury?:any;riskPolicy?:any
  providers?:any[];monitor?:any;waitlist?:Record<string,number>;funded?:Record<string,number>
  abuseSignals?:any[];pendingApprovals?:any[];audit?:any[];error?:string
}
type Trader={profile:any;evaluation:any;funded:any;waitlist:any;security:any;scale:any}

export default function AdminPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [dash,setDash]=useState<Dashboard|null>(null),[traders,setTraders]=useState<Trader[]>([])
  const [error,setError]=useState(''),[busy,setBusy]=useState(true),[saving,setSaving]=useState('')
  const [riskDraft,setRiskDraft]=useState({minLiquidityUsd:10000,maxTop10HolderPct:65,maxDevHolderPct:15,maxRiskScore:80})

  const invoke=useCallback(async(body:Record<string,unknown>)=>{
    if(!supabase)throw new Error('Supabase unavailable')
    const {data,error}=await supabase.functions.invoke('admin-control',{body})
    if(error)throw error
    if(data?.error)throw new Error(data.error==='STRONG_AUTH_REQUIRED'?(data.message||data.error):data.error)
    return data
  },[supabase])

  const load=useCallback(async()=>{
    if(!supabase)return
    setBusy(true);setError('')
    try{
      const [d,t]=await Promise.all([invoke({action:'dashboard'}),invoke({action:'traders',limit:50})])
      setDash(d as Dashboard);setTraders((t?.traders||[]) as Trader[])
      const p=d?.riskPolicy||{}
      setRiskDraft({
        minLiquidityUsd:Number(p.min_liquidity_usd||10000),maxTop10HolderPct:Number(p.max_top10_holder_pct||65),
        maxDevHolderPct:Number(p.max_dev_holder_pct||15),maxRiskScore:Number(p.max_risk_score||80)
      })
    }catch(e){setError(e instanceof Error?e.message:'Admin control unavailable')}finally{setBusy(false)}
  },[supabase,invoke])

  useEffect(()=>{void load()},[load])

  async function mutate(action:string,payload:Record<string,unknown>={}){
    setSaving(action);setError('')
    try{await invoke({action,...payload});await load()}catch(e){setError(e instanceof Error?e.message:'Admin action failed')}finally{setSaving('')}
  }

  const flags=dash?.flags||{}
  const closedGates=Object.entries(flags).filter(([k,v])=>/legal|kyc|aml|jurisdiction|custody|turnkey|treasury|real_/.test(k)&&v!==true)
  const emergency=Boolean(dash?.control?.emergency_pause)

  return <div className="ax-app"><AppHeader active="profile"/><main className="terminal-page p23-admin"><div className="terminal-page-inner">
    <section className="p23-admin-hero"><div><div className="terminal-eyebrow">PAPER CONTROL PLANE</div><h1>Operations & risk.</h1><p className="terminal-lead">Server-authorized controls for evaluations, risk, waitlist, treasury, abuse review and future funded operations.</p></div><button className="pulse-head-control" onClick={()=>void load()} disabled={busy}><RefreshCw size={14}/>{busy?'SYNCING':'REFRESH'}</button></section>
    {error&&<div className="terminal-error"><span><b>Admin:</b> {error}</span></div>}
    {busy&&!dash?<div className="empty-card">Loading control plane…</div>:!dash?<div className="error-card">Admin access is required for this page.</div>:<>
      {!dash.strongAuth&&<div className="p23-admin-warning"><ShieldCheck size={16}/><div><b>Read-only until AAL2</b><span>Admin mutations require an MFA/passkey-strength session.</span></div></div>}
      <section className="p23-admin-kpis">
        <div><small>ACTIVE EVALUATIONS</small><b>{dash.activeEvaluations||0}</b></div>
        <div><small>WAITLIST QUEUED</small><b>{dash.waitlist?.queued||0}</b></div>
        <div><small>ABUSE REVIEW</small><b>{dash.abuseSignals?.length||0}</b></div>
        <div><small>ADMIN ROLE</small><b>{dash.role||'—'}</b></div>
      </section>
      <section className="p23-admin-grid">
        <article className="p23-admin-card">
          <div className="p23-admin-title"><AlertOctagon size={15}/><div><b>EMERGENCY CONTROL</b><span>Server-wide trading/evaluation pause</span></div></div>
          <strong className={emergency?'loss':'gain'}>{emergency?'PAUSED':'RUNNING'}</strong>
          <button className={emergency?'admin-safe-btn':'admin-danger-btn'} disabled={Boolean(saving)} onClick={()=>void mutate('set_emergency_pause',{enabled:!emergency})}>{emergency?<><PlayCircle size={14}/> RESUME</>:<><PauseCircle size={14}/> EMERGENCY PAUSE</>}</button>
        </article>
        <article className="p23-admin-card">
          <div className="p23-admin-title"><Database size={15}/><div><b>REAL-MONEY GATES</b><span>All must be true before activation</span></div></div>
          <div className="p23-gate-list">{Object.entries(flags).filter(([k])=>/legal|kyc|aml|jurisdiction|custody|turnkey|treasury|real_/.test(k)).map(([k,v])=><span key={k}><i className={v?'on':'off'}/>{k.replaceAll('_',' ')}</span>)}</div>
          <small>{closedGates.length} launch gates still closed. Real-funded actions remain blocked.</small>
        </article>
        <article className="p23-admin-card p23-provider-card">
          <div className="p23-admin-title"><Database size={15}/><div><b>PROVIDER HEALTH</b><span>Market/risk backend</span></div></div>
          <div className="p23-provider-list">{(dash.providers||[]).map(p=><div key={p.provider}><span><i className={String(p.status).toLowerCase()}/>{p.provider}</span><b>{p.status}</b><small>{p.last_latency_ms==null?'—':String(p.last_latency_ms)+' ms'}</small></div>)}{!dash.providers?.length&&<small>No provider observations yet.</small>}</div>
          <small>Last monitor: {dash.monitor?.completed_at?new Date(dash.monitor.completed_at).toLocaleString():'—'}</small>
        </article>
        <article className="p23-admin-card">
          <div className="p23-admin-title"><ShieldCheck size={15}/><div><b>RISK POLICY</b><span>Future funded-buy block thresholds</span></div></div>
          <div className="p23-admin-form">
            <label>Min liquidity $<input type="number" value={riskDraft.minLiquidityUsd} onChange={e=>setRiskDraft(v=>({...v,minLiquidityUsd:Number(e.target.value)}))}/></label>
            <label>Max top 10 %<input type="number" value={riskDraft.maxTop10HolderPct} onChange={e=>setRiskDraft(v=>({...v,maxTop10HolderPct:Number(e.target.value)}))}/></label>
            <label>Max dev %<input type="number" value={riskDraft.maxDevHolderPct} onChange={e=>setRiskDraft(v=>({...v,maxDevHolderPct:Number(e.target.value)}))}/></label>
            <label>Block score<input type="number" value={riskDraft.maxRiskScore} onChange={e=>setRiskDraft(v=>({...v,maxRiskScore:Number(e.target.value)}))}/></label>
          </div>
          <button className="admin-safe-btn" disabled={Boolean(saving)} onClick={()=>void mutate('set_risk_policy',riskDraft)}>SAVE RISK POLICY</button>
        </article>
        <article className="p23-admin-card">
          <div className="p23-admin-title"><Database size={15}/><div><b>TREASURY</b><span>Policy guardrail</span></div></div>
          <div className="p23-treasury"><span><small>TOTAL</small><b>${Number(dash.treasury?.total_capital_usd||0).toLocaleString()}</b></span><span><small>DEPLOYED</small><b>${Number(dash.treasury?.deployed_capital_usd||0).toLocaleString()}</b></span><span><small>RESERVE</small><b>${Number(dash.treasury?.reserve_capital_usd||0).toLocaleString()}</b></span></div>
          <small>Hard policy: deploy ≤60%; reserve ≥40%.</small>
        </article>
        <article className="p23-admin-card">
          <div className="p23-admin-title"><AlertOctagon size={15}/><div><b>ABUSE ENGINE</b><span>Hard freezes + soft review signals</span></div></div>
          <div className="p23-signal-list">{(dash.abuseSignals||[]).slice(0,8).map(s=><div key={s.id}><b className={s.severity==='hard'?'loss':''}>{s.severity.toUpperCase()}</b><span>{String(s.signal_type).replaceAll('_',' ')}</span><small>{s.status}</small></div>)}{!dash.abuseSignals?.length&&<small>No open abuse signals.</small>}</div>
          <button className="admin-safe-btn" disabled={Boolean(saving)} onClick={()=>void mutate('run_abuse_scan')}>RUN ABUSE SCAN</button>
        </article>
      </section>
      <section className="p23-admin-table-card"><div className="p23-admin-title"><Users size={15}/><div><b>TRADER REVIEW</b><span>Latest 50 accounts · evaluation / waitlist / KYC / scale / review state</span></div></div>
        <div className="p23-trader-head"><span>Trader</span><span>Evaluation</span><span>Equity</span><span>Funded stage</span><span>Waitlist</span><span>Scale</span><span>Review</span></div>
        {traders.map(t=><div className="p23-trader-row" key={t.profile.id}><span><b>{t.profile.display_name||t.profile.username||'Paper Trader'}</b><small>@{t.profile.username||'—'}</small></span><span>{t.evaluation?.status||'—'}</span><span>${Number(t.evaluation?.last_equity_usd||0).toFixed(2)}</span><span>{t.funded?.stage||'paper'}</span><span>{t.waitlist?.status||'—'}</span><span>{t.scale?'L'+t.scale.scale_level+' · $'+Number(t.scale.capital_usd).toLocaleString():'—'}</span><span className={t.security?.flagged_for_review?'loss':''}>{t.security?.flagged_for_review?'FLAGGED':'clear'}</span></div>)}
      </section>
    </>}
  </div></main><BottomDock active="profile"/></div>
}
