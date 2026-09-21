'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Award, CheckCircle2, Gift, LockKeyhole, Share2, ShieldCheck, Sparkles, Trophy } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

type Total={user_id:string;points:number;qualifying_trades:number;last_earned_at:string|null;username?:string|null;display_name?:string|null;avatar_url?:string|null;avatar_emoji?:string|null}
type Event={id:string;event_type:string;points:number;created_at:string}
type Badge={user_id:string;badge_key:string;earned_at:string}
const tiers=[{name:'Scout',min:0},{name:'Grinder',min:100},{name:'Degen',min:500},{name:'Alpha',min:1500},{name:'Legend',min:5000}]
const badgeDefs=[
  {key:'first_fill',name:'First Fill',detail:'Complete your first server-recorded PAPER fill'},
  {key:'grinder_100',name:'Grinder',detail:'Earn 100 PAPER Points'},
  {key:'degen_500',name:'Degen',detail:'Earn 500 PAPER Points'},
  {key:'alpha_1500',name:'Alpha',detail:'Earn 1,500 PAPER Points'},
  {key:'legend_5000',name:'Legend',detail:'Earn 5,000 PAPER Points'},
  {key:'century_fills',name:'Century',detail:'Complete 100 qualifying PAPER fills'},
]
function tierFor(points:number){let current=tiers[0];for(const tier of tiers)if(points>=tier.min)current=tier;return current}
function nextTier(points:number){return tiers.find(t=>t.min>points)||null}
function activityDays(events:Event[]){return new Set(events.map(e=>new Date(e.created_at).toISOString().slice(0,10))).size}

