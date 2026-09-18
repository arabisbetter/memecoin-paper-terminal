'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, ExternalLink, Plus, Save, Star, Trash2 } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

type Chain='solana'|'base'|'ethereum'
type Item={
  id:string
  user_id:string
  chain_id:Chain
  address:string
  symbol:string|null
  name:string|null
  image_url:string|null
  alert_above_usd:number|null
  alert_below_usd:number|null
  push_enabled:boolean
  alert_above_triggered:boolean
  alert_below_triggered:boolean
  alert_last_price_usd:number|null
  alert_last_checked_at:string|null
  created_at:string
}
type AlertEvent={
  id:string
  watchlist_id:string
  chain_id:Chain
  token_address:string
  token_symbol:string|null
  direction:'above'|'below'
  trigger_price_usd:number
  observed_price_usd:number
  status:'unread'|'read'
  created_at:string
}

const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(n<1?8:2)
const short=(s:string)=>s.slice(0,6)+'…'+s.slice(-5)
const sol=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const evm=/^0x[a-fA-F0-9]{40}$/

export default function WatchlistPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [items,setItems]=useState<Item[]>([])
  const [live,setLive]=useState<Record<string,MarketToken>>({})
  const [drafts,setDrafts]=useState<Record<string,{above:string;below:string}>>({})
  const [alerts,setAlerts]=useState<AlertEvent[]>([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const [addChain,setAddChain]=useState<Chain>('solana')
  const [addAddress,setAddAddress]=useState('')
  const [adding,setAdding]=useState(false)
  const [notificationPermission,setNotificationPermission]=useState<NotificationPermission>('default')
  const notified=useMemo(()=>new Set<string>(),[])

  const load=useCallback(async()=>{
    if(!supabase)return
    try{
      const user=await ensurePaperUser(supabase)
      const result=await supabase.from('token_watchlist')
        .select('id,user_id,chain_id,address,symbol,name,image_url,alert_above_usd,alert_below_usd,push_enabled,alert_above_triggered,alert_below_triggered,alert_last_price_usd,alert_last_checked_at,created_at')
        .eq('user_id',user.id)
        .order('created_at',{ascending:false})
      if(result.error)throw result.error
      const rows=(result.data||[]) as Item[]
      setItems(rows)
      setDrafts(cur=>{
        const next={...cur}
        for(const row of rows){
          if(!next[row.id]){
            next[row.id]={
              above:row.alert_above_usd==null?'':String(row.alert_above_usd),
              below:row.alert_below_usd==null?'':String(row.alert_below_usd)
            }
          }
        }
        return next
      })

      const lookups=await Promise.all(rows.slice(0,40).map(async row=>{
        const url=row.chain_id==='solana'
          ?'/api/market/token/'+encodeURIComponent(row.address)
          :'/api/market/chain/'+row.chain_id+'/token/'+encodeURIComponent(row.address)
        try{
          const response=await fetch(url,{cache:'no-store'})
          const body=await response.json()
          if(!response.ok||!body.token)return null
          return [row.chain_id+':'+row.address.toLowerCase(),body.token as MarketToken] as const
        }catch{return null}
      }))
      const map:Record<string,MarketToken>={}
      for(const item of lookups)if(item)map[item[0]]=item[1]
      setLive(map)
      setError('')
    }catch(e){
      setError(e instanceof Error?e.message:'Watchlist unavailable')
    }finally{
      setLoading(false)
    }
  },[supabase])

  const loadAlerts=useCallback(async()=>{
    if(!supabase)return
    try{
      const user=await ensurePaperUser(supabase)
      const result=await supabase.from('paper_alert_events')
        .select('id,watchlist_id,chain_id,token_address,token_symbol,direction,trigger_price_usd,observed_price_usd,status,created_at')
        .eq('user_id',user.id)
        .order('created_at',{ascending:false})
        .limit(40)
      if(result.error)throw result.error
      setAlerts((result.data||[]) as AlertEvent[])
    }catch{}
  },[supabase])

  useEffect(()=>{
    void load()
    const id=window.setInterval(()=>{if(!document.hidden)void load()},12000)
    return()=>clearInterval(id)
  },[load])

  useEffect(()=>{
    if(typeof Notification!=='undefined')setNotificationPermission(Notification.permission)
    void loadAlerts()
    const id=window.setInterval(()=>void loadAlerts(),15000)
    return()=>clearInterval(id)
  },[loadAlerts])

  useEffect(()=>{
    if(notificationPermission!=='granted'||typeof Notification==='undefined')return
    for(const event of alerts){
      if(event.status!=='unread'||notified.has(event.id))continue
      const watch=items.find(row=>row.id===event.watchlist_id)
      if(!watch?.push_enabled)continue
      notified.add(event.id)
      const body='$'+(event.token_symbol||'TOKEN')+' moved '+event.direction+' '+money(Number(event.trigger_price_usd))+' · now '+money(Number(event.observed_price_usd))
      new Notification('PAPER price alert',{body,tag:'paper-alert-'+event.id})
    }
  },[alerts,items,notificationPermission,notified])

  async function add(event:FormEvent){
    event.preventDefault()
    if(!supabase)return
    const address=addAddress.trim()
    if(addChain==='solana'?!sol.test(address):!evm.test(address)){
      setError(addChain==='solana'?'Enter a valid Solana mint.':'Enter a valid 0x token contract.')
      return
    }
    setAdding(true)
    setError('')
    try{
      const user=await ensurePaperUser(supabase)
      const url=addChain==='solana'
        ?'/api/market/token/'+encodeURIComponent(address)
        :'/api/market/chain/'+addChain+'/token/'+encodeURIComponent(address)
      const response=await fetch(url,{cache:'no-store'})
      const body=await response.json()
      if(!response.ok||!body.token)throw new Error(body.error||'No active market found for that token.')
      const token=body.token as MarketToken
      const result=await supabase.from('token_watchlist').upsert({
        user_id:user.id,
        chain_id:addChain,
        address:token.mint,
        symbol:token.symbol,
        name:token.name,
        image_url:token.image||null
      },{onConflict:'user_id,chain_id,address'})
      if(result.error)throw result.error
      setAddAddress('')
      await load()
    }catch(e){
      setError(e instanceof Error?e.message:'Could not add token')
    }finally{
      setAdding(false)
    }
  }

  async function save(row:Item){
    if(!supabase)return
    const draft=drafts[row.id]||{above:'',below:''}
    const above=draft.above.trim()===''?null:Number(draft.above)
    const below=draft.below.trim()===''?null:Number(draft.below)
    if((above!==null&&!Number.isFinite(above))||(below!==null&&!Number.isFinite(below))){
      setError('Alert prices must be valid numbers.')
      return
    }
    const result=await supabase.from('token_watchlist').update({
      alert_above_usd:above,
      alert_below_usd:below,
      alert_above_triggered:false,
      alert_below_triggered:false,
      updated_at:new Date().toISOString()
    }).eq('id',row.id)
    if(result.error)setError(result.error.message)
    else void load()
  }

  async function remove(row:Item){
    if(!supabase)return
    const result=await supabase.from('token_watchlist').delete().eq('id',row.id)
    if(result.error)setError(result.error.message)
    else void load()
  }

  async function toggleBrowserAlert(row:Item){
    if(!supabase)return
    try{
      let permission=notificationPermission
      if(typeof Notification!=='undefined'&&permission!=='granted'){
        permission=await Notification.requestPermission()
        setNotificationPermission(permission)
      }
      const enabled=permission==='granted'?!row.push_enabled:false
      const result=await supabase.from('token_watchlist').update({
        push_enabled:enabled,
        updated_at:new Date().toISOString()
      }).eq('id',row.id)
      if(result.error)throw result.error
      await load()
    }catch(e){
      setError(e instanceof Error?e.message:'Could not update browser alerts.')
    }
  }

  async function markAlertRead(id:string){
    if(!supabase)return
    const result=await supabase.from('paper_alert_events').update({
      status:'read',
      read_at:new Date().toISOString()
    }).eq('id',id)
    if(result.error)setError(result.error.message)
    else void loadAlerts()
  }

  async function markAllRead(){
    if(!supabase)return
    const unread=alerts.filter(a=>a.status==='unread').map(a=>a.id)
    if(!unread.length)return
    const result=await supabase.from('paper_alert_events').update({
      status:'read',
      read_at:new Date().toISOString()
    }).in('id',unread)
    if(result.error)setError(result.error.message)
    else void loadAlerts()
  }

  return <div className="ax-app">
    <AppHeader active="watchlist"/>
    <main className="terminal-page watchlist-page">
      <div className="terminal-page-inner">
        <div className="final-page-hero">
          <div>
            <div className="terminal-eyebrow">TOKEN WATCHLIST · SERVER-EVALUATED ALERTS</div>
            <h1>Watchlist</h1>
            <p className="terminal-lead">Track Solana, Base and Ethereum tokens. PAPER evaluates armed thresholds on the server even when this page is closed; browser notifications can fire while your browser allows this site to run in the background.</p>
          </div>
          <Link className="watchlist-link" href="/chains"><Star size={14}/> Find Base/ETH tokens</Link>
        </div>

        <form className="watchlist-add" onSubmit={add}>
          <select value={addChain} onChange={e=>setAddChain(e.target.value as Chain)}>
            <option value="solana">Solana</option>
            <option value="base">Base</option>
            <option value="ethereum">Ethereum</option>
          </select>
          <input value={addAddress} onChange={e=>setAddAddress(e.target.value)} placeholder={addChain==='solana'?'Paste Solana token mint…':'Paste 0x token contract…'}/>
          <button disabled={adding}><Plus size={13}/>{adding?'Checking…':'Add token'}</button>
        </form>

        {error&&<div className="error-card">{error}</div>}

        <section className="watch-alert-center">
          <div className="watch-alert-center-head">
            <span><Bell size={14}/> ALERT EVENTS <b>{alerts.filter(a=>a.status==='unread').length}</b></span>
            <button onClick={()=>void markAllRead()}>Mark all read</button>
          </div>
          {!alerts.length
            ?<div className="watch-alert-empty">No triggered server alerts yet.</div>
            :<div className="watch-alert-event-list">
              {alerts.slice(0,8).map(event=><button className={'watch-alert-event '+(event.status==='unread'?'unread':'')} key={event.id} onClick={()=>void markAlertRead(event.id)}>
                <span><b>{'$'+(event.token_symbol||'TOKEN')}</b><small>{event.direction.toUpperCase()} {money(Number(event.trigger_price_usd))}</small></span>
                <strong>{money(Number(event.observed_price_usd))}</strong>
                <time>{new Date(event.created_at).toLocaleString()}</time>
              </button>)}
            </div>}
        </section>

        <section className="watchlist-table">
          <div className="watchlist-head"><span>Token</span><span>Chain</span><span>Live Price</span><span>5m</span><span>Alert above</span><span>Alert below</span><span>Status</span><span>Actions</span></div>
          {loading&&!items.length&&<div className="portfolio-empty">Loading watchlist…</div>}
          {!loading&&!items.length&&<div className="portfolio-empty">Your watchlist is empty. Add a token mint/contract above or use the Chains market browser.</div>}
          {items.map(row=>{
            const key=row.chain_id+':'+row.address.toLowerCase()
            const token=live[key]
            const price=Number(token?.priceUsd||row.alert_last_price_usd||0)
            const above=row.alert_above_usd==null?null:Number(row.alert_above_usd)
            const below=row.alert_below_usd==null?null:Number(row.alert_below_usd)
            const trigger=Boolean(row.alert_above_triggered||row.alert_below_triggered||(price>0&&((above!==null&&price>=above)||(below!==null&&price<=below))))
            const draft=drafts[row.id]||{above:'',below:''}
            const href=row.chain_id==='solana'?'/spot?mint='+row.address:token?.pairUrl||token?.buyUrl||'#'
            return <div className={'watchlist-row '+(trigger?'triggered':'')} key={row.id}>
              <Link href={href} target={row.chain_id==='solana'?undefined:'_blank'} className="watch-token">
                <span className="pair-avatar-terminal">{token?.image||row.image_url?<img src={token?.image||row.image_url||''} alt=""/>:<b>{(token?.symbol||row.symbol||'??').slice(0,2)}</b>}</span>
                <span><b>{'$'+(token?.symbol||row.symbol||'TOKEN')}</b><small>{token?.name||row.name||short(row.address)}</small></span>
                {row.chain_id!=='solana'&&<ExternalLink size={11}/>}
              </Link>
              <span className={'chain-pill '+row.chain_id}>{row.chain_id==='ethereum'?'ETH':row.chain_id.toUpperCase()}</span>
              <strong>{price?money(price):'Unavailable'}</strong>
              <strong className={Number(token?.priceChange5m||0)>=0?'gain':'loss'}>{token?(Number(token.priceChange5m||0)>=0?'+':'')+Number(token.priceChange5m||0).toFixed(2)+'%':'—'}</strong>
              <input type="number" step="any" placeholder="—" value={draft.above} onChange={e=>setDrafts(cur=>({...cur,[row.id]:{...draft,above:e.target.value}}))}/>
              <input type="number" step="any" placeholder="—" value={draft.below} onChange={e=>setDrafts(cur=>({...cur,[row.id]:{...draft,below:e.target.value}}))}/>
              <span className={trigger?'watch-alert hot':'watch-alert'}><Bell size={12}/>{trigger?'TRIGGERED':above!==null||below!==null?'ARMED':'NO ALERT'}</span>
              <span className="watch-actions">
                <button className={row.push_enabled?'active':''} onClick={()=>void toggleBrowserAlert(row)} title={row.push_enabled?'Disable browser notification':'Enable browser notification'}><Bell size={13}/></button>
                <button onClick={()=>void save(row)} title="Save alert"><Save size={13}/></button>
                <button onClick={()=>void remove(row)} title="Remove"><Trash2 size={13}/></button>
              </span>
            </div>
          })}
        </section>

        <div className="chain-paper-note"><b>Alert behavior:</b> thresholds are stored in your PAPER account and evaluated by the server monitor. Browser notifications require permission and can appear while the browser keeps PAPER active in the background. Email, SMS, and true closed-browser Web Push still require an external notification provider/VAPID setup.</div>
      </div>
    </main>
    <BottomDock active="watchlist"/>
  </div>
}
