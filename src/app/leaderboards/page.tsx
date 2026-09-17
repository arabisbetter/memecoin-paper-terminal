'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Row={
  user_id:string
  paper_pnl_sol:number
  roi_pct:number
  win_rate_pct:number
  trades_count:number
  eligible_for_prize:boolean
  eligibility_reason:string|null
  captured_at:string
  profiles:{username:string|null;display_name:string|null;avatar_url:string|null;avatar_emoji:string|null;accent:string|null}|null
}

const pnl=(n:number)=>`${n>=0?'+':''}${n.toFixed(2)} PAPER SOL`

export default function LeaderboardsPage(){
  const [rows,setRows]=useState<Row[]>([])
  const [error,setError]=useState('')
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])

  useEffect(()=>{
    if(!supabase)return
    let live=true
    async function load(){
      const {data,error}=await supabase.from('leaderboard_snapshots')
        .select('user_id,paper_pnl_sol,roi_pct,win_rate_pct,trades_count,eligible_for_prize,eligibility_reason,captured_at,profiles(username,display_name,avatar_url,avatar_emoji,accent)')
        .eq('period_key','all_time').order('roi_pct',{ascending:false}).limit(100)
      if(!live)return
      if(error)setError(error.message);else setRows((data||[]) as unknown as Row[])
    }
    void load();const id=setInterval(load,15000)
    return()=>{live=false;clearInterval(id)}
  },[supabase])

  return <div className="page-shell">
    <header className="page-top"><Link href="/" className="brand">PAPER</Link><div className="spacer"/><Link href="/">Spot</Link><Link href="/pulse">Pulse</Link><Link href="/profile">Profile</Link></header>
    <main className="page-content">
      <div className="eyebrow">GLOBAL MEMECOIN PAPER LEADERBOARD</div>
      <h1>Prove your P&amp;L.</h1>
      <p className="lead">Everyone can appear live. Prize eligibility is stricter: at least 10 PAPER trades, a 24-hour-old account, and no active review flag.</p>
      {error&&<div className="error-card">{error}</div>}
      <div className="board">
        <div className="board-row board-head"><span>#</span><span>Trader</span><span>PAPER P&amp;L</span><span>ROI</span><span>Win Rate</span><span>Trades</span></div>
        {!rows.length&&!error&&<div className="empty-card">No PAPER trades yet. The first closed PAPER trade will populate the board.</div>}
        {rows.map((r,i)=>{
          const display=r.profiles?.display_name||r.profiles?.username||'Paper Trader'
          return <Link href={`/trader/${r.user_id}`} className="board-row" key={r.user_id} title={r.eligible_for_prize?'Prize eligible':r.eligibility_reason||'Not prize eligible yet'}>
            <b>{i+1}</b>
            <span className="leader-trader">{r.profiles?.avatar_url?<img src={r.profiles.avatar_url} alt=""/>:<span className="leader-emoji">{r.profiles?.avatar_emoji||'🪙'}</span>}<span>{display}{r.eligible_for_prize&&<small className="eligible-badge">ELIGIBLE</small>}</span></span>
            <strong className={Number(r.paper_pnl_sol)>=0?'gain':'loss'}>{pnl(Number(r.paper_pnl_sol||0))}</strong>
            <span>{Number(r.roi_pct).toFixed(2)}%</span>
            <span>{Number(r.win_rate_pct).toFixed(1)}%</span>
            <span>{r.trades_count}</span>
          </Link>
        })}
      </div>
    </main>
  </div>
}
