'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { BarChart3, BriefcaseBusiness, Gift, Layers3, Settings2, Star, WalletCards } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

const blocked=/(nigg|fagg|kike|spic|chink|wetback|tranny|retard)/i
const requiredLegal=[['tos','v1'],['privacy','v1'],['risk_disclosure','v1']] as const
type Profile={id:string;username:string|null;display_name:string|null;avatar_url:string|null;avatar_emoji:string|null;profile_completed:boolean}
type Account={user_id:string;cash_usd:number;starting_balance_usd:number;status:string}
type LegalRow={document_type:string;document_version:string}
type Active='discover'|'pulse'|'spot'|'portfolio'|'leaderboard'|'profile'|'wallets'|'rewards'|'chains'|'watchlist'

export default function AppHeader({active}:{active:Active}){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [profile,setProfile]=useState<Profile|null>(null)
  const [account,setAccount]=useState<Account|null>(null)
  const [uid,setUid]=useState('')
  const [username,setUsername]=useState('')
  const [displayName,setDisplayName]=useState('')
  const [avatarPreview,setAvatarPreview]=useState<string|null>(null)
  const [avatarFile,setAvatarFile]=useState<File|null>(null)
  const [saving,setSaving]=useState(false)
  const [legalSaving,setLegalSaving]=useState(false)
  const [legalAccepted,setLegalAccepted]=useState<boolean|null>(null)
  const [legalChecked,setLegalChecked]=useState(false)
  const [solUsd,setSolUsd]=useState(0)
  const [message,setMessage]=useState('')
  const [starting,setStarting]=useState(true)

  async function readAll(userId:string){
    if(!supabase)throw new Error('PAPER account service is not configured.')
    const [{data:p,error:pe},{data:a,error:ae},{data:l,error:le},solRes]=await Promise.all([
      supabase.from('profiles').select('id,username,display_name,avatar_url,avatar_emoji,profile_completed').eq('id',userId).single(),
      supabase.from('paper_accounts').select('user_id,cash_usd,starting_balance_usd,status').eq('user_id',userId).single(),
      supabase.from('legal_acceptances').select('document_type,document_version').eq('user_id',userId),
      fetch('/api/market/sol',{cache:'no-store'}).catch(()=>null),
    ])
    if(pe)throw pe
    if(ae)throw ae
    if(le)throw le
    const accepted=new Set(((l||[]) as LegalRow[]).map(r=>`${r.document_type}:${r.document_version}`))
    const legalOk=requiredLegal.every(([type,version])=>accepted.has(`${type}:${version}`))
    if(solRes?.ok){const j=await solRes.json().catch(()=>null);setSolUsd(Number(j?.priceUsd||0))}
    setProfile(p as Profile);setAccount(a as Account);setLegalAccepted(legalOk)
    const profileRow=p as Profile
    setUsername(profileRow.profile_completed?profileRow.username||'':'')
    setDisplayName(profileRow.profile_completed?profileRow.display_name||'':'')
    setAvatarPreview(profileRow.avatar_url||null)
    setMessage('')
  }

  useEffect(()=>{
    if(!supabase){setStarting(false);setMessage('PAPER account service is not configured.');return}
    let alive=true
    void(async()=>{
      try{const user=await ensurePaperUser(supabase);if(!alive)return;setUid(user.id);await readAll(user.id)}catch(e){if(alive)setMessage(e instanceof Error?e.message:'Could not start PAPER account')}finally{if(alive)setStarting(false)}
    })()
    return()=>{alive=false}
  },[supabase])

  useEffect(()=>{if(!uid)return;const refresh=()=>void readAll(uid);window.addEventListener('paper:account-changed',refresh);const id=window.setInterval(()=>{if(!document.hidden)refresh()},7000);return()=>{window.clearInterval(id);window.removeEventListener('paper:account-changed',refresh)}},[uid])
  useEffect(()=>()=>{if(avatarPreview?.startsWith('blob:'))URL.revokeObjectURL(avatarPreview)},[avatarPreview])

  function chooseImage(file?:File){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setMessage('Use a PNG, JPG, or WebP image.');return}if(file.size>2_000_000){setMessage('PFP must be under 2 MB.');return}if(avatarPreview?.startsWith('blob:'))URL.revokeObjectURL(avatarPreview);setAvatarFile(file);setAvatarPreview(URL.createObjectURL(file));setMessage('')}
  async function uploadAvatar(){if(!supabase||!uid||!avatarFile)return profile?.avatar_url||null;const ext=avatarFile.type==='image/png'?'png':avatarFile.type==='image/webp'?'webp':'jpg',path=`${uid}/avatar.${ext}`;const {error}=await supabase.storage.from('avatars').upload(path,avatarFile,{upsert:true,contentType:avatarFile.type,cacheControl:'3600'});if(error)throw error;const {data}=supabase.storage.from('avatars').getPublicUrl(path);return `${data.publicUrl}?v=${Date.now()}`}

  async function finishOnboarding(){
    if(!supabase||!uid)return
    const u=username.trim(),d=displayName.trim()||u
    if(!/^[A-Za-z0-9_]{3,24}$/.test(u)){setMessage('Username must be 3–24 letters, numbers, or underscores.');return}
    if(blocked.test(`${u} ${d}`)){setMessage('Choose a different username or display name.');return}
    setSaving(true);setMessage('')
    try{const avatarUrl=await uploadAvatar();const {data,error}=await supabase.from('profiles').update({username:u,display_name:d,avatar_url:avatarUrl,profile_completed:true,updated_at:new Date().toISOString()}).eq('id',uid).select('id,username,display_name,avatar_url,avatar_emoji,profile_completed').single();if(error)throw error;setProfile(data as Profile);setAvatarPreview((data as Profile).avatar_url||null);setAvatarFile(null);window.dispatchEvent(new Event('paper:account-changed'))}catch(e){setMessage(e instanceof Error?e.message:'Could not create profile')}finally{setSaving(false)}
  }

  async function acceptLegal(){
    if(!supabase||!uid||!legalChecked)return
    setLegalSaving(true);setMessage('')
    try{const {data,error}=await supabase.from('legal_acceptances').select('document_type,document_version').eq('user_id',uid);if(error)throw error;const existing=new Set(((data||[]) as LegalRow[]).map(r=>`${r.document_type}:${r.document_version}`));const rows=requiredLegal.filter(([type,version])=>!existing.has(`${type}:${version}`)).map(([document_type,document_version])=>({user_id:uid,document_type,document_version}));if(rows.length){const {error:insertError}=await supabase.from('legal_acceptances').insert(rows);if(insertError)throw insertError}setLegalAccepted(true)}catch(e){setMessage(e instanceof Error?e.message:'Could not record acceptance')}finally{setLegalSaving(false)}
  }

  const pfp=profile?.avatar_url||avatarPreview,spotActive=active==='discover'||active==='spot',accountError=!starting&&(!profile||!account)&&Boolean(message),cash=Number(account?.cash_usd||0),solEquivalent=solUsd>0?cash/solUsd:0,balanceText=starting?'Starting…':account?`$${cash.toFixed(2)} PAPER`:'—'

  return <>
    <header className="ax-header final-header"><Link href="/" className="ax-logo"><span className="ax-mark">▲</span><span>PAPER</span></Link><nav className="ax-nav ax-nav-minimal"><Link className={spotActive?'active':''} href="/">Spot</Link><Link className={active==='pulse'?'active':''} href="/pulse">Pulse</Link><Link className={active==='chains'?'active':''} href="/chains">Chains</Link><Link className={active==='portfolio'?'active':''} href="/portfolio">Portfolio</Link></nav><div className="ax-header-spacer"/><Link className={active==='wallets'?'icon-control active':'icon-control'} href="/wallets" title="Wallet tracker"><WalletCards size={15}/></Link><Link className={active==='watchlist'?'icon-control active':'icon-control'} href="/watchlist" title="Watchlist"><Star size={15}/></Link><Link className={active==='rewards'?'icon-control active':'icon-control'} href="/rewards" title="Rewards"><Gift size={15}/></Link><Link className={active==='leaderboard'?'icon-control active':'icon-control'} href="/leaderboards" title="Leaderboard"><BarChart3 size={15}/></Link><Link className="icon-control" href="/chains" title="Multi-chain"><Layers3 size={15}/></Link><Link className="icon-control" href="/portfolio" title="PAPER portfolio"><BriefcaseBusiness size={15}/></Link><Link className="icon-control" href="/profile" title="Settings"><Settings2 size={15}/></Link><div className={`ax-balance-pill ${accountError?'account-error-pill':''}`} title={accountError?message:solEquivalent?`${balanceText} · ≈ ${solEquivalent.toFixed(3)} SOL at current price`:'PAPER buying power'}><span className="paper-cash-mark">$</span>{accountError?'ACCOUNT ERROR':balanceText}</div><Link href="/profile" className={`ax-pfp ${active==='profile'?'active':''}`}>{pfp?<img src={pfp} alt="Profile"/>:<span>{profile?.avatar_emoji||'◢'}</span>}</Link></header>
    {accountError&&<div className="account-start-error"><b>PAPER account could not load.</b><span>{message}</span><button onClick={()=>location.reload()}>Retry</button></div>}
    {profile&&!profile.profile_completed&&<div className="onboard-backdrop"><div className="onboard-card"><div className="onboard-brand"><span className="ax-mark">▲</span> PAPER</div><h1>Create your trader profile</h1><p>Choose a username and optional PFP. Your account starts with <b>$1,000 PAPER buying power</b>. No crypto wallet is required to trade.</p><label className="pfp-upload"><div className="pfp-preview">{avatarPreview?<img src={avatarPreview} alt="PFP preview"/>:<span>◢</span>}</div><div><b>{avatarPreview?'Change PFP':'Add a PFP'}</b><small>PNG/JPG/WebP · max 2 MB · or keep default</small></div><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>chooseImage(e.target.files?.[0])}/></label><label>Username<input autoFocus value={username} maxLength={24} placeholder="papertrader" onChange={e=>setUsername(e.target.value.replace(/\s+/g,'_'))}/></label><label>Display name <span>optional</span><input value={displayName} maxLength={40} placeholder="Paper Trader" onChange={e=>setDisplayName(e.target.value)}/></label>{message&&<div className="onboard-error">{message}</div>}<button onClick={()=>void finishOnboarding()} disabled={saving}>{saving?'Creating profile…':'Continue'}</button><small className="onboard-foot">PAPER trading only · no real funds connected</small></div></div>}
    {profile?.profile_completed&&legalAccepted===false&&<div className="onboard-backdrop"><div className="onboard-card legal-gate"><div className="onboard-brand"><span className="ax-mark">▲</span> PAPER</div><h1>Before your first PAPER trade</h1><p>PAPER uses real market data for simulated trading. PAPER fills can differ from real on-chain execution, and nothing here is investment advice.</p><div className="legal-links"><Link href="/legal#terms" target="_blank">Terms of Service</Link><Link href="/legal#privacy" target="_blank">Privacy Policy</Link><Link href="/legal#risk" target="_blank">Risk Disclosure</Link></div><label className="legal-check"><input type="checkbox" checked={legalChecked} onChange={e=>setLegalChecked(e.target.checked)}/><span>I have read and accept the current Terms, Privacy Policy, and Risk Disclosure.</span></label>{message&&<div className="onboard-error">{message}</div>}<button disabled={!legalChecked||legalSaving} onClick={()=>void acceptLegal()}>{legalSaving?'Saving acceptance…':'Accept & enter PAPER'}</button><small className="onboard-foot">PAPER only — no real trade is submitted.</small></div></div>}
  </>
}
