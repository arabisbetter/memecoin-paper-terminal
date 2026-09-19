'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

type Profile={username:string|null;display_name:string|null;bio:string|null;x_handle:string|null;avatar_url:string|null;avatar_emoji:string|null;accent:string|null}
type Stats={evaluation_pnl_usd:number;evaluation_roi_pct:number;win_rate_pct:number;trades_count:number;funded_pnl_usd:number;funded_capital_usd:number;evaluation_status:string|null}
type Card={trade_id:string;token_symbol:string|null;action:string;notional_usd:number|null;fee_usd:number|null;execution_quality:string|null;verified:boolean;created_at:string}
type Activity={id:number;event_type:string;token_symbol:string|null;payload:Record<string,unknown>;created_at:string}
type Badge={badge_key:string;earned_at:string}

export default function TraderPage(){
  const params=useParams<{id:string}>()
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [profile,setProfile]=useState<Profile|null>(null),[stats,setStats]=useState<Stats|null>(null)
  const [cards,setCards]=useState<Card[]>([]),[activity,setActivity]=useState<Activity[]>([]),[badges,setBadges]=useState<Badge[]>([])
  const [me,setMe]=useState(''),[following,setFollowing]=useState(false),[followers,setFollowers]=useState(0),[followingCount,setFollowingCount]=useState(0)
  const [error,setError]=useState(''),[reportMessage,setReportMessage]=useState(''),[followBusy,setFollowBusy]=useState(false)

  const load=useCallback(async()=>{
    if(!supabase||!params.id)return
    try{
      const user=await ensurePaperUser(supabase);setMe(user.id)
      const [{data:p,error:pe},{data:v,error:ve},{data:s},{data:c},{data:a},{data:b},{count:followersCount},{count:followingTotal}]=await Promise.all([
        supabase.from('paper_public_profiles').select('username,display_name,bio,x_handle,avatar_url,avatar_emoji,accent').eq('id',params.id).single(),
        supabase.from('paper_profile_visibility').select('public_profile,activity_public,share_pnl').eq('user_id',params.id).maybeSingle(),
        supabase.from('paper_leaderboard_v2').select('evaluation_pnl_usd,evaluation_roi_pct,win_rate_pct,trades_count,funded_pnl_usd,funded_capital_usd,evaluation_status').eq('period_key','all_time').eq('user_id',params.id).maybeSingle(),
        supabase.from('paper_trade_cards').select('trade_id,token_symbol,action,notional_usd,fee_usd,execution_quality,verified,created_at').eq('user_id',params.id).order('created_at',{ascending:false}).limit(12),
        supabase.from('paper_activity_events').select('id,event_type,token_symbol,payload,created_at').eq('user_id',params.id).order('created_at',{ascending:false}).limit(12),
        supabase.from('paper_reward_badges').select('badge_key,earned_at').eq('user_id',params.id).order('earned_at',{ascending:true}).limit(12),
        supabase.from('paper_social_follows').select('follower_id',{count:'exact',head:true}).eq('following_id',params.id),
        supabase.from('paper_social_follows').select('following_id',{count:'exact',head:true}).eq('follower_id',params.id),
      ])
      if(pe)throw pe
      if(ve&&user.id!==params.id)throw ve
      if(v?.public_profile===false&&user.id!==params.id)throw new Error('This trader keeps their profile private.')
      setProfile(p as Profile);setStats((s as Stats|null)||null);setCards((c||[]) as Card[]);setActivity((a||[]) as Activity[]);setBadges((b||[]) as Badge[])
      setFollowers(followersCount||0);setFollowingCount(followingTotal||0)
      if(user.id!==params.id){
        const {data:row}=await supabase.from('paper_social_follows').select('follower_id').eq('follower_id',user.id).eq('following_id',params.id).maybeSingle()
        setFollowing(Boolean(row))
      }
      setError('')
    }catch(e){setError(e instanceof Error?e.message:'Trader not found')}
  },[supabase,params.id])

  useEffect(()=>{void load()},[load])

  async function toggleFollow(){
    if(!supabase||!me||me===params.id)return
    setFollowBusy(true)
    try{
      if(following){
        const {error}=await supabase.from('paper_social_follows').delete().eq('follower_id',me).eq('following_id',params.id);if(error)throw error
      }else{
        const {error}=await supabase.from('paper_social_follows').insert({follower_id:me,following_id:params.id});if(error)throw error
      }
      setFollowing(v=>!v);setFollowers(v=>Math.max(0,v+(following?-1:1)))
    }catch(e){setReportMessage(e instanceof Error?e.message:'Could not update follow')}finally{setFollowBusy(false)}
  }

  async function reportProfile(){
    if(!supabase||!params.id)return
    const reason=window.prompt('What should we review on this profile?')?.trim()
    if(!reason)return
    if(reason.length<3){setReportMessage('Please give a little more detail.');return}
    try{
      const user=await ensurePaperUser(supabase)
      if(user.id===params.id){setReportMessage('You cannot report your own profile.');return}
      const {error}=await supabase.from('moderation_reports').insert({reported_user_id:params.id,reporter_user_id:user.id,reason})
      if(error)throw error
      setReportMessage('Report submitted for review.')
    }catch(e){setReportMessage(e instanceof Error?e.message:'Could not submit report')}
  }

  const pnl=Number(stats?.evaluation_pnl_usd||0),funded=Number(stats?.funded_pnl_usd||0)
  const evalPnl=(pnl>=0?'+':'')+'$'+Math.abs(pnl).toFixed(2)+' PAPER'
  const fundedPnl=Number(stats?.funded_capital_usd||0)>0?(funded>=0?'+':'')+'$'+Math.abs(funded).toFixed(2):'—'

  return <div className="ax-app"><AppHeader active="leaderboard"/><main className="terminal-page"><div className="terminal-page-inner">
    {error?<div className="error-card">{error}</div>:!profile?<div className="empty-card">Loading trader…</div>:<>
      <div className="public-profile"><div className={'public-avatar accent-'+(profile.accent||'violet')}>{profile.avatar_url?<img src={profile.avatar_url} alt="Profile"/>:profile.avatar_emoji||'🪙'}</div><div><div className="terminal-eyebrow">PAPER TRADER</div><h2>{profile.display_name||'Paper Trader'}</h2><p>@{profile.username||'paper_trader'}{profile.x_handle?' · '+profile.x_handle:''}</p>{profile.bio&&<p style={{marginTop:9,maxWidth:470,lineHeight:1.5}}>{profile.bio}</p>}<div className="p23-social-stats"><span><b>{followers}</b> followers</span><span><b>{followingCount}</b> following</span></div>{badges.length>0&&<div className="trader-badges">{badges.slice(0,6).map(x=><span key={x.badge_key} title={'Unlocked '+new Date(x.earned_at).toLocaleDateString()}>{x.badge_key.replaceAll('_',' ')}</span>)}</div>}</div><div className="spacer"/>{me&&me!==params.id&&<button className={'p23-follow-button '+(following?'following':'')} disabled={followBusy} onClick={()=>void toggleFollow()}>{following?'FOLLOWING':'FOLLOW'}</button>}<button className="report-button" onClick={()=>void reportProfile()}>REPORT</button></div>
      {reportMessage&&<div className="profile-message">{reportMessage}</div>}
      <div className="stat-grid"><div className="stat-card"><small>EVALUATION P&amp;L</small><b className={pnl>=0?'gain':'loss'}>{evalPnl}</b></div><div className="stat-card"><small>EVALUATION ROI</small><b>{Number(stats?.evaluation_roi_pct||0).toFixed(2)}%</b></div><div className="stat-card"><small>WIN RATE</small><b>{Number(stats?.win_rate_pct||0).toFixed(1)}%</b></div><div className="stat-card"><small>FUNDED P&amp;L</small><b className={funded>=0?'gain':'loss'}>{fundedPnl}</b></div></div>
      <div className="p23-activity-grid">
        <section className="p23-social-card"><div className="terminal-eyebrow">VERIFIED TRADE CARDS</div><div className="p23-social-list">{!cards.length?<div className="empty-card">No public trade cards.</div>:cards.map(x=><div className="p23-social-row" key={x.trade_id}><div><b>{x.action.toUpperCase()} {'$'+(x.token_symbol||'MEME')}</b><span> · {'$'+Number(x.notional_usd||0).toFixed(2)+' PAPER · fee $'+Number(x.fee_usd||0).toFixed(2)}</span></div><span>{x.verified?'VERIFIED':'—'} · {new Date(x.created_at).toLocaleDateString()}</span></div>)}</div></section>
        <section className="p23-social-card"><div className="terminal-eyebrow">ACTIVITY</div><div className="p23-social-list">{!activity.length?<div className="empty-card">No public activity.</div>:activity.map(x=><div className="p23-social-row" key={x.id}><div><b>{x.event_type.replaceAll('_',' ').toUpperCase()}</b>{x.token_symbol&&<span> · {'$'+x.token_symbol}</span>}</div><span>{new Date(x.created_at).toLocaleString()}</span></div>)}</div></section>
      </div>
      <div className="leader-rule-note">Public stats and trade cards are PAPER records only. Followers do not enable copy trading, calls, comments, or real-money execution.</div>
    </>}
  </div></main><BottomDock active="leaderboard"/></div>
}
