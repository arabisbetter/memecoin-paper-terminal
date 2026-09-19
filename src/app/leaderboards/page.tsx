'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Activity, ShieldCheck } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'

type Period='daily'|'weekly'|'monthly'|'all_time'
type Metric='pnl'|'roi'|'win'|'consistency'|'drawdown'|'trades'
type Row={
  user_id:string;period_key:Period;realized_pnl_usd:number;roi_pct:number;win_rate_pct:number;trades_count:number;closed_count:number;max_drawdown_pct:number;consistency_score:number;captured_at:string
  profiles:{username:string|null;display_name:string|null;avatar_url:string|null;avatar_emoji:string|null}|null
}
const money=(n:number)=>(n>=0?'+':'-')+'$'+Math.abs(Number(n||0)).toFixed(2)

export default function LeaderboardsPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [rows,setRows]=useState<Row[]>([]),[period,setPeriod]=useState<Period>('all_time'),[metric,setMetric]=useState<Metric>('pnl'),[error,setError]=useState(''),[asOf,setAsOf]=useState('')

  useEffect(()=>{
    if(!supabase)return
    let live=true
    async function load(){
      const {data,error}=await supabase.from('paper_leaderboard_periods')
        .select('user_id,period_key,realized_pnl_usd,roi_pct,win_rate_pct,trades_count,closed_count,max_drawdown_pct,consistency_score,captured_at,profiles(username,display_name,avatar_url,avatar_emoji)')
        .eq('period_key',period).limit(250)
      if(!live)return
      if(error){setRows([]);setError(error.message)}
      else{
        const list=(data||[]) as unknown as Row[]
        setRows(list);setError('')
        setAsOf(list.length?list.map(x=>x.captured_at).sort().at(-1)||'':'')
      }
    }
    void load()
    const id=window.setInterval(()=>{if(!document.hidden)void load()},10000)
    return()=>{live=false;clearInterval(id)}
  },[supabase,period])

  const ranked=useMemo(()=>{
    const value=(r:Row)=>metric==='pnl'?Number(r.realized_pnl_usd):metric==='roi'?Number(r.roi_pct):metric==='win'?Number(r.win_rate_pct):metric==='consistency'?Number(r.consistency_score):metric==='drawdown'?-Number(r.max_drawdown_pct):Number(r.trades_count)
    return [...rows].sort((a,b)=>value(b)-value(a)).slice(0,100)
  },[rows,metric])

  const periods:[Period,string][]=[['daily','TODAY'],['weekly','WEEK'],['monthly','MONTH'],['all_time','ALL TIME']]
  const tabs:[Metric,string][]=[['pnl','Realized P&L'],['roi','ROI'],['win','Win Rate'],['consistency','Consistency'],['drawdown','Low Drawdown'],['trades','Trades']]

  return <div className="ax-app"><AppHeader active="leaderboard"/><main className="terminal-page fomo-board-page"><div className="terminal-page-inner">
    <div className="leader-hero"><div><div className="terminal-eyebrow">PAPER LEADERBOARD · SERVER-VERIFIED</div><h1>Performance, not one lucky click.</h1><p className="terminal-lead">Daily, weekly, monthly and all-time rankings from server-recorded PAPER fills and portfolio snapshots. Traders can opt out at the database policy layer.</p></div><div className="leader-live-summary"><span><i/> LIVE SNAPSHOT</span><b>{rows.length}</b><small>visible traders</small><b>{asOf?new Date(asOf).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'—'}</b><small>latest refresh</small></div></div>

    <div className="leader-mode-tabs period-tabs">{periods.map(([id,label])=><button key={id} className={period===id?'active':''} onClick={()=>setPeriod(id)}>{label}</button>)}</div>
    <div className="leader-mode-tabs">{tabs.map(([id,label])=><button key={id} className={metric===id?'active':''} onClick={()=>setMetric(id)}>{label}</button>)}</div>
    {error&&<div className="error-card">{error}</div>}

    <div className="leader-method"><ShieldCheck size={13}/><span><b>Consistency score:</b> win rate − 1.5× max drawdown + up to 20 activity points. It is a PAPER ranking metric, not a prediction of future performance.</span></div>

    <div className="board fomo-board part10-board">
      <div className="board-row board-head"><span>#</span><span>Trader</span><span>Realized P&amp;L</span><span>ROI</span><span>Win</span><span>Consistency</span><span>Max DD</span><span>Trades</span></div>
      {!ranked.length&&!error&&<div className="empty-card">No visible leaderboard rows yet.</div>}
      {ranked.map((r,i)=>{const display=r.profiles?.display_name||r.profiles?.username||'Paper Trader';return <Link href={'/trader/'+r.user_id} className={'board-row '+(i<3?'podium':'')} key={r.user_id}>
        <b className="rank-number">{i+1}</b>
        <span className="leader-trader">{r.profiles?.avatar_url?<img src={r.profiles.avatar_url} alt=""/>:<span className="leader-emoji">{r.profiles?.avatar_emoji||'🪙'}</span>}<span><strong>{display}</strong><small>@{r.profiles?.username||'paper_trader'}</small>{i<3&&<small className="eligible-badge">TOP {i+1}</small>}</span></span>
        <strong className={Number(r.realized_pnl_usd)>=0?'gain':'loss'}>{money(Number(r.realized_pnl_usd))}</strong>
        <span className={Number(r.roi_pct)>=0?'gain':'loss'}>{Number(r.roi_pct)>=0?'+':''}{Number(r.roi_pct).toFixed(2)}%</span>
        <span>{Number(r.win_rate_pct).toFixed(1)}%</span>
        <span className="consistency-cell"><Activity size={11}/>{Number(r.consistency_score).toFixed(1)}</span>
        <span>{Number(r.max_drawdown_pct).toFixed(2)}%</span>
        <span>{Number(r.trades_count).toLocaleString()}</span>
      </Link>})}
    </div>
    <div className="leader-rule-note"><b>Scope:</b> all rankings are PAPER-only. Realized ROI uses the standard $1,000 PAPER starting balance. Max drawdown comes from server portfolio snapshots. No funded-return claim is mixed into this board.</div>
  </div></main><BottomDock active="leaderboard"/></div>
}
