'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'

type Row={
  user_id:string;period_key:'weekly'|'all_time';evaluation_status:string|null
  evaluation_pnl_usd:number;evaluation_roi_pct:number;win_rate_pct:number;trades_count:number
  funded_pnl_usd:number;funded_capital_usd:number;captured_at:string
  profiles:{username:string|null;display_name:string|null;avatar_url:string|null;avatar_emoji:string|null}|null
}
type Metric='eval_pnl'|'roi'|'win'|'funded'|'trades'
const money=(n:number)=>`${n>=0?'+':'-'}$${Math.abs(Number(n||0)).toFixed(2)}`

export default function LeaderboardsPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [rows,setRows]=useState<Row[]>([]),[period,setPeriod]=useState<'weekly'|'all_time'>('all_time'),[metric,setMetric]=useState<Metric>('eval_pnl'),[error,setError]=useState('')

  useEffect(()=>{
    if(!supabase)return
    let live=true
    async function load(){
      const {data,error}=await supabase.from('paper_leaderboard_v2')
        .select('user_id,period_key,evaluation_status,evaluation_pnl_usd,evaluation_roi_pct,win_rate_pct,trades_count,funded_pnl_usd,funded_capital_usd,captured_at,profiles(username,display_name,avatar_url,avatar_emoji)')
        .eq('period_key',period).limit(250)
      if(!live)return
      if(error){setRows([]);setError(error.message)}
      else{setRows((data||[]) as unknown as Row[]);setError('')}
    }
    void load()
    const id=window.setInterval(()=>{if(!document.hidden)void load()},12000)
    return()=>{live=false;clearInterval(id)}
  },[supabase,period])

  const ranked=useMemo(()=>{
    const value=(r:Row)=>metric==='eval_pnl'?Number(r.evaluation_pnl_usd):metric==='roi'?Number(r.evaluation_roi_pct):metric==='win'?Number(r.win_rate_pct):metric==='funded'?Number(r.funded_pnl_usd):Number(r.trades_count)
    return [...rows].sort((a,b)=>value(b)-value(a)).slice(0,100)
  },[rows,metric])

  const tabs:[Metric,string][]=[['eval_pnl','Evaluation P&L'],['roi','ROI'],['win','Win Rate'],['funded','Funded P&L'],['trades','Trades']]

  return <div className="ax-app"><AppHeader active="leaderboard"/><main className="terminal-page fomo-board-page"><div className="terminal-page-inner">
    <div className="leader-hero"><div><div className="terminal-eyebrow">PAPER LEADERBOARD · SERVER-VERIFIED</div><h1>Who is cooking?</h1><p className="terminal-lead">Evaluation and PAPER performance with weekly/all-time views. Traders can opt out of public rankings.</p></div><div className="leader-live-summary"><span><i/> VERIFIED SNAPSHOT</span><b>{rows.length}</b><small>visible traders</small><b>OFF</b><small>real-funded payouts</small></div></div>
    <div className="leader-mode-tabs"><button className={period==='weekly'?'active':''} onClick={()=>setPeriod('weekly')}>WEEKLY</button><button className={period==='all_time'?'active':''} onClick={()=>setPeriod('all_time')}>ALL TIME</button></div>
    <div className="leader-mode-tabs">{tabs.map(([id,label])=><button key={id} className={metric===id?'active':''} onClick={()=>setMetric(id)}>{label}</button>)}</div>
    {error&&<div className="error-card">{error}</div>}
    <div className="board fomo-board"><div className="board-row board-head"><span>#</span><span>Trader</span><span>EVAL P&amp;L</span><span>ROI</span><span>Win Rate</span><span>Funded P&amp;L</span></div>
      {!ranked.length&&!error&&<div className="empty-card">No visible leaderboard rows yet.</div>}
      {ranked.map((r,i)=>{const display=r.profiles?.display_name||r.profiles?.username||'Paper Trader';return <Link href={'/trader/'+r.user_id} className={'board-row '+(i<3?'podium':'')} key={r.user_id}>
        <b className="rank-number">{i+1}</b>
        <span className="leader-trader">{r.profiles?.avatar_url?<img src={r.profiles.avatar_url} alt=""/>:<span className="leader-emoji">{r.profiles?.avatar_emoji||'🪙'}</span>}<span><strong>{display}</strong><small>@{r.profiles?.username||'paper_trader'}</small><small className="eligible-badge">{String(r.evaluation_status||'PAPER').toUpperCase()}</small></span></span>
        <strong className={Number(r.evaluation_pnl_usd)>=0?'gain':'loss'}>{money(Number(r.evaluation_pnl_usd))}</strong>
        <span className={Number(r.evaluation_roi_pct)>=0?'gain':'loss'}>{Number(r.evaluation_roi_pct)>=0?'+':''}{Number(r.evaluation_roi_pct).toFixed(2)}%</span>
        <span>{Number(r.win_rate_pct).toFixed(1)}%</span>
        <span className={Number(r.funded_pnl_usd)>=0?'gain':'loss'}>{Number(r.funded_capital_usd)>0?money(Number(r.funded_pnl_usd)):'—'}</span>
      </Link>})}
    </div>
    <div className="leader-rule-note"><b>Privacy:</b> leaderboard opt-out is enforced server-side. Evaluation metrics use authoritative PAPER evaluation state. Funded P&amp;L remains zero/blank until real-funded accounts are legally activated; launch gates are still OFF.</div>
  </div></main><BottomDock active="leaderboard"/></div>
}
