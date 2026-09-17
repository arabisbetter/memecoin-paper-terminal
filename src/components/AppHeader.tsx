'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { BarChart3, BriefcaseBusiness, Radio, Settings2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

const blocked=/(nigg|fagg|kike|spic|chink|wetback|tranny|retard)/i
type Profile={id:string;username:string|null;display_name:string|null;avatar_url:string|null;avatar_emoji:string|null;paper_cash_sol:number;profile_completed:boolean}
type Active='discover'|'pulse'|'spot'|'portfolio'|'leaderboard'|'profile'
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))

export default function AppHeader({active}:{active:Active}){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [profile,setProfile]=useState<Profile|null>(null)
  const [uid,setUid]=useState('')
  const [username,setUsername]=useState('')
  const [displayName,setDisplayName]=useState('')
  const [avatarPreview,setAvatarPreview]=useState<string|null>(null)
  const [avatarFile,setAvatarFile]=useState<File|null>(null)
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const [starting,setStarting]=useState(true)

  useEffect(()=>{
    if(!supabase){setStarting(false);setMessage('PAPER account service is not configured.');return}
    let alive=true
    async function readProfile(userId:string){
      let lastError=''
      for(let attempt=0;attempt<7;attempt++){
        const {data,error}=await supabase!.from('profiles').select('id,username,display_name,avatar_url,avatar_emoji,paper_cash_sol,profile_completed').eq('id',userId).maybeSingle()
        if(!alive)return null
        if(data)return data as Profile
        if(error)lastError=error.message
        await sleep(160*(attempt+1))
      }
      throw new Error(lastError||'PAPER profile was not created.')
    }
    void(async()=>{
      try{
        const user=await ensurePaperUser(supabase)
        if(!alive)return
        setUid(user.id)
        const p=await readProfile(user.id)
        if(!alive||!p)return
        setProfile(p);setUsername(p.profile_completed?p.username||'':'');setDisplayName(p.profile_completed?p.display_name||'':'');setAvatarPreview(p.avatar_url||null);setMessage('')
      }catch(e){if(alive)setMessage(e instanceof Error?e.message:'Could not start PAPER account')}
      finally{if(alive)setStarting(false)}
    })()
    return()=>{alive=false}
  },[supabase])

  useEffect(()=>{
    if(!supabase||!uid)return
    let alive=true
    const refresh=async()=>{
      const {data}=await supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_emoji,paper_cash_sol,profile_completed').eq('id',uid).maybeSingle()
      if(alive&&data){const p=data as Profile;setProfile(p);if(p.avatar_url)setAvatarPreview(p.avatar_url);setMessage('')}
    }
    const onChanged=()=>void refresh()
    window.addEventListener('paper:account-changed',onChanged)
    const id=window.setInterval(refresh,7000)
    return()=>{alive=false;window.clearInterval(id);window.removeEventListener('paper:account-changed',onChanged)}
  },[supabase,uid])

  useEffect(()=>()=>{if(avatarPreview?.startsWith('blob:'))URL.revokeObjectURL(avatarPreview)},[avatarPreview])

  function chooseImage(file?:File){
    if(!file)return
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setMessage('Use a PNG, JPG, or WebP image.');return}
    if(file.size>2_000_000){setMessage('PFP must be under 2 MB.');return}
    if(avatarPreview?.startsWith('blob:'))URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file);setAvatarPreview(URL.createObjectURL(file));setMessage('')
  }

  async function uploadAvatar(){
    if(!supabase||!uid||!avatarFile)return profile?.avatar_url||null
    const ext=avatarFile.type==='image/png'?'png':avatarFile.type==='image/webp'?'webp':'jpg';const path=`${uid}/avatar.${ext}`
    const {error}=await supabase.storage.from('avatars').upload(path,avatarFile,{upsert:true,contentType:avatarFile.type,cacheControl:'3600'})
    if(error)throw error
    const {data}=supabase.storage.from('avatars').getPublicUrl(path);return `${data.publicUrl}?v=${Date.now()}`
  }

  async function finishOnboarding(){
    if(!supabase||!uid)return
    const u=username.trim(),d=(displayName.trim()||u)
    if(!/^[A-Za-z0-9_]{3,24}$/.test(u)){setMessage('Username must be 3–24 letters, numbers, or underscores.');return}
    if(blocked.test(`${u} ${d}`)){setMessage('Choose a different username or display name.');return}
    setSaving(true);setMessage('')
    try{
      const avatarUrl=await uploadAvatar()
      const {data,error}=await supabase.from('profiles').update({username:u,display_name:d,avatar_url:avatarUrl,profile_completed:true,updated_at:new Date().toISOString()}).eq('id',uid).select('id,username,display_name,avatar_url,avatar_emoji,paper_cash_sol,profile_completed').single()
      if(error)throw error
      setProfile(data as Profile);setAvatarPreview((data as Profile).avatar_url||null);setAvatarFile(null);window.dispatchEvent(new Event('paper:account-changed'))
    }catch(e){setMessage(e instanceof Error?e.message:'Could not create profile')}
    finally{setSaving(false)}
  }

  const pfp=profile?.avatar_url||avatarPreview
  const spotActive=active==='discover'||active==='spot'
  const accountError=!starting&&!profile&&Boolean(message)
  const displayBalance=profile?Number(profile.paper_cash_sol).toFixed(2):starting?'1000.00':'—'

  return <>
    <header className="ax-header">
      <Link href="/" className="ax-logo"><span className="ax-mark">▲</span><span>PAPER</span></Link>
      <nav className="ax-nav ax-nav-minimal"><Link className={spotActive?'active':''} href="/">Spot</Link><Link className={active==='pulse'?'active':''} href="/pulse">Pulse</Link><Link className={active==='portfolio'?'active':''} href="/portfolio">Portfolio</Link></nav>
      <div className="ax-header-spacer"/>
      <Link className="icon-control" href="/portfolio" title="PAPER portfolio"><BriefcaseBusiness size={15}/></Link>
      <Link className="icon-control" href="/leaderboards" title="FOMO leaderboard"><BarChart3 size={15}/></Link>
      <Link className="icon-control" href="/pulse" title="Live Pulse"><Radio size={15}/></Link>
      <Link className="icon-control" href="/profile" title="Settings"><Settings2 size={15}/></Link>
      <div className={`ax-balance-pill ${accountError?'account-error-pill':''}`} title={accountError?message:'PAPER trading balance'}><span className="sol-dot">≋</span>{accountError?'ACCOUNT ERROR':displayBalance} {!accountError&&<small>PAPER SOL</small>}</div>
      <Link href="/profile" className={`ax-pfp ${active==='profile'?'active':''}`}>{pfp?<img src={pfp} alt="Profile"/>:<span>{profile?.avatar_emoji||'◢'}</span>}</Link>
    </header>
    {accountError&&<div className="account-start-error"><b>PAPER account could not load.</b><span>{message}</span><button onClick={()=>location.reload()}>Retry</button></div>}
    {profile&&!profile.profile_completed&&<div className="onboard-backdrop"><div className="onboard-card"><div className="onboard-brand"><span className="ax-mark">▲</span> PAPER</div><h1>Create your trader profile</h1><p>Choose a username and optional PFP. You start with <b>1,000 PAPER SOL</b>. No crypto wallet is connected to trade.</p><label className="pfp-upload"><div className="pfp-preview">{avatarPreview?<img src={avatarPreview} alt="PFP preview"/>:<span>◢</span>}</div><div><b>{avatarPreview?'Change PFP':'Add a PFP'}</b><small>PNG/JPG/WebP · max 2 MB · or keep default</small></div><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>chooseImage(e.target.files?.[0])}/></label><label>Username<input autoFocus value={username} maxLength={24} placeholder="papertrader" onChange={e=>setUsername(e.target.value.replace(/\s+/g,'_'))}/></label><label>Display name <span>optional</span><input value={displayName} maxLength={40} placeholder="Paper Trader" onChange={e=>setDisplayName(e.target.value)}/></label>{message&&<div className="onboard-error">{message}</div>}<button onClick={()=>void finishOnboarding()} disabled={saving}>{saving?'Creating profile…':'Continue to Spot'}</button><small className="onboard-foot">PAPER trading only · no real funds connected</small></div></div>}
  </>
}
