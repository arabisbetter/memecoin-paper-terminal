'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, ShieldCheck, WalletCards } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'

type WalletRow={
  address:string
  observedVolumeUsd:number
  score?:{value?:number;label?:string;confidence?:number;components?:Record<string,number>}
  metrics?:{balanceSol?:number;portfolioValueUsd?:number;pricedHoldings?:number;txSuccessRatePct?:number;active24h?:number;active7d?:number;topHoldingSharePct?:number}
  profitability?:{available?:boolean;reason?:string}
}
type Payload={wallets?:WalletRow[];live?:boolean;asOf?:number;note?:string;error?:string}
const short=(s:string)=>s.slice(0,6)+'…'+s.slice(-5)
const money=(n:number)=>n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(2)

export default function SmartMoneyPage(){
  const [data,setData]=useState<Payload>({}),[loading,setLoading]=useState(true)
  useEffect(()=>{
    let alive=true
    async function load(){
      try{const r=await fetch('/api/intelligence/smart-wallets',{cache:'no-store'}),j=await r.json();if(alive)setData(j)}
      catch(e){if(alive)setData({error:e instanceof Error?e.message:'Live wallet feed unavailable'})}
      finally{if(alive)setLoading(false)}
    }
    void load()
    const id=window.setInterval(()=>{if(!document.hidden)void load()},30000)
    return()=>{alive=false;clearInterval(id)}
  },[])
  const rows=data.wallets||[]
  return <div className="ax-app"><AppHeader active="wallets"/><main className="terminal-page"><div className="terminal-page-inner">
    <div className="final-page-hero"><div><div className="terminal-eyebrow">SMART-WALLET RADAR · LIVE OBSERVED ACTIVITY</div><h1>Score wallets without pretending we know their P&amp;L.</h1><p className="terminal-lead">PAPER samples wallets from live Solana pool trades, checks current on-chain activity and priced holdings, then scores reliability, activity, diversification and liquidity quality. It does not invent historical cost basis.</p></div><WalletCards size={28}/></div>
    {data.error&&<div className="error-card">{data.error}</div>}
    <div className="smart-wallet-note"><ShieldCheck size={14}/><span>{data.note||'Exact realized P&L is unavailable unless historical cost basis can be reconstructed reliably.'}</span></div>
    <section className="smart-wallet-grid">
      {loading&&!rows.length?<div className="empty-card">Sampling live wallets…</div>:!rows.length?<div className="empty-card">No active wallets were available from the sampled live pools on this refresh.</div>:rows.map((w,i)=><article key={w.address} className="smart-wallet-card">
        <div className="smart-wallet-rank"><b>#{i+1}</b><span className={Number(w.score?.value||0)>=65?'gain':''}>{Number(w.score?.value||0)}/100</span></div>
        <div className="smart-wallet-head"><div><b>{short(w.address)}</b><small>{w.score?.label||'UNSCORED'} · {Number(w.score?.confidence||0)}% data confidence</small></div><Link href={'/wallets?address='+encodeURIComponent(w.address)}>Inspect →</Link></div>
        <div className="smart-wallet-metrics">
          <span><small>OBSERVED LIVE VOLUME</small><b>{money(Number(w.observedVolumeUsd||0))}</b></span>
          <span><small>PRICED HOLDINGS</small><b>{money(Number(w.metrics?.portfolioValueUsd||0))}</b></span>
          <span><small>RECENT TX SUCCESS</small><b>{Number(w.metrics?.txSuccessRatePct||0).toFixed(0)}%</b></span>
          <span><small>24H ACTIVITY</small><b>{Number(w.metrics?.active24h||0)}</b></span>
          <span><small>7D ACTIVITY</small><b>{Number(w.metrics?.active7d||0)}</b></span>
          <span><small>TOP HOLDING SHARE</small><b>{Number(w.metrics?.topHoldingSharePct||0).toFixed(1)}%</b></span>
        </div>
        <div className="smart-wallet-components">{Object.entries(w.score?.components||{}).map(([k,v])=><span key={k}><small>{k.replaceAll(/([A-Z])/g,' $1')}</small><i><em style={{width:Math.max(0,Math.min(100,Number(v)))+'%'}}/></i><b>{Math.round(Number(v))}</b></span>)}</div>
        <div className="smart-wallet-foot"><Activity size={12}/><span>Live activity score only · profitability not inferred</span></div>
      </article>)}
    </section>
  </div></main><BottomDock active="wallets"/></div>
}
