'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CircleDot, ExternalLink, ShieldCheck, TimerReset } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'

type Intel={
  live?:boolean;asOf?:number;source?:string[];warning?:string;error?:string
  token?:{mint:string;symbol?:string|null;name?:string|null;priceUsd:number;marketCap:number;liquidityUsd:number;pairAddress?:string|null;dexId?:string|null;pairCreatedAt?:number|null;ageSeconds:number;stage:string}
  authority?:{mintAuthority?:string|null;freezeAuthority?:string|null;mintRevoked?:boolean|null;freezeRevoked?:boolean|null}
  distribution?:{top10Pct:number;top20Pct:number;holders:{rank:number;tokenAccount:string;owner?:string|null;amountUi:number;pct:number}[]}
  range?:{observedHigh?:number|null;observedLow?:number|null;observedSince?:number|null;drawdownFromObservedHighPct?:number|null}
  timeline?:{kind:string;at:number;label:string;detail:string}[]
}
const money=(n:number|null|undefined)=>{const v=Number(n||0);if(v>=1e9)return'$'+(v/1e9).toFixed(2)+'B';if(v>=1e6)return'$'+(v/1e6).toFixed(2)+'M';if(v>=1e3)return'$'+(v/1e3).toFixed(1)+'K';return v>0?'$'+v.toPrecision(5):'—'}
const short=(s?:string|null)=>s?s.slice(0,6)+'…'+s.slice(-5):'—'
const age=(s:number)=>s<60?s+'s':s<3600?Math.floor(s/60)+'m':s<86400?Math.floor(s/3600)+'h':Math.floor(s/86400)+'d'

export default function TokenIntelligencePage({params}:{params:Promise<{mint:string}>}){
  const [mint,setMint]=useState(''),[data,setData]=useState<Intel|null>(null),[loading,setLoading]=useState(true)
  useEffect(()=>{void params.then(p=>setMint(p.mint))},[params])
  useEffect(()=>{
    if(!mint)return
    let live=true
    async function load(){try{const r=await fetch('/api/intelligence/token/'+encodeURIComponent(mint),{cache:'no-store'}),j=await r.json();if(live)setData(j)}catch(e){if(live)setData({error:e instanceof Error?e.message:'Token intelligence unavailable'})}finally{if(live)setLoading(false)}}
    void load();const id=window.setInterval(()=>{if(!document.hidden)void load()},30000)
    return()=>{live=false;clearInterval(id)}
  },[mint])
  const t=data?.token,d=data?.distribution
  return <div className="ax-app"><AppHeader active="spot"/><main className="terminal-page"><div className="terminal-page-inner">
    <div className="final-page-hero"><div><div className="terminal-eyebrow">TOKEN INTELLIGENCE · LIVE SOLANA RPC</div><h1>{t?'$'+(t.symbol||'TOKEN')+' holder map':'Holder map & lifecycle'}</h1><p className="terminal-lead">Live largest-holder distribution, authority state, current venue, pair age and observed market range. PAPER does not infer common ownership from concentration alone.</p></div><CircleDot size={28}/></div>
    {data?.error&&<div className="error-card">{data.error}</div>}
    {loading&&!data?<div className="empty-card">Loading live token intelligence…</div>:t&&d?<>
      <section className="token-live-kpis">
        <span><small>PRICE</small><b>{money(t.priceUsd)}</b></span><span><small>MARKET CAP</small><b>{money(t.marketCap)}</b></span><span><small>LIQUIDITY</small><b>{money(t.liquidityUsd)}</b></span><span><small>STAGE</small><b>{t.stage}</b></span><span><small>AGE</small><b>{age(t.ageSeconds)}</b></span><span><small>VENUE</small><b>{t.dexId||'—'}</b></span>
      </section>
      <section className="holder-intel-grid">
        <article className="holder-map-card"><div className="panel-title"><b>TOP HOLDER BUBBLES</b><span>RPC largest token accounts</span></div><div className="holder-bubble-map">{d.holders.slice(0,20).map(h=>{const size=Math.max(42,Math.min(132,38+Math.sqrt(Math.max(0,h.pct))*15));return <a key={h.tokenAccount} href={'https://solscan.io/account/'+(h.owner||h.tokenAccount)} target="_blank" rel="noreferrer" className="holder-bubble" style={{width:size,height:size}} title={'#'+h.rank+' · '+h.pct.toFixed(2)+'%'}><b>#{h.rank}</b><strong>{h.pct.toFixed(1)}%</strong><small>{short(h.owner||h.tokenAccount)}</small></a>})}</div><div className="holder-map-summary"><span><small>TOP 10</small><b>{d.top10Pct.toFixed(2)}%</b></span><span><small>TOP 20</small><b>{d.top20Pct.toFixed(2)}%</b></span><span><small>OBSERVED ACCOUNTS</small><b>{d.holders.length}</b></span></div></article>
        <article className="token-lifecycle-card"><div className="panel-title"><b>LIVE LIFECYCLE</b><TimerReset size={14}/></div><div className="lifecycle-list">{(data.timeline||[]).map((e,i)=><div key={e.kind+'-'+i}><i/><span><b>{e.label}</b><small>{e.kind==='current_liquidity'?money(Number(e.detail)):e.kind==='pair_created'?new Date(Number(e.at)).toLocaleString():e.detail}</small></span></div>)}</div><div className="authority-grid"><span><small>MINT AUTHORITY</small><b className={data.authority?.mintRevoked?'gain':'loss'}>{data.authority?.mintRevoked?'REVOKED':short(data.authority?.mintAuthority)}</b></span><span><small>FREEZE AUTHORITY</small><b className={data.authority?.freezeRevoked?'gain':'loss'}>{data.authority?.freezeRevoked?'REVOKED':short(data.authority?.freezeAuthority)}</b></span><span><small>OBSERVED HIGH</small><b>{money(data.range?.observedHigh)}</b></span><span><small>FROM OBSERVED HIGH</small><b className={Number(data.range?.drawdownFromObservedHighPct||0)>=0?'gain':'loss'}>{data.range?.drawdownFromObservedHighPct==null?'—':Number(data.range.drawdownFromObservedHighPct).toFixed(1)+'%'}</b></span></div>{t.pairAddress&&<Link href={'/spot?mint='+t.mint} className="intel-open-terminal">OPEN LIVE TERMINAL <ExternalLink size={12}/></Link>}</article>
      </section>
      <div className="smart-wallet-note"><ShieldCheck size={14}/><span>{data.warning} Sources: {(data.source||[]).join(', ')}.</span></div>
    </>:null}
  </div></main><BottomDock active="spot"/></div>
}
