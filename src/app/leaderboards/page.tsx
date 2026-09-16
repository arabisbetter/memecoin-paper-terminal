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
  captured_at:string
  profiles:{username:string|null;display_name:string|null;avatar_emoji:string|null;accent:string|null}|null
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
        .select('user_id,paper_pnl_sol,roi_pct,win_rate_pct,trades_count,captured_at,profiles(username,display_name,avatar_emoji,accent)')
        .eq('period_key','all_time').order('roi_pct',{ascending:false}).limit(100)
      if(!live)return
      if(error)setError(error.message);else setRows((data||[]) as unknown as Row[])
    }
    void load();const id=setInterval(load,15000)
    return()=>{live=false;clearInterval(id)}
  },[supabase])

  return <div className="page-shell">
    <header className="page-top"><Link href="/" className="brand">PAPER<span>.FUN</span></Link><span className="paper-pill">SIMULATED</span><div className="spacer"/><Link href="/">← Terminal</Link><Link href="/profile">Profile</Link></header>
    <main className="page-content">
      <div className="eyebrow">GLOBAL MEMECOIN PAPER LEADERBOARD</div>
      <h1>Prove your P&amp;L.</h1>
      <p className="lead">Every trader starts with 1,000 PAPER SOL. Rankings use realized PAPER performance, so temporary unrealized pumps do not become leaderboard profit until sold.</p>
      {error&&<div className="error-card">{error}</div>}
      <div className="board">
        <div className="board-row board-head"><span>#</span><span>Trader</span><span>PAPER P&amp;L</span><span>ROI</span><span>Win Rate</span><span>Trades</span></div>
        {!rows.length&&!error&&<div className="empty-card">No qualifying PAPER trades yet. The first trader to close a verified PAPER trade will take #1.</div>}
        {rows.map((r,i)=>{
          const display=r.profiles?.display_name||r.profiles?.username||'Paper Trader'
          return <Link href={`/trader/${r.user_id}`} className="board-row" key={r.user_id}>
            <b>{i+1}</b>
            <span style={{display:'flex',alignItems:'center',gap:8}}><span>{r.profiles?.avatar_emoji||'🪙'}</span><span>{display}</span></span>
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
