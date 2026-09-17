'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'

type Row={user_id:string;paper_pnl_sol:number;roi_pct:number;win_rate_pct:number;trades_count:number;eligible_for_prize:boolean;eligibility_reason:string|null;captured_at:string;profiles:{username:string|null;display_name:string|null;avatar_url:string|null;avatar_emoji:string|null;accent:string|null}|null}
type BoardMode='pnl'|'roi'|'win'|'active'
const pnl=(n:number)=>`${n>=0?'+':''}${n.toFixed(2)} PAPER SOL`

export default function LeaderboardsPage(){
  const [rows,setRows]=useState<Row[]>([])
  const [mode,setMode]=useState<BoardMode>('pnl')
  const [error,setError]=useState('')
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])

  useEffect(()=>{
    if(!supabase)return
    let live=true
    async function load(){
      const {data,error}=await supabase.from('leaderboard_snapshots').select('user_id,paper_pnl_sol,roi_pct,win_rate_pct,trades_count,eligible_for_prize,eligibility_reason,captured_at,profiles(username,display_name,avatar_url,avatar_emoji,accent)').eq('period_key','all_time').limit(250)
      if(!live)return
      if(error)setError(error.message);else{setRows((data||[]) as unknown as Row[]);setError('')}
    }
    void load();const id=window.setInterval(()=>{if(!document.hidden)void load()},12_000)
    return()=>{live=false;window.clearInterval(id)}
  },[supabase])

  const ranked=useMemo(()=>[...rows].sort((a,b)=>mode==='pnl'?Number(b.paper_pnl_sol)-Number(a.paper_pnl_sol):mode==='roi'?Number(b.roi_pct)-Number(a.roi_pct):mode==='win'?Number(b.win_rate_pct)-Number(a.win_rate_pct):Number(b.trades_count)-Number(a.trades_count)).slice(0,100),[rows,mode])
  const tabs:[BoardMode,string][]=[['pnl','Top P&L'],['roi','ROI'],['win','Win Rate'],['active','Most Active']]
  const eligible=rows.filter(r=>r.eligible_for_prize).length

  return <div className="ax-app"><AppHeader active="leaderboard"/><main className="terminal-page fomo-board-page"><div className="terminal-page-inner">
    <div className="leader-hero"><div><div className="terminal-eyebrow">FOMO LEADERBOARD · LIVE PAPER TRADERS</div><h1>Who is cooking?</h1><p className="terminal-lead">Ranked from server-verified PAPER fills. No screenshots, no self-reported P&amp;L, no real-money trading.</p></div><div className="leader-live-summary"><span><i/> LIVE</span><b>{rows.length}</b><small>ranked traders</small><b>{eligible}</b><small>prize eligible</small></div></div>
    <div className="leader-mode-tabs">{tabs.map(([id,label])=><button key={id} className={mode===id?'active':''} onClick={()=>setMode(id)}>{label}</button>)}</div>
    {error&&<div className="error-card">{error}</div>}
    <div className="board fomo-board">
      <div className="board-row board-head"><span>#</span><span>Trader</span><span>PAPER P&amp;L</span><span>ROI</span><span>Win Rate</span><span>Trades</span></div>
      {!ranked.length&&!error&&<div className="empty-card">No ranked PAPER traders yet. Trading activity will populate this board automatically.</div>}
      {ranked.map((r,i)=>{const display=r.profiles?.display_name||r.profiles?.username||'Paper Trader';const podium=i<3;return <Link href={`/trader/${r.user_id}`} className={`board-row ${podium?'podium':''}`} key={r.user_id} title={r.eligible_for_prize?'Prize eligible':r.eligibility_reason||'Not prize eligible yet'}><b className="rank-number">{i+1}</b><span className="leader-trader">{r.profiles?.avatar_url?<img src={r.profiles.avatar_url} alt=""/>:<span className="leader-emoji">{r.profiles?.avatar_emoji||'🪙'}</span>}<span><strong>{display}</strong><small>@{r.profiles?.username||'paper_trader'}</small>{r.eligible_for_prize&&<small className="eligible-badge">ELIGIBLE</small>}</span></span><strong className={Number(r.paper_pnl_sol)>=0?'gain':'loss'}>{pnl(Number(r.paper_pnl_sol||0))}</strong><span className={Number(r.roi_pct)>=0?'gain':'loss'}>{Number(r.roi_pct)>=0?'+':''}{Number(r.roi_pct).toFixed(2)}%</span><span>{Number(r.win_rate_pct).toFixed(1)}%</span><span>{r.trades_count}</span></Link>})}
    </div>
    <div className="leader-rule-note">Prize eligibility currently requires at least 10 PAPER trades, a 24-hour-old account, and no active review flag. Linking a real Solana payout address is only requested when a prize is actually pending.</div>
  </div></main><BottomDock active="leaderboard"/></div>
}
