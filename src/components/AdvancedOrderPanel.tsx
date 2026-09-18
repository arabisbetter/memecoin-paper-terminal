'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock3, Target, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { MarketToken } from '@/lib/types'

type Side='buy'|'sell'
type OrderMode='limit'|'stop_loss'|'take_profit'
type ConditionalOrder={
  id:string
  token_address:string
  token_symbol:string|null
  side:Side
  order_type:OrderMode
  trigger_price_usd:number
  amount_sol:number|null
  sell_pct:number|null
  status:string
  current_price_usd:number|null
  expires_at:string|null
  created_at:string
}
const money=(n:number)=>!Number.isFinite(n)?'—':n>=1?('$'+n.toFixed(4)):('$'+n.toPrecision(5))

export default function AdvancedOrderPanel({
  token,side,amountSol,sellPct,hasPosition,onChanged
}:{
  token:MarketToken|null
  side:Side
  amountSol:number
  sellPct:number
  hasPosition:boolean
  onChanged?:()=>void
}){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [mode,setMode]=useState<OrderMode>('limit')
  const [trigger,setTrigger]=useState('')
  const [expiresHours,setExpiresHours]=useState(24)
  const [orders,setOrders]=useState<ConditionalOrder[]>([])
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')

  useEffect(()=>{
    try{
      const raw=localStorage.getItem('paper.advancedOrderPrefs.v1')
      if(raw){
        const saved=JSON.parse(raw)
        if(['limit','stop_loss','take_profit'].includes(saved.mode))setMode(saved.mode)
        if([6,24,72,168].includes(Number(saved.expiresHours)))setExpiresHours(Number(saved.expiresHours))
      }
    }catch{}
  },[])
  useEffect(()=>{
    localStorage.setItem('paper.advancedOrderPrefs.v1',JSON.stringify({mode,expiresHours}))
  },[mode,expiresHours])
  useEffect(()=>{
    if(side==='buy'&&mode!=='limit')setMode('limit')
  },[side,mode])
  useEffect(()=>{
    const price=Number(token?.priceUsd||0)
    if(price>0)setTrigger(String(price))
  },[token?.mint])

  async function load(){
    if(!supabase)return
    try{
      const {data,error}=await supabase.functions.invoke('paper-advanced-orders',{body:{action:'list'}})
      if(error)throw error
      if(data?.error)throw new Error(data.error)
      setOrders((data?.orders||[]) as ConditionalOrder[])
    }catch{}
  }
  useEffect(()=>{
    void load()
    const id=window.setInterval(()=>{if(!document.hidden)void load()},5000)
    const handler=()=>void load()
    window.addEventListener('paper:account-changed',handler)
    return()=>{clearInterval(id);window.removeEventListener('paper:account-changed',handler)}
  },[supabase])

  async function create(){
    if(!supabase||!token)return
    const triggerPriceUsd=Number(trigger)
    if(!Number.isFinite(triggerPriceUsd)||triggerPriceUsd<=0){setMessage('Enter a valid trigger price.');return}
    if(side==='sell'&&!hasPosition){setMessage('No open PAPER position for this token.');return}
    setBusy(true);setMessage('')
    try{
      const body={
        action:'create',
        mint:token.mint,
        symbol:token.symbol,
        side,
        orderType:mode,
        triggerPriceUsd,
        amountSol:side==='buy'?amountSol:undefined,
        sellPct:side==='sell'?sellPct:undefined,
        expiresInHours:expiresHours,
        currentPriceUsd:token.priceUsd,
        idempotencyKey:crypto.randomUUID(),
      }
      const {data,error}=await supabase.functions.invoke('paper-advanced-orders',{body})
      if(error)throw error
      if(data?.error)throw new Error(data.error)
      setMessage((mode==='limit'?'LIMIT':mode==='stop_loss'?'STOP LOSS':'TAKE PROFIT')+' ARMED · PAPER')
      await load()
      onChanged?.()
    }catch(e){
      setMessage(e instanceof Error?e.message:'Could not place conditional PAPER order.')
    }finally{setBusy(false)}
  }

  async function cancel(id:string){
    if(!supabase)return
    setBusy(true)
    try{
      const {data,error}=await supabase.functions.invoke('paper-advanced-orders',{body:{action:'cancel',id}})
      if(error)throw error
      if(data?.error)throw new Error(data.error)
      await load()
      setMessage('Conditional order cancelled.')
    }catch(e){setMessage(e instanceof Error?e.message:'Could not cancel order.')}
    finally{setBusy(false)}
  }

  const tokenOrders=orders.filter(o=>o.token_address===token?.mint&&['pending','processing'].includes(o.status))
  const currentPrice=Number(token?.priceUsd||0)
  const triggerPresets=mode==='stop_loss'?[-5,-10,-20]:mode==='take_profit'?[5,10,25,50]:side==='buy'?[-5,-10,-20]:[5,10,20]
  function useTriggerPreset(percent:number){
    if(currentPrice<=0)return
    setTrigger(String(currentPrice*(1+percent/100)))
  }
  const helper=mode==='limit'
    ?(side==='buy'?'Executes when live price is at or below your limit.':'Executes when live price is at or above your limit.')
    :mode==='stop_loss'
      ?'Sells when live price falls to or below the stop.'
      :'Sells when live price reaches or exceeds the target.'

  return <section className="advanced-order-panel">
    <div className="advanced-order-tabs">
      <button className={mode==='limit'?'active':''} onClick={()=>setMode('limit')}>Limit</button>
      <button className={mode==='stop_loss'?'active':''} disabled={side==='buy'} onClick={()=>setMode('stop_loss')}>Stop</button>
      <button className={mode==='take_profit'?'active':''} disabled={side==='buy'} onClick={()=>setMode('take_profit')}>Take Profit</button>
    </div>
    <div className="advanced-order-grid">
      <label><span>TRIGGER PRICE</span><div><b>$</b><input type="number" step="any" min="0" value={trigger} onChange={e=>setTrigger(e.target.value)}/></div></label>
      <label><span>EXPIRES</span><select value={expiresHours} onChange={e=>setExpiresHours(Number(e.target.value))}><option value={6}>6 hours</option><option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option></select></label>
    </div>
    <div className="advanced-trigger-presets"><span>FROM LIVE PRICE</span>{triggerPresets.map(value=><button key={value} type="button" disabled={currentPrice<=0} onClick={()=>useTriggerPreset(value)}>{value>0?'+':''}{value}%</button>)}</div>
    <div className="advanced-order-helper"><Target size={11}/><span>{helper}</span></div>
    <button className={'advanced-order-submit '+(side==='sell'?'sell':'buy')} disabled={busy||!token||Number(trigger)<=0||(side==='buy'&&amountSol<=0)||(side==='sell'&&!hasPosition)} onClick={()=>void create()}>
      {busy?'WORKING…':'ARM '+(mode==='limit'?'LIMIT':mode==='stop_loss'?'STOP LOSS':'TAKE PROFIT')+' · PAPER'}
    </button>
    {message&&<div className={'advanced-order-message '+(/could not|invalid|no open|disabled/i.test(message)?'loss':'')}>{message}</div>}
    {tokenOrders.length>0&&<div className="advanced-order-list">
      <div className="advanced-order-list-head"><span><Clock3 size={11}/> ACTIVE ORDERS</span><b>{tokenOrders.length}</b></div>
      {tokenOrders.map(order=><div className="advanced-order-row" key={order.id}>
        <span><b>{order.order_type.replace('_',' ').toUpperCase()}</b><small>{order.side.toUpperCase()} · {order.side==='buy'?Number(order.amount_sol||0).toFixed(3)+' SOL':Number(order.sell_pct||0).toFixed(0)+'%'}</small></span>
        <strong>{money(Number(order.trigger_price_usd))}</strong>
        <button title="Cancel order" disabled={busy||order.status==='processing'} onClick={()=>void cancel(order.id)}><Trash2 size={12}/></button>
      </div>)}
    </div>}
  </section>
}
