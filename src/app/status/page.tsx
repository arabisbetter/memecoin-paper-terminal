'use client'

import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, Server, TriangleAlert } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'

type Provider={provider:string;status:string;latencyMs:number|null;lastSuccessAt:string|null;lastFailureAt:string|null;consecutiveFailures:number;updatedAt:string}
type Component={component:string;status:string;latencyMs:number|null;lastSuccessAt:string|null;lastFailureAt:string|null;consecutiveFailures:number;updatedAt:string}
type Payload={status:'ok'|'degraded'|'down';checkedAt:string;providers:Provider[];components:Component[];error?:string}
const age=(value:string|null)=>{if(!value)return'—';const ms=Date.now()-new Date(value).getTime();if(ms<60000)return Math.max(0,Math.floor(ms/1000))+'s ago';if(ms<3600000)return Math.floor(ms/60000)+'m ago';return Math.floor(ms/3600000)+'h ago'}

export default function StatusPage(){
  const [data,setData]=useState<Payload|null>(null)
  useEffect(()=>{let alive=true;async function load(){try{const r=await fetch('/api/status',{cache:'no-store'}),j=await r.json();if(alive)setData(j)}catch{if(alive)setData({status:'down',checkedAt:new Date().toISOString(),providers:[],components:[],error:'status unavailable'})}}void load();const id=setInterval(()=>{if(!document.hidden)void load()},15000);return()=>{alive=false;clearInterval(id)}},[])
  const status=data?.status||'degraded'
  return <div className="ax-app"><AppHeader active="status"/><main className="terminal-page"><div className="terminal-page-inner">
    <div className="final-page-hero"><div><div className="terminal-eyebrow">PAPER SYSTEM STATUS</div><h1>Live provider and monitor health.</h1><p className="terminal-lead">Operational status from PAPER&apos;s server-side provider-health and heartbeat records. This page never exposes provider credentials or private error payloads.</p></div>{status==='ok'?<CheckCircle2 size={28}/>:<TriangleAlert size={28}/>}</div>
    <section className={'status-summary '+status}><span><i/><b>{status.toUpperCase()}</b></span><small>Checked {data?.checkedAt?new Date(data.checkedAt).toLocaleTimeString():'—'}</small></section>
    {data?.error&&<div className="error-card">{data.error}</div>}
    <section className="status-grid">
      <article className="status-panel"><div className="panel-title"><b>MARKET PROVIDERS</b><Server size={14}/></div>{!data?.providers.length?<div className="empty-card">Provider health is unavailable in this environment.</div>:data.providers.map(p=><div className="status-row" key={p.provider}><span className={'status-dot '+String(p.status).toLowerCase()}/><div><b>{p.provider}</b><small>last success {age(p.lastSuccessAt)} · {p.consecutiveFailures} consecutive failures</small></div><strong>{p.latencyMs==null?'—':p.latencyMs+' ms'}</strong><em>{p.status}</em></div>)}</article>
      <article className="status-panel"><div className="panel-title"><b>BACKGROUND COMPONENTS</b><Activity size={14}/></div>{!data?.components.length?<div className="empty-card">Monitor heartbeats are unavailable in this environment.</div>:data.components.map(p=><div className="status-row" key={p.component}><span className={'status-dot '+String(p.status).toLowerCase()}/><div><b>{p.component.replaceAll('_',' ')}</b><small>last success {age(p.lastSuccessAt)} · {p.consecutiveFailures} consecutive failures</small></div><strong>{p.latencyMs==null?'—':p.latencyMs+' ms'}</strong><em>{p.status}</em></div>)}</article>
    </section>
    <div className="leader-rule-note">A degraded provider does not automatically mean PAPER is down; market routes use fallbacks where available. Trading surfaces should label stale or degraded data instead of pretending it is live.</div>
  </div></main><BottomDock active="portfolio"/></div>
}
