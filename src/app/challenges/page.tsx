"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Challenge={current_value_usd:number;starting_value_usd:number;target_value_usd:number;status:string;started_at:string;completed_at:string|null};

export default function ChallengesPage(){
  const [challenge,setChallenge]=useState<Challenge|null>(null);
  const [signedIn,setSignedIn]=useState(false);
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[]);
  useEffect(()=>{if(!supabase)return;void (async()=>{const {data:{user}}=await supabase.auth.getUser();setSignedIn(!!user);if(!user)return;const {data}=await supabase.from("challenge_entries").select("current_value_usd,starting_value_usd,target_value_usd,status,started_at,completed_at").eq("user_id",user.id).eq("challenge_key","100k_to_10m").maybeSingle();if(data)setChallenge(data as Challenge)})()},[supabase]);
  const current=Number(challenge?.current_value_usd||100000), target=Number(challenge?.target_value_usd||10000000), progress=Math.max(0,Math.min(100,(current/target)*100));
  return <div className="page-shell"><header className="page-top"><Link href="/" className="brand">PAPER<span>.FUN</span></Link><span className="paper-pill">PAPER ONLY</span><div className="spacer"/><Link href="/">← Terminal</Link></header><main className="page-content narrow"><div className="eyebrow">MEMECOIN CHALLENGE</div><h1>$100K → $10M</h1><p className="lead">Only realized PAPER performance counts toward this challenge. Every underlying token and market move is real; no real token order is submitted.</p><div className="hero-card"><div className="challenge-number">{current.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0})} <small>PAPER</small></div><div className="big-progress"><div style={{width:`${progress}%`}}/></div><div className="challenge-scale"><span>$100K PAPER</span><span>$10M PAPER</span></div><div className="reward-box"><b>Target reward</b><strong>0.5 REAL SOL</strong><span>Reward configuration is separate from PAPER trading and will only be activated after treasury/payout setup.</span></div></div>{!signedIn&&<div className="empty-card">Connect your Solana wallet in the terminal to start recording challenge progress.</div>}{signedIn&&!challenge&&<div className="empty-card">Your challenge starts automatically with your first verified PAPER trade.</div>}</main></div>
}