export default function RewardsPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [total,setTotal]=useState<Total|null>(null),[events,setEvents]=useState<Event[]>([]),[leaders,setLeaders]=useState<Total[]>([]),[badges,setBadges]=useState<Badge[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[loadedAt,setLoadedAt]=useState(0)
  useEffect(()=>{if(!supabase)return;let alive=true;async function load(){try{
    const user=await ensurePaperUser(supabase)
    const [{data:t,error:te},{data:e,error:ee},{data:l,error:le},{data:b,error:be}]=await Promise.all([
      supabase.from('paper_reward_totals').select('user_id,points,qualifying_trades,last_earned_at').eq('user_id',user.id).maybeSingle(),
      supabase.from('paper_reward_events').select('id,event_type,points,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100),
      supabase.from('paper_reward_leaderboard').select('user_id,points,qualifying_trades,last_earned_at,username,display_name,avatar_url,avatar_emoji').order('points',{ascending:false}).limit(20),
      supabase.from('paper_reward_badges').select('user_id,badge_key,earned_at').eq('user_id',user.id).order('earned_at',{ascending:true})
    ])
    if(te)throw te;if(ee)throw ee;if(le)throw le;if(be)throw be;if(!alive)return
    setTotal((t as Total|null)||{user_id:user.id,points:0,qualifying_trades:0,last_earned_at:null});setEvents((e||[]) as Event[]);setLeaders((l||[]) as Total[]);setBadges((b||[]) as Badge[]);setLoadedAt(Date.now());setError('')
  }catch(err){if(alive)setError(err instanceof Error?err.message:'Rewards unavailable')}finally{if(alive)setLoading(false)}}
  const start=window.setTimeout(()=>void load(),0),id=window.setInterval(()=>{if(!document.hidden)void load()},10000);return()=>{alive=false;clearTimeout(start);clearInterval(id)}
  },[supabase])

  const points=Number(total?.points||0),fills=Number(total?.qualifying_trades||0),tier=tierFor(points),next=nextTier(points),progress=next?Math.max(0,Math.min(100,(points-tier.min)/(next.min-tier.min)*100)):100
  const badgeSet=useMemo(()=>new Set(badges.map(x=>x.badge_key)),[badges]),days=activityDays(events)
  const last7=events.filter(e=>loadedAt>0&&loadedAt-new Date(e.created_at).getTime()<=7*86400000),weekPoints=last7.reduce((s,e)=>s+Number(e.points||0),0)
  function share(){const text='I have '+points.toLocaleString()+' PAPER Points, '+fills.toLocaleString()+' qualifying fills, and '+badges.length+' badges on PAPER. Real market data. PAPER trading only.';window.open('https://x.com/intent/tweet?text='+encodeURIComponent(text),'_blank','noopener,noreferrer')}

  return <div className="ax-app"><AppHeader active="rewards"/><main className="terminal-page rewards-page"><div className="terminal-page-inner">
    <div className="final-page-hero"><div><div className="terminal-eyebrow">PAPER REWARDS · SERVER-RECORDED STATUS</div><h1>Levels, badges, and points.</h1><p className="terminal-lead">Every qualifying PAPER fill earns server-recorded points. Milestone badges are persisted by the database. Points and badges have no cash or crypto value.</p></div><button className="final-share-button" onClick={share}><Share2 size={14}/> Share progress</button></div>{error&&<div className="error-card">{error}</div>}

    <section className="reward-hero-grid"><div className="reward-score-card"><small>PAPER POINTS</small><b>{loading?'…':points.toLocaleString()}</b><span><Sparkles size={13}/>{tier.name} level</span><div className="reward-progress"><i style={{width:progress+'%'}}/></div><p>{next?Math.max(0,next.min-points).toLocaleString()+' points to '+next.name:'Top level unlocked'}</p></div><div className="reward-stat"><small>QUALIFYING FILLS</small><b>{fills.toLocaleString()}</b><span>10 points per server-recorded PAPER fill</span></div><div className="reward-stat"><small>7-DAY POINTS</small><b>{weekPoints.toLocaleString()}</b><span>From your actual point-event ledger</span></div><div className="reward-stat"><small>ACTIVE DAYS</small><b>{days}</b><span>Distinct reward-event days in recent history</span></div></section>

    <section className="reward-badges-panel"><div className="panel-title"><b>MILESTONE BADGES</b><span>{badges.length}/{badgeDefs.length} unlocked</span></div><div className="reward-badge-grid">{badgeDefs.map(def=>{const unlocked=badgeSet.has(def.key),earned=badges.find(x=>x.badge_key===def.key);return <div key={def.key} className={'reward-badge '+(unlocked?'unlocked':'locked')}>{unlocked?<Award size={18}/>:<LockKeyhole size={18}/>}<b>{def.name}</b><span>{def.detail}</span><small>{unlocked?(earned?'Unlocked '+new Date(earned.earned_at).toLocaleDateString():'Unlocked'):'Locked'}</small></div>})}</div></section>

    <section className="reward-info-grid"><article className="reward-panel"><div className="panel-title"><b>HOW POINTS WORK</b><Gift size={15}/></div><div className="reward-rules"><div><b>+10</b><span>Each completed USD-mode PAPER buy or sell recorded by the server</span></div><div><b>0</b><span>Page views, refreshes, failed orders, or idempotent replays</span></div><div><b>BADGES</b><span>Unlocked by persisted point/fill milestones, not client claims</span></div></div></article><article className="reward-panel charity"><div className="panel-title"><b>PAPER-ONLY STATUS</b><ShieldCheck size={15}/></div><p>Points, levels, badges, and leaderboard positions are simulated-product status only.</p><strong>No cash, crypto, payout, redemption, or prize value.</strong><span>They cannot be converted to SOL or any other asset.</span></article></section>

    <section className="reward-board"><div className="panel-title"><b>POINTS LEADERBOARD</b><Link href="/leaderboards">Performance leaderboards →</Link></div><div className="reward-board-head"><span>#</span><span>Trader</span><span>Points</span><span>Fills</span></div>{!leaders.length&&!loading&&<div className="portfolio-empty">No reward activity yet.</div>}{leaders.map((row,i)=>{const display=row.display_name||row.username||'Paper Trader';return <Link href={'/trader/'+row.user_id} className="reward-board-row" key={row.user_id}><b>{i+1}</b><span className="leader-trader">{row.avatar_url?<img src={row.avatar_url} alt=""/>:<span className="leader-emoji">{row.avatar_emoji||'◢'}</span>}<span><strong>{display}</strong><small>@{row.username||'paper_trader'}</small></span></span><strong>{Number(row.points||0).toLocaleString()}</strong><span>{Number(row.qualifying_trades||0).toLocaleString()}</span></Link>})}</section>

    <section className="reward-panel"><div className="panel-title"><b>YOUR POINT LEDGER</b><Trophy size={15}/></div>{!events.length?<div className="portfolio-empty">Complete a PAPER trade to earn your first points.</div>:<div className="reward-event-list">{events.map(e=><div key={e.id}><span>{new Date(e.created_at).toLocaleString()}</span><b>{e.event_type.replaceAll('_',' ')}</b><strong>+{e.points}</strong></div>)}</div>}</section>
    <div className="leader-rule-note"><CheckCircle2 size={12}/> Points, fills, badge unlocks and leaderboard rows are server/database records. Refreshing this page cannot create rewards.</div>
  </div></main><BottomDock active="rewards"/></div>
}
