'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

const blocked=/(nigg|fagg|kike|spic|chink|wetback|tranny|retard)/i

type Profile={id:string;username:string|null;display_name:string|null;avatar_url:string|null;avatar_emoji:string|null;paper_cash_sol:number;profile_completed:boolean}

export default function AppHeader({active}:{active:'discover'|'pulse'|'spot'|'wallet'|'leaderboard'|'profile'}){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [profile,setProfile]=useState<Profile|null>(null)
  const [uid,setUid]=useState('')
  const [username,setUsername]=useState('')
  const [displayName,setDisplayName]=useState('')
  const [avatarUrl,setAvatarUrl]=useState<string|null>(null)
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')

  useEffect(()=>{
    if(!supabase)return
    let alive=true
    void(async()=>{
      try{
        const user=await ensurePaperUser(supabase)
        if(!alive)return
        setUid(user.id)
        const {data,error}=await supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_emoji,paper_cash_sol,profile_completed').eq('id',user.id).single()
        if(error)throw error
        if(alive&&data){
          const p=data as Profile
          setProfile(p)
          setUsername(p.username||'')
          setDisplayName(p.display_name||'')
          setAvatarUrl(p.avatar_url||null)
        }
      }catch(e){if(alive)setMessage(e instanceof Error?e.message:'Could not start PAPER account')}
    })()
    return()=>{alive=false}
  },[supabase])

  async function chooseImage(file?:File){
    if(!file)return
    if(file.size>650_000){setMessage('PFP must be under 650 KB.');return}
    const reader=new FileReader()
    reader.onload=()=>setAvatarUrl(typeof reader.result==='string'?reader.result:null)
    reader.readAsDataURL(file)
  }

  async function finishOnboarding(){
    if(!supabase||!uid)return
    const u=username.trim()
    const d=(displayName.trim()||u)
    if(!/^[A-Za-z0-9_]{3,24}$/.test(u)){setMessage('Username must be 3–24 letters, numbers, or underscores.');return}
    if(blocked.test(`${u} ${d}`)){setMessage('Choose a different username or display name.');return}
    setSaving(true);setMessage('')
    const {data,error}=await supabase.from('profiles').update({username:u,display_name:d,avatar_url:avatarUrl,profile_completed:true,updated_at:new Date().toISOString()}).eq('id',uid).select('id,username,display_name,avatar_url,avatar_emoji,paper_cash_sol,profile_completed').single()
    setSaving(false)
    if(error){setMessage(error.message);return}
    setProfile(data as Profile)
  }

  const pfp=profile?.avatar_url||avatarUrl
  return <>
    <header className="ax-header">
      <Link href="/" className="ax-logo"><span className="ax-mark">▲</span><span>PAPER</span></Link>
      <nav className="ax-nav">
        <Link className={active==='discover'?'active':''} href="/">Discover</Link>
        <Link className={active==='pulse'?'active':''} href="/pulse">Pulse</Link>
        <Link className={active==='spot'?'active':''} href="/spot">Spot</Link>
        <Link className={active==='wallet'?'active':''} href="/wallet">Wallet</Link>
        <Link className={active==='leaderboard'?'active':''} href="/leaderboards">PnL</Link>
      </nav>
      <div className="ax-header-spacer"/>
      <div className="ax-search-pill">⌕ <span>Search tokens...</span></div>
      <Link href="/wallet" className="ax-balance-pill"><span className="sol-dot">≋</span>{profile?Number(profile.paper_cash_sol).toFixed(2):'—'} <small>PAPER SOL</small></Link>
      <Link href="/profile" className={`ax-pfp ${active==='profile'?'active':''}`}>{pfp?<img src={pfp} alt=""/>:<span>{profile?.avatar_emoji||'◢'}</span>}</Link>
    </header>

    {profile&&!profile.profile_completed&&<div className="onboard-backdrop">
      <div className="onboard-card">
        <div className="onboard-brand"><span className="ax-mark">▲</span> PAPER</div>
        <h1>Create your trader profile</h1>
        <p>No wallet connection. You start with <b>1,000 PAPER SOL</b>.</p>
        <label className="pfp-upload">
          <div className="pfp-preview">{avatarUrl?<img src={avatarUrl} alt=""/>:<span>◢</span>}</div>
          <div><b>{avatarUrl?'Change PFP':'Add a PFP'}</b><small>or keep the default</small></div>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void chooseImage(e.target.files?.[0])}/>
        </label>
        <label>Username<input autoFocus value={username} maxLength={24} placeholder="papertrader" onChange={e=>setUsername(e.target.value.replace(/\s+/g,'_'))}/></label>
        <label>Display name <span>optional</span><input value={displayName} maxLength={40} placeholder="Paper Trader" onChange={e=>setDisplayName(e.target.value)}/></label>
        {message&&<div className="onboard-error">{message}</div>}
        <button onClick={()=>void finishOnboarding()} disabled={saving}>{saving?'Creating profile…':'Continue'}</button>
        <small className="onboard-foot">PAPER trading only · no real funds connected</small>
      </div>
    </div>}
  </>
}
