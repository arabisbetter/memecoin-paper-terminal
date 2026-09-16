'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Profile={username:string|null;display_name:string|null;bio:string|null;x_handle:string|null;avatar_emoji:string|null;accent:string|null}
type Stats={paper_pnl_sol:number;roi_pct:number;win_rate_pct:number;trades_count:number}

export default function TraderPage(){
  const params=useParams<{id:string}>()
  const [profile,setProfile]=useState<Profile|null>(null)
  const [stats,setStats]=useState<Stats|null>(null)
  const [error,setError]=useState('')
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])

  useEffect(()=>{
    if(!supabase||!params.id)return
    let live=true
    void (async()=>{
      const [{data:p,error:pe},{data:s,error:se}]=await Promise.all([
        supabase.from('profiles').select('username,display_name,bio,x_handle,avatar_emoji,accent').eq('id',params.id).single(),
        supabase.from('leaderboard_snapshots').select('paper_pnl_sol,roi_pct,win_rate_pct,trades_count').eq('period_key','all_time').eq('user_id',params.id).maybeSingle(),
      ])
      if(!live)return
      if(pe){setError(pe.message);return}
      setProfile(p as Profile)
      if(!se&&s)setStats(s as Stats)
    })()
    return()=>{live=false}
  },[supabase,params.id])

  return <div className="page-shell">
    <header className="page-top"><Link href="/" className="brand">PAPER<span>.FUN</span></Link><span className="paper-pill">SIMULATED</span><div className="spacer"/><Link href="/leaderboards">← Leaderboard</Link></header>
    <main className="page-content narrow">
      {error?<div className="error-card">Trader not found.</div>:!profile?<div className="empty-card">Loading trader…</div>:<>
        <div className="public-profile">
          <div className={`public-avatar accent-${profile.accent||'violet'}`}>{profile.avatar_emoji||'🪙'}</div>
          <div><div className="eyebrow">PAPER TRADER</div><h2>{profile.display_name||'Paper Trader'}</h2><p>@{profile.username||'paper_trader'}{profile.x_handle?` · ${profile.x_handle}`:''}</p>{profile.bio&&<p style={{marginTop:9,maxWidth:470,lineHeight:1.5}}>{profile.bio}</p>}</div>
        </div>
        <div className="stat-grid">
          <div className="stat-card"><small>PAPER P&amp;L</small><b className={(stats?.paper_pnl_sol||0)>=0?'gain':'loss'}>{(stats?.paper_pnl_sol||0)>=0?'+':''}{Number(stats?.paper_pnl_sol||0).toFixed(2)} SOL</b></div>
          <div className="stat-card"><small>ROI</small><b>{Number(stats?.roi_pct||0).toFixed(2)}%</b></div>
          <div className="stat-card"><small>WIN RATE</small><b>{Number(stats?.win_rate_pct||0).toFixed(1)}%</b></div>
          <div className="stat-card"><small>TRADES</small><b>{stats?.trades_count||0}</b></div>
        </div>
      </>}
    </main>
  </div>
}
