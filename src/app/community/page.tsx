'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Flag, Heart, MessageSquareText, Radio, Send, Users } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

type Profile={username:string|null;display_name:string|null;avatar_url:string|null;avatar_emoji:string|null;accent:string|null}
type Post={id:string;user_id:string;body:string;token_address:string|null;token_symbol:string|null;created_at:string;profiles:Profile|null;paper_social_likes:{user_id:string}[]}
type Card={trade_id:string;user_id:string;token_symbol:string|null;action:string;notional_usd:number|null;realized_pnl_usd:number|null;verified:boolean;created_at:string;profiles:Profile|null}
type Activity={id:number;user_id:string;event_type:string;token_symbol:string|null;created_at:string;profiles:Profile|null}
type FeedItem=
  |{kind:'post';at:string;data:Post}
  |{kind:'trade';at:string;data:Card}
  |{kind:'activity';at:string;data:Activity}

const blocked=/(nigg|fagg|kike|spic|chink|wetback|tranny|retard)/i
const money=(n:number)=>(n>=0?'+':'-')+'$'+Math.abs(n).toFixed(2)
const avatar=(p:Profile|null)=>p?.avatar_url?<img src={p.avatar_url} alt=""/>:<span>{p?.avatar_emoji||'🪙'}</span>

export default function CommunityPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [me,setMe]=useState(''),[mode,setMode]=useState<'global'|'following'>('global'),[body,setBody]=useState(''),[tokenSymbol,setTokenSymbol]=useState(''),[tokenAddress,setTokenAddress]=useState('')
  const [posts,setPosts]=useState<Post[]>([]),[cards,setCards]=useState<Card[]>([]),[activity,setActivity]=useState<Activity[]>([]),[following,setFollowing]=useState<string[]>([])
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')

  const load=useCallback(async()=>{
    if(!supabase)return
    try{
      const user=await ensurePaperUser(supabase);setMe(user.id)
      const {data:follows,error:fe}=await supabase.from('paper_social_follows').select('following_id').eq('follower_id',user.id)
      if(fe)throw fe
      const ids=(follows||[]).map((x:{following_id:string})=>String(x.following_id));setFollowing(ids)
      const postQ=supabase.from('paper_social_posts').select('id,user_id,body,token_address,token_symbol,created_at,profiles(username,display_name,avatar_url,avatar_emoji,accent),paper_social_likes(user_id)').is('deleted_at',null).order('created_at',{ascending:false}).limit(80)
      const cardQ=supabase.from('paper_trade_cards').select('trade_id,user_id,token_symbol,action,notional_usd,realized_pnl_usd,verified,created_at,profiles(username,display_name,avatar_url,avatar_emoji,accent)').order('created_at',{ascending:false}).limit(80)
      const actQ=supabase.from('paper_activity_events').select('id,user_id,event_type,token_symbol,created_at,profiles(username,display_name,avatar_url,avatar_emoji,accent)').order('created_at',{ascending:false}).limit(80)
      const [p,c,a]=await Promise.all([postQ,cardQ,actQ])
      if(p.error)throw p.error;if(c.error)throw c.error;if(a.error)throw a.error
      setPosts((p.data||[]) as unknown as Post[]);setCards((c.data||[]) as unknown as Card[]);setActivity((a.data||[]) as unknown as Activity[]);setError('')
    }catch(e){setError(e instanceof Error?e.message:'Community feed unavailable')}
    finally{setLoading(false)}
  },[supabase])

  useEffect(()=>{const start=window.setTimeout(()=>void load(),0);const id=window.setInterval(()=>{if(!document.hidden)void load()},12000);return()=>{clearTimeout(start);clearInterval(id)}},[load])

  const feed=useMemo(()=>{
    const allowed=(uid:string)=>mode==='global'||uid===me||following.includes(uid)
    const items:FeedItem[]=[
      ...posts.filter(x=>allowed(x.user_id)).map(data=>({kind:'post' as const,at:data.created_at,data})),
      ...cards.filter(x=>allowed(x.user_id)).map(data=>({kind:'trade' as const,at:data.created_at,data})),
      ...activity.filter(x=>allowed(x.user_id)&&x.event_type!=='paper_trade').map(data=>({kind:'activity' as const,at:data.created_at,data})),
    ]
    return items.sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime()).slice(0,120)
  },[posts,cards,activity,mode,following,me])

  async function createPost(e:FormEvent){
    e.preventDefault();if(!supabase||!me)return
    const clean=body.trim(),sym=tokenSymbol.trim().replace(/^\$/,'').toUpperCase(),mint=tokenAddress.trim()
    if(!clean||clean.length>280){setNotice('Post must be 1–280 characters.');return}
    if(blocked.test(clean)){setNotice('Choose different wording.');return}
    setBusy(true);setNotice('')
    try{
      const {error}=await supabase.from('paper_social_posts').insert({user_id:me,body:clean,token_symbol:sym||null,token_address:mint||null})
      if(error)throw error
      setBody('');setTokenSymbol('');setTokenAddress('');setNotice('Posted.');await load()
    }catch(e){setNotice(e instanceof Error?e.message:'Could not post')}finally{setBusy(false)}
  }

  async function toggleLike(post:Post){
    if(!supabase||!me)return
    const liked=post.paper_social_likes.some(x=>x.user_id===me)
    const q=liked?supabase.from('paper_social_likes').delete().eq('post_id',post.id).eq('user_id',me):supabase.from('paper_social_likes').insert({post_id:post.id,user_id:me})
    const {error}=await q
    if(error)setNotice(error.message);else await load()
  }

  async function reportPost(post:Post){
    if(!supabase||!me||post.user_id===me)return
    const reason=window.prompt('What should PAPER moderation review?')?.trim()
    if(!reason||reason.length<3)return
    const {error}=await supabase.from('moderation_reports').insert({reported_user_id:post.user_id,reporter_user_id:me,reported_post_id:post.id,report_kind:'post',reason})
    setNotice(error?error.message:'Report submitted for review.')
  }

  function traderName(p:Profile|null){return p?.display_name||p?.username||'Paper Trader'}

  return <div className="ax-app"><AppHeader active="community"/><main className="terminal-page community-page"><div className="terminal-page-inner">
    <div className="final-page-hero"><div><div className="terminal-eyebrow">PAPER COMMUNITY · PAPER ACTIVITY ONLY</div><h1>Trader feed</h1><p className="terminal-lead">Follow PAPER traders, share short market notes, and see verified PAPER fills and evaluation milestones. No copy trading, paid calls, or real-money execution.</p></div><Users size={28}/></div>

    <section className="community-layout">
      <aside className="community-compose">
        <div className="panel-title"><b>POST TO PAPER</b><MessageSquareText size={14}/></div>
        <form onSubmit={createPost}>
          <textarea maxLength={280} value={body} onChange={e=>setBody(e.target.value)} placeholder="What are you watching? Keep it about the market, your PAPER process, or your PAPER trades."/>
          <div className="community-token-fields"><input value={tokenSymbol} onChange={e=>setTokenSymbol(e.target.value)} maxLength={16} placeholder="$TOKEN optional"/><input value={tokenAddress} onChange={e=>setTokenAddress(e.target.value)} maxLength={64} placeholder="CA optional"/></div>
          <div className="community-compose-foot"><span>{body.length}/280</span><button disabled={busy||!body.trim()}><Send size={12}/>{busy?'POSTING…':'POST'}</button></div>
        </form>
        {notice&&<div className="profile-message">{notice}</div>}
        <div className="community-safety"><Flag size={12}/><span>Profiles and posts can be reported. Slurs and abusive profile/post text are blocked at the client and reports go to the existing moderation queue.</span></div>
      </aside>

      <section className="community-feed-card">
        <div className="community-tabs"><button className={mode==='global'?'active':''} onClick={()=>setMode('global')}><Radio size={12}/> GLOBAL</button><button className={mode==='following'?'active':''} onClick={()=>setMode('following')}><Users size={12}/> FOLLOWING</button><span>{feed.length} items</span></div>
        {error&&<div className="error-card">{error}</div>}
        {loading&&!feed.length?<div className="empty-card">Loading PAPER community…</div>:!feed.length?<div className="empty-card">{mode==='following'?'Follow traders from the leaderboard to build this feed.':'No public activity yet.'}</div>:<div className="community-feed">
          {feed.map(item=>{
            if(item.kind==='post'){
              const p=item.data,liked=p.paper_social_likes.some(x=>x.user_id===me)
              return <article className="community-item post" key={'p'+p.id}><Link href={'/trader/'+p.user_id} className="community-avatar">{avatar(p.profiles)}</Link><div className="community-item-body"><div className="community-item-head"><Link href={'/trader/'+p.user_id}><b>{traderName(p.profiles)}</b><span>@{p.profiles?.username||'paper_trader'}</span></Link><time>{new Date(p.created_at).toLocaleString()}</time></div><p>{p.body}</p>{p.token_symbol&&<Link className="community-token" href={p.token_address?'/spot?mint='+encodeURIComponent(p.token_address):'/pulse'}>{'$'+p.token_symbol}</Link>}<div className="community-actions"><button className={liked?'liked':''} onClick={()=>void toggleLike(p)}><Heart size={12} fill={liked?'currentColor':'none'}/>{p.paper_social_likes.length}</button>{p.user_id!==me&&<button onClick={()=>void reportPost(p)}><Flag size={11}/> REPORT</button>}</div></div></article>
            }
            if(item.kind==='trade'){
              const t=item.data,pnl=Number(t.realized_pnl_usd||0)
              return <article className="community-item trade" key={'t'+t.trade_id}><Link href={'/trader/'+t.user_id} className="community-avatar">{avatar(t.profiles)}</Link><div className="community-item-body"><div className="community-item-head"><Link href={'/trader/'+t.user_id}><b>{traderName(t.profiles)}</b><span>VERIFIED PAPER FILL</span></Link><time>{new Date(t.created_at).toLocaleString()}</time></div><div className="community-trade-card"><strong className={t.action==='buy'?'gain':'loss'}>{t.action.toUpperCase()} {'$'+(t.token_symbol||'TOKEN')}</strong><span>{'$'+Number(t.notional_usd||0).toFixed(2)} PAPER</span>{t.action==='sell'&&<b className={pnl>=0?'gain':'loss'}>{money(pnl)}</b>}<em>{t.verified?'SERVER VERIFIED':'UNVERIFIED'}</em></div></div></article>
            }
            const a=item.data
            return <article className="community-item activity" key={'a'+a.id}><Link href={'/trader/'+a.user_id} className="community-avatar">{avatar(a.profiles)}</Link><div className="community-item-body"><div className="community-item-head"><Link href={'/trader/'+a.user_id}><b>{traderName(a.profiles)}</b><span>PAPER ACTIVITY</span></Link><time>{new Date(a.created_at).toLocaleString()}</time></div><p>{a.event_type.replaceAll('_',' ').toUpperCase()}{a.token_symbol?' · $'+a.token_symbol:''}</p></div></article>
          })}
        </div>}
      </section>
    </section>
  </div></main><BottomDock active="leaderboard"/></div>
}
