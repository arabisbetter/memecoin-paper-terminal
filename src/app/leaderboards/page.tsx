"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  user_id: string;
  paper_pnl_usd: number;
  roi_pct: number;
  win_rate_pct: number;
  trades_count: number;
  captured_at: string;
  profiles: { username: string | null; wallet_address: string | null } | null;
};

const usd=(n:number)=>`${n>=0?"+":"-"}$${Math.abs(n).toLocaleString(undefined,{maximumFractionDigits:0})}`;
const short=(v:string)=>v.length>10?`${v.slice(0,5)}…${v.slice(-4)}`:v;

export default function LeaderboardsPage(){
  const [rows,setRows]=useState<Row[]>([]);
  const [error,setError]=useState("");
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[]);

  useEffect(()=>{
    if(!supabase)return;
    let live=true;
    async function load(){
      const {data,error}=await supabase.from("leaderboard_snapshots")
        .select("user_id,paper_pnl_usd,roi_pct,win_rate_pct,trades_count,captured_at,profiles(username,wallet_address)")
        .eq("period_key","all_time").order("roi_pct",{ascending:false}).limit(100);
      if(!live)return;
      if(error)setError(error.message); else setRows((data||[]) as unknown as Row[]);
    }
    void load(); const id=setInterval(load,15000);
    return()=>{live=false;clearInterval(id)};
  },[supabase]);

  return <div className="page-shell">
    <header className="page-top"><Link href="/" className="brand">PAPER<span>.FUN</span></Link><span className="paper-pill">PAPER ONLY</span><div className="spacer"/><Link href="/">← Terminal</Link></header>
    <main className="page-content">
      <div className="eyebrow">GLOBAL MEMECOIN PAPER LEADERBOARD</div>
      <h1>Prove your P&amp;L.</h1>
      <p className="lead">Ranked by realized PAPER performance. Open-position pumps do not count until the PAPER gain is realized.</p>
      {error&&<div className="error-card">{error}</div>}
      <div className="board">
        <div className="board-row board-head"><span>#</span><span>Trader</span><span>PAPER P&amp;L</span><span>ROI</span><span>Win Rate</span><span>Trades</span></div>
        {!rows.length&&!error&&<div className="empty-card">No qualifying PAPER trades yet. The first verified PAPER trader will take #1.</div>}
        {rows.map((r,i)=>{const who=r.profiles?.username||r.profiles?.wallet_address||`Trader ${r.user_id.slice(0,6)}`;return <div className="board-row" key={r.user_id}><b>{i+1}</b><span>{short(who)}</span><strong className={Number(r.paper_pnl_usd)>=0?"gain":"loss"}>{usd(Number(r.paper_pnl_usd))} PAPER</strong><span>{Number(r.roi_pct).toFixed(2)}%</span><span>{Number(r.win_rate_pct).toFixed(1)}%</span><span>{r.trades_count}</span></div>})}
      </div>
    </main>
  </div>
}
