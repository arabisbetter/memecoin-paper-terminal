"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Profile={username:string|null;wallet_address:string|null;x_handle:string|null;paper_cash_sol:number};

export default function ProfilePage(){
  const [profile,setProfile]=useState<Profile|null>(null);const [userId,setUserId]=useState("");const [username,setUsername]=useState("");const [xHandle,setXHandle]=useState("");const [message,setMessage]=useState("");
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[]);
  useEffect(()=>{if(!supabase)return;void (async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return;setUserId(user.id);const {data}=await supabase.from("profiles").select("username,wallet_address,x_handle,paper_cash_sol").eq("id",user.id).single();if(data){setProfile(data as Profile);setUsername(data.username||"");setXHandle(data.x_handle||"")}})()},[supabase]);
  async function save(e:FormEvent){e.preventDefault();if(!supabase||!userId)return;setMessage("Saving…");const {error}=await supabase.from("profiles").update({username:username||null,x_handle:xHandle||null,updated_at:new Date().toISOString()}).eq("id",userId);setMessage(error?error.message:"Profile saved.")}
  return <div className="page-shell"><header className="page-top"><Link href="/" className="brand">PAPER<span>.FUN</span></Link><span className="paper-pill">PAPER ONLY</span><div className="spacer"/><Link href="/">← Terminal</Link></header><main className="page-content narrow"><div className="eyebrow">TRADER PROFILE</div><h1>Your PAPER identity.</h1>{!profile?<div className="empty-card">Connect your Solana wallet in the terminal to create/load a profile.</div>:<form className="profile-card" onSubmit={save}><label>Wallet<input value={profile.wallet_address||""} disabled/></label><label>Username<input value={username} maxLength={32} onChange={e=>setUsername(e.target.value)}/></label><label>X handle<input value={xHandle} placeholder="@handle" onChange={e=>setXHandle(e.target.value)}/></label><label>PAPER cash<input value={`${Number(profile.paper_cash_sol).toFixed(3)} PAPER SOL`} disabled/></label><button className="paper-buy" type="submit">SAVE PROFILE</button>{message&&<div className="disclaimer">{message}</div>}</form>}</main></div>
}
