'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import bs58 from 'bs58'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

type Profile={username:string|null;display_name:string|null;bio:string|null;x_handle:string|null;avatar_url:string|null;avatar_emoji:string|null;accent:string|null;paper_cash_sol:number}
type Payout={id:string;week_start:string;category:string;prize_sol:number;status:string;escrow_until:string|null;payout_wallet_snapshot:string|null}
type Security={payout_wallet_address:string|null;flagged_for_review:boolean}

const avatars=['🪙','🦍','🐸','🐕','🐈','🦊','🧠','🚀','👾','🦄','🐻','🐂']
const accents=['violet','blue','cyan','rose','amber','lime']
const blocked=/(nigg|fagg|kike|spic|chink|wetback|tranny|retard)/i

export default function ProfilePage(){
  const [profile,setProfile]=useState<Profile|null>(null)
  const [payout,setPayout]=useState<Payout|null>(null)
  const [security,setSecurity]=useState<Security|null>(null)
  const [userId,setUserId]=useState('')
  const [recoveryEmail,setRecoveryEmail]=useState('')
  const [username,setUsername]=useState('')
  const [displayName,setDisplayName]=useState('')
  const [bio,setBio]=useState('')
  const [xHandle,setXHandle]=useState('')
  const [avatar,setAvatar]=useState('🪙')
  const [avatarUrl,setAvatarUrl]=useState<string|null>(null)
  const [accent,setAccent]=useState('violet')
  const [message,setMessage]=useState('')
  const [recoveryMessage,setRecoveryMessage]=useState('')
  const [payoutMessage,setPayoutMessage]=useState('')
  const [busy,setBusy]=useState(true)
  const [uploading,setUploading]=useState(false)
  const [linking,setLinking]=useState(false)
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])

  useEffect(()=>{
    if(!supabase)return
    let alive=true
    void (async()=>{
      try{
        const user=await ensurePaperUser(supabase)
        if(!alive)return
        setUserId(user.id);setRecoveryEmail(user.email||'')
        const [{data,error},{data:pay},{data:sec}]=await Promise.all([
          supabase.from('profiles').select('username,display_name,bio,x_handle,avatar_url,avatar_emoji,accent,paper_cash_sol').eq('id',user.id).single(),
          supabase.from('weekly_payouts').select('id,week_start,category,prize_sol,status,escrow_until,payout_wallet_snapshot').eq('user_id',user.id).in('status',['awaiting_wallet','held','ready']).order('week_start',{ascending:false}).limit(1).maybeSingle(),
          supabase.from('account_security').select('payout_wallet_address,flagged_for_review').eq('user_id',user.id).maybeSingle(),
        ])
        if(error)throw error
        if(data&&alive){
          const p=data as Profile
          setProfile(p);setUsername(p.username||'');setDisplayName(p.display_name||'Paper Trader');setBio(p.bio||'');setXHandle(p.x_handle||'');setAvatar(p.avatar_emoji||'🪙');setAvatarUrl(p.avatar_url||null);setAccent(p.accent||'violet')
        }
        if(alive){setPayout((pay as Payout|null)||null);setSecurity((sec as Security|null)||null)}
      }catch(e){if(alive)setMessage(e instanceof Error?e.message:'Profile unavailable')}
      finally{if(alive)setBusy(false)}
    })()
    return()=>{alive=false}
  },[supabase])

  async function uploadProfilePicture(file?:File){
    if(!file||!supabase||!userId)return
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setMessage('Use a PNG, JPG, or WebP image.');return}
    if(file.size>2_000_000){setMessage('PFP must be under 2 MB.');return}
    setUploading(true);setMessage('')
    try{
      const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'
      const path=`${userId}/avatar.${ext}`
      const {error}=await supabase.storage.from('avatars').upload(path,file,{upsert:true,contentType:file.type,cacheControl:'3600'})
      if(error)throw error
      const {data}=supabase.storage.from('avatars').getPublicUrl(path)
      const url=`${data.publicUrl}?v=${Date.now()}`
      const {error:updateError}=await supabase.from('profiles').update({avatar_url:url,updated_at:new Date().toISOString()}).eq('id',userId)
      if(updateError)throw updateError
      setAvatarUrl(url);setMessage('Profile picture updated.')
    }catch(e){setMessage(e instanceof Error?e.message:'PFP upload failed')}
    finally{setUploading(false)}
  }

  async function save(e:FormEvent){
    e.preventDefault();if(!supabase||!userId)return
    const cleanUser=username.trim(),cleanDisplay=displayName.trim(),cleanBio=bio.trim()
    if(!/^[A-Za-z0-9_]{3,24}$/.test(cleanUser)){setMessage('Username must be 3–24 characters using letters, numbers, or underscores.');return}
    if(!cleanDisplay||cleanDisplay.length>40){setMessage('Display name must be 1–40 characters.');return}
    if(cleanBio.length>160){setMessage('Bio must be 160 characters or less.');return}
    if(blocked.test(`${cleanUser} ${cleanDisplay} ${cleanBio}`)){setMessage('Please choose different profile text.');return}
    setMessage('Saving…')
    const {error}=await supabase.from('profiles').update({username:cleanUser,display_name:cleanDisplay,bio:cleanBio||null,x_handle:xHandle.trim()||null,avatar_emoji:avatar,accent,updated_at:new Date().toISOString()}).eq('id',userId)
    if(error){setMessage(error.message);return}
    setProfile(p=>p?{...p,username:cleanUser,display_name:cleanDisplay,bio:cleanBio,x_handle:xHandle.trim(),avatar_emoji:avatar,accent}:p);setMessage('Profile saved.')
  }

  async function addRecoveryEmail(){
    if(!supabase)return
    const email=recoveryEmail.trim().toLowerCase()
    if(!/^\S+@\S+\.\S+$/.test(email)){setRecoveryMessage('Enter a valid email.');return}
    setRecoveryMessage('Sending verification…')
    const {error}=await supabase.auth.updateUser({email})
    setRecoveryMessage(error?error.message:'Check your email to verify it. Your PAPER history stays on this account.')
  }

  async function linkPayoutWallet(){
    if(!supabase||!payout)return
    setLinking(true);setPayoutMessage('')
    try{
      const provider=(window as unknown as {solana?:{connect:()=>Promise<{publicKey:{toString:()=>string}}> ;signMessage:(m:Uint8Array,encoding?:string)=>Promise<{signature:Uint8Array}>}}).solana
      if(!provider)throw new Error('Open this page with a Solana wallet extension such as Phantom or Backpack installed.')
      const connected=await provider.connect();const walletAddress=connected.publicKey.toString()
      const {data:challenge,error:challengeError}=await supabase.functions.invoke('payout-wallet-link',{body:{action:'challenge',walletAddress}})
      if(challengeError)throw challengeError;if(challenge?.error)throw new Error(challenge.error)
      const signed=await provider.signMessage(new TextEncoder().encode(challenge.message),'utf8');const signature=bs58.encode(signed.signature)
      const {data:verified,error:verifyError}=await supabase.functions.invoke('payout-wallet-link',{body:{action:'verify',walletAddress,nonce:challenge.nonce,signature}})
      if(verifyError)throw verifyError;if(verified?.error)throw new Error(verified.error)
      setSecurity({payout_wallet_address:walletAddress,flagged_for_review:false});setPayout({...payout,status:'ready',payout_wallet_snapshot:walletAddress});setPayoutMessage('Payout address verified. This signature did not authorize any trade or transfer.')
    }catch(e){setPayoutMessage(e instanceof Error?e.message:'Payout wallet verification failed')}
    finally{setLinking(false)}
  }

  return <div className="ax-app">
    <AppHeader active="profile"/>
    <main className="terminal-page"><div className="terminal-page-inner">
      <div className="terminal-eyebrow">PAPER TRADER PROFILE</div><h1>Your trading identity.</h1><p className="terminal-lead">Customize how you appear across the terminal. Your PAPER account is automatic; a real Solana address is only requested if you actually have a prize waiting.</p>
      {busy?<div className="empty-card">Loading your PAPER profile…</div>:!profile?<div className="error-card">{message||'Profile unavailable.'}</div>:<>
        <form className="profile-card" onSubmit={save}>
          <div className="profile-preview"><div className={`preview-avatar accent-${accent}`}>{avatarUrl?<img src={avatarUrl} alt="Profile"/>:avatar}</div><div><strong>{displayName||'Paper Trader'}</strong><div className="muted-small">@{username||'paper_trader'}</div><div className="muted-small">{Number(profile.paper_cash_sol).toFixed(2)} PAPER SOL balance</div></div></div>
          <label className="profile-pfp-upload">Profile picture<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e=>void uploadProfilePicture(e.target.files?.[0])}/><span>{uploading?'Uploading…':'Upload PNG/JPG/WebP · max 2 MB'}</span></label>
          <div className="profile-grid"><label>Username<input value={username} maxLength={24} onChange={e=>setUsername(e.target.value.replace(/\s+/g,'_'))}/></label><label>Display name<input value={displayName} maxLength={40} onChange={e=>setDisplayName(e.target.value)}/></label><label style={{gridColumn:'1 / -1'}}>Bio<textarea value={bio} maxLength={160} placeholder="Memecoin trader. PAPER P&L only." onChange={e=>setBio(e.target.value)}/></label><label>X handle (optional)<input value={xHandle} maxLength={32} placeholder="@handle" onChange={e=>setXHandle(e.target.value)}/></label><label>PAPER balance<input value={`${Number(profile.paper_cash_sol).toFixed(2)} PAPER SOL`} disabled/></label></div>
          <label style={{marginTop:16}}>Default avatar</label><div className="avatar-picker">{avatars.map(v=><button type="button" key={v} className={avatar===v?'avatar-choice selected':'avatar-choice'} onClick={()=>setAvatar(v)}>{v}</button>)}</div>
          <label>Accent</label><div className="accent-picker">{accents.map(v=><button type="button" aria-label={`${v} accent`} key={v} className={`accent-choice accent-${v} ${accent===v?'selected':''}`} onClick={()=>setAccent(v)}/>)}</div>
          <button className="profile-save" type="submit">SAVE PROFILE</button>{message&&<div className="profile-message">{message}</div>}
        </form>

        <section className="account-panel"><div className="terminal-eyebrow">ACCOUNT RECOVERY</div><h3>Protect your PAPER history</h3><p>Add an email so clearing cookies or changing devices does not have to mean losing this account. Optional and separate from payouts.</p><div className="inline-action"><input type="email" value={recoveryEmail} placeholder="you@example.com" onChange={e=>setRecoveryEmail(e.target.value)}/><button onClick={()=>void addRecoveryEmail()}>ADD RECOVERY EMAIL</button></div>{recoveryMessage&&<div className="profile-message">{recoveryMessage}</div>}</section>

        {payout&&<section className="account-panel payout-panel"><div className="terminal-eyebrow">REAL SOL PRIZE</div><h3>You’re in line for a payout.</h3><p><b>{Number(payout.prize_sol).toFixed(3)} REAL SOL</b> · {payout.category} · week of {payout.week_start}. Your PAPER trading account remains separate from the payout address.</p>{security?.flagged_for_review&&<div className="onboard-error">This account is under payout review.</div>}{security?.payout_wallet_address?<div className="verified-wallet"><span>Verified payout address</span><b>{security.payout_wallet_address.slice(0,6)}…{security.payout_wallet_address.slice(-6)}</b></div>:<button className="profile-save" disabled={linking||security?.flagged_for_review} onClick={()=>void linkPayoutWallet()}>{linking?'VERIFYING…':'LINK SOLANA PAYOUT ADDRESS'}</button>}<small>This signature only proves control of the receiving address. It cannot trade or move funds.</small>{payoutMessage&&<div className="profile-message">{payoutMessage}</div>}</section>}
      </>}
    </div></main>
    <BottomDock active="profile"/>
  </div>
}
