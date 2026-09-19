'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BrainCircuit, ExternalLink, Radar, RefreshCw, Search } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken, MarketTrade } from '@/lib/types'

type Snapshot={
  address:string;smart_score:number;confidence:'LOW'|'MEDIUM'|'HIGH';recent_tx_count:number;tx_success_pct:number|null;
  swap_count_30d:number|null;active_days_30d:number|null;unique_tokens_30d:number|null;sol_balance:number|null;
  priced_portfolio_usd:number|null;priced_holding_count:number;top_holding_pct:number|null;last_activity_at:string|null;
  profitability_status:'UNKNOWN'|'PARTIAL'|'VERIFIED';estimated_realized_pnl_usd:number|null;estimated_win_rate_pct:number|null;
  sources:string[];score_components:{activity?:number;consistency?:number;reliability?:number;breadth?:number;recency?:number};observed_at:string
}
const walletRe=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const short=(s:string)=>s.slice(0,5)+'…'+s.slice(-5)
const money=(n:number|null)=>n==null?'—':n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(2)

export default function SmartMoneyPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [rows,setRows]=useState<Snapshot[]>([]),[address,setAddress]=useState(''),[busy,setBusy]=useState(false),[discovering,setDiscovering]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')

  async function load(){if(!supabase)return;const {data,error}=await supabase.from('paper_smart_wallet_snapshots').select('*').order('smart_score',{ascending:false}).order('observed_at',{ascending:false}).limit(100);if(error)setError(error.message);else setRows((data||[]) as Snapshot[])}
  useEffect(()=>{void load()},[supabase])

  async function scanWallet(wallet:string){
    if(!supabase)throw new Error('PAPER account unavailable')
    await ensurePaperUser(supabase)
    const {data,error}=await supabase.functions.invoke('smart-wallet-scan',{body:{address:wallet}})
    if(error)throw error
    if(data?.error)throw new Error(data.error)
    return data.wallet as Snapshot
  }
  async function manual(e:FormEvent){e.preventDefault();const w=address.trim();if(!walletRe.test(w)){setError('Enter a valid Solana wallet address.');return}setBusy(true);setError('');setNotice('');try{const snapshot=await scanWallet(w);setRows(v=>[snapshot,...v.filter(x=>x.address!==w)].sort((a,b)=>b.smart_score-a.smart_score));setNotice('Live wallet scan complete.');setAddress('')}catch(e){setError(e instanceof Error?e.message:'Wallet scan failed')}finally{setBusy(false)}}
  async function discover(){
    if(!supabase||discovering)return
    setDiscovering(true);setError('');setNotice('')
    try{
      await ensurePaperUser(supabase)
      const r=await fetch('/api/market/latest',{cache:'no-store'}),j=await r.json()
      if(!r.ok)throw new Error(j.error||'Live market feed unavailable')
      const tokens=(j.tokens||[]) as MarketToken[]
      const active=tokens.filter(t=>t.pairAddress&&Number(t.volume5m||0)>0).sort((a,b)=>Number(b.volume5m||0)-Number(a.volume5m||0)).slice(0,5)
      const tapes=await Promise.all(active.map(async t=>{try{const tr=await fetch('/api/market/trades/'+encodeURIComponent(t.pairAddress!),{cache:'no-store'}),tj=await tr.json();return (tj.trades||[]) as MarketTrade[]}catch{return[]}}))
      const candidates=new Map<string,{count:number;volume:number}>()
      for(const trade of tapes.flat()){const a=String(trade.trader||'');if(!walletRe.test(a))continue;const cur=candidates.get(a)||{count:0,volume:0};cur.count++;cur.volume+=Number(trade.volumeUsd||0);candidates.set(a,cur)}
      const wallets=[...candidates.entries()].sort((a,b)=>(b[1].count*1000+b[1].volume)-(a[1].count*1000+a[1].volume)).slice(0,8).map(x=>x[0])
      if(!wallets.length)throw new Error('No trader addresses were available from the current live trade tapes.')
      const scanned:Snapshot[]=[]
      for(let i=0;i<wallets.length;i+=2){
        const batch=await Promise.all(wallets.slice(i,i+2).map(async w=>{try{return await scanWallet(w)}catch{return null}}))
        scanned.push(...batch.filter((x):x is Snapshot=>Boolean(x)))
      }
      await load()
      setNotice('Scanned '+scanned.length+' wallets observed on current live token tapes.')
    }catch(e){setError(e instanceof Error?e.message:'Smart-money discovery failed')}finally{setDiscovering(false)}
  }

  return <div className="ax-app"><AppHeader active="wallets"/><main className="terminal-page"><div className="terminal-page-inner">
    <div className="final-page-hero"><div><div className="terminal-eyebrow">SMART WALLET INTELLIGENCE · LIVE ON-CHAIN</div><h1>Score what can actually be observed.</h1><p className="terminal-lead">PAPER ranks recent wallet behavior using real mainnet activity, swap cadence, active days, transaction reliability, token breadth and recency. Historical P&L stays unknown unless reconstructable cost basis exists.</p></div><BrainCircuit size={28}/></div>
    <section className="smart-money-tools"><form onSubmit={manual}><Search size={14}/><input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Scan a Solana wallet address"/><button disabled={busy}>{busy?'Scanning…':'Scan wallet'}</button></form><button onClick={()=>void discover()} disabled={discovering}><Radar size={13}/>{discovering?'Scanning live tapes…':'Discover from live tapes'}</button><button onClick={()=>void load()}><RefreshCw size={13}/>Refresh</button></section>
    {error&&<div className="error-card">{error}</div>}{notice&&<div className="terminal-toast">{notice}</div>}
    <section className="smart-score-explainer"><b>SMART SCORE</b><span>30 activity · 25 consistency · 15 transaction reliability · 15 token breadth · 15 recency</span><strong>No wealth bonus. No invented win rate.</strong></section>
    <section className="smart-leaderboard"><div className="smart-row head"><span>#</span><span>Wallet</span><span>Score</span><span>Confidence</span><span>30d swaps</span><span>Active days</span><span>Tokens</span><span>TX success</span><span>Priced portfolio</span><span>P&L</span></div>
      {!rows.length?<div className="empty-card">No wallets have been live-scanned yet. Use “Discover from live tapes” to build the leaderboard from current market participants.</div>:rows.map((w,i)=><div className="smart-row" key={w.address}><b>{i+1}</b><span><Link href={'/wallets?address='+w.address}>{short(w.address)}</Link><a href={'https://solscan.io/account/'+w.address} target="_blank" rel="noreferrer"><ExternalLink size={10}/></a></span><strong>{w.smart_score}</strong><span className={'smart-confidence '+w.confidence.toLowerCase()}>{w.confidence}</span><span>{w.swap_count_30d??'—'}</span><span>{w.active_days_30d??'—'}</span><span>{w.unique_tokens_30d??'—'}</span><span>{w.tx_success_pct==null?'—':w.tx_success_pct.toFixed(0)+'%'}</span><span>{money(w.priced_portfolio_usd)}</span><span title="PAPER does not claim historical wallet profitability without reconstructable cost basis">{w.profitability_status==='VERIFIED'&&w.estimated_realized_pnl_usd!=null?money(w.estimated_realized_pnl_usd):'UNKNOWN'}</span></div>)}
    </section>
  </div></main><BottomDock active="wallets"/></div>
}
