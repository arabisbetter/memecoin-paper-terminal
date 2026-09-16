'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

type Profile={
  username:string|null
  display_name:string|null
  bio:string|null
  x_handle:string|null
  avatar_emoji:string|null
  accent:string|null
  paper_cash_sol:number
}

const avatars=['🪙','🦍','🐸','🐕','🐈','🦊','🧠','🚀','👾','🦄','🐻','🐂']
const accents=['violet','blue','cyan','rose','amber','lime']
const blocked=/(nigg|fagg|kike|spic|chink|wetback|tranny|retard)/i

export default function ProfilePage(){
  const [profile,setProfile]=useState<Profile|null>(null)
  const [userId,setUserId]=useState('')
  const [username,setUsername]=useState('')
  const [displayName,setDisplayName]=useState('')
  const [bio,setBio]=useState('')
  const [xHandle,setXHandle]=useState('')
  const [avatar,setAvatar]=useState('🪙')
  const [accent,setAccent]=useState('violet')
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(true)
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])

  useEffect(()=>{
    if(!supabase)return
    let alive=true
    void (async()=>{
      try{
        const user=await ensurePaperUser(supabase)
        if(!alive)return
        setUserId(user.id)
        const {data,error}=await supabase.from('profiles').select('username,display_name,bio,x_handle,avatar_emoji,accent,paper_cash_sol').eq('id',user.id).single()
        if(error)throw error
        if(data&&alive){
          const p=data as Profile
          setProfile(p)
          setUsername(p.username||'')
          setDisplayName(p.display_name||'Paper Trader')
          setBio(p.bio||'')
          setXHandle(p.x_handle||'')
          setAvatar(p.avatar_emoji||'🪙')
          setAccent(p.accent||'violet')
        }
      }catch(e){if(alive)setMessage(e instanceof Error?e.message:'Profile unavailable')}
      finally{if(alive)setBusy(false)}
    })()
    return()=>{alive=false}
  },[supabase])

  async function save(e:FormEvent){
    e.preventDefault()
    if(!supabase||!userId)return
    const cleanUser=username.trim()
    const cleanDisplay=displayName.trim()
    const cleanBio=bio.trim()
    if(!/^[A-Za-z0-9_]{3,24}$/.test(cleanUser)){setMessage('Username must be 3–24 characters using letters, numbers, or underscores.');return}
    if(!cleanDisplay||cleanDisplay.length>40){setMessage('Display name must be 1–40 characters.');return}
    if(cleanBio.length>160){setMessage('Bio must be 160 characters or less.');return}
    if(blocked.test(`${cleanUser} ${cleanDisplay} ${cleanBio}`)){setMessage('Please choose different profile text.');return}
    setMessage('Saving…')
    const {error}=await supabase.from('profiles').update({
      username:cleanUser,
      display_name:cleanDisplay,
      bio:cleanBio||null,
      x_handle:xHandle.trim()||null,
      avatar_emoji:avatar,
      accent,
      updated_at:new Date().toISOString(),
    }).eq('id',userId)
    if(error){setMessage(error.message);return}
    setProfile(p=>p?{...p,username:cleanUser,display_name:cleanDisplay,bio:cleanBio,x_handle:xHandle.trim(),avatar_emoji:avatar,accent}:p)
    setMessage('Profile saved.')
  }

  return <div className="page-shell">
    <header className="page-top"><Link href="/" className="brand">PAPER<span>.FUN</span></Link><span className="paper-pill">SIMULATED</span><div className="spacer"/><Link href="/">← Terminal</Link><Link href="/leaderboards">Leaderboard</Link></header>
    <main className="page-content narrow">
      <div className="eyebrow">PAPER TRADER PROFILE</div>
      <h1>Make your profile yours.</h1>
      <p className="lead">Your PAPER account is automatic. Customize how you appear on the leaderboard without connecting a crypto wallet.</p>
      {busy?<div className="empty-card">Loading your PAPER profile…</div>:!profile?<div className="error-card">{message||'Profile unavailable.'}</div>:<form className="profile-card" onSubmit={save}>
        <div className="profile-preview">
          <div className={`preview-avatar accent-${accent}`}>{avatar}</div>
          <div><strong>{displayName||'Paper Trader'}</strong><div style={{color:'#777d8d',fontSize:11,marginTop:3}}>@{username||'paper_trader'}</div><div style={{color:'#5f6575',fontSize:10,marginTop:4}}>{Number(profile.paper_cash_sol).toFixed(2)} PAPER SOL available</div></div>
        </div>

        <div className="profile-grid">
          <label>Username<input value={username} maxLength={24} onChange={e=>setUsername(e.target.value.replace(/\s+/g,'_'))}/></label>
          <label>Display name<input value={displayName} maxLength={40} onChange={e=>setDisplayName(e.target.value)}/></label>
          <label style={{gridColumn:'1 / -1'}}>Bio<textarea value={bio} maxLength={160} placeholder="Memecoin trader. Paper P&L only." onChange={e=>setBio(e.target.value)}/></label>
          <label>X handle (optional)<input value={xHandle} maxLength={32} placeholder="@handle" onChange={e=>setXHandle(e.target.value)}/></label>
          <label>PAPER wallet<input value={`${Number(profile.paper_cash_sol).toFixed(2)} PAPER SOL`} disabled/></label>
        </div>

        <label style={{marginTop:16}}>Avatar</label>
        <div className="avatar-picker">{avatars.map(v=><button type="button" key={v} className={avatar===v?'avatar-choice selected':'avatar-choice'} onClick={()=>setAvatar(v)}>{v}</button>)}</div>
        <label>Accent</label>
        <div className="accent-picker">{accents.map(v=><button type="button" aria-label={`${v} accent`} key={v} className={`accent-choice accent-${v} ${accent===v?'selected':''}`} onClick={()=>setAccent(v)}/>)}</div>
        <button className="profile-save" type="submit">SAVE PROFILE</button>
        {message&&<div className="profile-message">{message}</div>}
      </form>}
    </main>
  </div>
}
