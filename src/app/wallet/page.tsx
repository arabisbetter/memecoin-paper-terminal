'use client'

import { useEffect, useMemo, useState } from 'react'
import AppHeader from '@/components/AppHeader'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

type Position={id:string;quantity_tokens:number;cost_basis_sol:number;average_entry_price_usd:number;realized_pnl_sol:number;opened_at:string;status:string;tokens:{ticker:string|null;name:string|null;image_url:string|null;mint_address:string}|null}
type Trade={id:string;action:string;amount_sol:number;executed_at:string;displayed_mc_usd:number|null;tokens:{ticker:string|null;name:string|null;image_url:string|null}|null}

export default function WalletPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [cash,setCash]=useState(1000)
  const [positions,setPositions]=useState<Position[]>([])
  const [trades,setTrades]=useState<Trade[]>([])
  const [tab,setTab]=useState<'active'|'history'>('active')
  const [range,setRange]=useState<'1d'|'7d'|'30d'|'max'>('1d')
  const [uid,setUid]=useState('')
  async function load(){
    if(!supabase)return
    const user=await ensurePaperUser(supabase);setUid(user.id)
    const [{data:p},{data:pos},{data:tx}]=await Promise.all([
      supabase.from('profiles').select('paper_cash_sol').eq('id',user.id).single(),
      supabase.from('paper_positions').select('id,quantity_tokens,cost_basis_sol,average_entry_price_usd,realized_pnl_sol,opened_at,status,tokens(ticker,name,image_url,mint_address)').eq('user_id',user.id).order('opened_at',{ascending:false}),
      supabase.from('paper_trades').select('id,action,amount_sol,executed_at,displayed_mc_usd,tokens(ticker,name,image_url)').eq('user_id',user.id).order('executed_at',{ascending:false}).limit(20)
    ])
    if(p)setCash(Number(p.paper_cash_sol));setPositions((pos||[]) as unknown as Position[]);setTrades((tx||[]) as unknown as Trade[])
  }
  useEffect(()=>{void load();const id=setInterval(load,15000);return()=>clearInterval(id)},[supabase])
  const active=positions.filter(p=>p.status==='open')
  const realized=positions.reduce((s,p)=>s+Number(p.realized_pnl_sol||0),0)
  const total=cash+active.reduce((s,p)=>s+Number(p.cost_basis_sol||0),0)
  const pnl=total-1000
  const wins=positions.filter(p=>p.status==='closed'&&Number(p.realized_pnl_sol)>0).length
  const losses=positions.filter(p=>p.status==='closed'&&Number(p.realized_pnl_sol)<=0).length
  return <div className="ax-app"><AppHeader active="wallet"/>
    <main className="wallet-page">
      <div className="wallet-section-tabs"><button className="active">Spot</button></div>
      <div className="wallet-controls"><span>PAPER WALLET</span><div className="range-tabs">{(['1d','7d','30d','max'] as const).map(r=><button key={r} className={range===r?'active':''} onClick={()=>setRange(r)}>{r==='max'?'Max':r}</button>)}</div></div>
      <div className="wallet-grid-top">
        <section className="wallet-card balance-card"><h3>Balance</h3><small>Total Value</small><strong>{total.toFixed(2)} PAPER SOL</strong><small>Unrealized PNL</small><b className={pnl>=0?'gain':'loss'}>{pnl>=0?'+':''}{pnl.toFixed(3)} SOL</b><div className="balance-divider"/><small>Tradeable Balance</small><strong className="small-strong">{cash.toFixed(2)} PAPER SOL</strong></section>
        <section className="wallet-card pnl-card"><div className="card-head"><h3>Realized PNL</h3><span>{range.toUpperCase()}</span></div><div className="pnl-chart"><svg viewBox="0 0 500 210" preserveAspectRatio="none"><path d="M0 170 L80 168 L150 172 L220 170 L290 130 L360 100 L430 55 L500 20 L500 210 L0 210Z" fill="rgba(56,220,168,.13)"/><polyline points="0,170 80,168 150,172 220,170 290,130 360,100 430,55 500,20" fill="none" stroke="#38dca8" strokeWidth="3"/></svg><span>{realized>=0?'+':''}{realized.toFixed(3)} PAPER SOL</span></div></section>
        <section className="wallet-card performance-card"><h3>Performance</h3><div><span>Total PNL</span><b className={pnl>=0?'gain':'loss'}>{pnl>=0?'+':''}{pnl.toFixed(3)}</b></div><div><span>Realized PNL</span><b className={realized>=0?'gain':'loss'}>{realized>=0?'+':''}{realized.toFixed(3)}</b></div><div><span>TXNS</span><b>{trades.length}</b></div><div><span>Wins / Losses</span><b><em className="gain">{wins}</em> / <em className="loss">{losses}</em></b></div><div className="perf-bar"><i style={{width:`${wins+losses?Math.round(wins/(wins+losses)*100):50}%`}}/><i/></div></section>
      </div>
      <div className="wallet-grid-bottom">
        <section className="wallet-card positions-card"><div className="wallet-subtabs"><button className={tab==='active'?'active':''} onClick={()=>setTab('active')}>Active Positions</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>History</button></div><div className="wallet-table-head"><span>Token</span><span>Bought</span><span>Remaining</span><span>PNL</span><span>Opened</span></div>{(tab==='active'?active:positions.filter(p=>p.status==='closed')).map(p=><div className="wallet-pos-row" key={p.id}><div className="wallet-token">{p.tokens?.image_url?<img src={p.tokens.image_url} alt=""/>:<span>◢</span>}<b>{p.tokens?.ticker||'MEME'}</b></div><span>{Number(p.cost_basis_sol).toFixed(3)} SOL</span><span>{Number(p.quantity_tokens).toLocaleString(undefined,{maximumFractionDigits:2})}</span><b className={Number(p.realized_pnl_sol)>=0?'gain':'loss'}>{Number(p.realized_pnl_sol)>=0?'+':''}{Number(p.realized_pnl_sol).toFixed(3)}</b><span>{new Date(p.opened_at).toLocaleDateString()}</span></div>)}{!(tab==='active'?active:positions.filter(p=>p.status==='closed')).length&&<div className="table-empty">No {tab==='active'?'open positions':'trade history'} yet.</div>}</section>
        <section className="wallet-card activity-card"><div className="wallet-subtabs"><button className="active">Activity</button></div><div className="wallet-activity-head"><span>Type</span><span>Token</span><span>Amount</span><span>Market Cap</span></div>{trades.map(t=><div className="wallet-activity-row" key={t.id}><b className={t.action==='buy'?'gain':'loss'}>{t.action==='buy'?'Buy':'Sell'}</b><span>{t.tokens?.ticker||'MEME'}</span><span>{Number(t.amount_sol).toFixed(3)} SOL</span><span>{t.displayed_mc_usd?`$${Math.round(Number(t.displayed_mc_usd)).toLocaleString()}`:'—'}</span></div>)}</section>
      </div>
    </main>
  </div>
}
