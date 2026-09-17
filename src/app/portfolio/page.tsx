'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

type TokenRef={mint_address:string;ticker:string|null;name:string|null;image_url:string|null}
type Position={id:string;status:string;quantity_tokens:number;cost_basis_sol:number;average_entry_price_usd:number;average_entry_mc_usd:number|null;realized_pnl_sol:number;opened_at:string;closed_at:string|null;tokens:TokenRef|null}
type Trade={id:string;action:'buy'|'sell';amount_sol:number;quantity_tokens:number;displayed_price_usd:number;simulated_fill_price_usd:number;displayed_mc_usd:number|null;price_impact_pct:number;fee_sol:number;ts:string;tokens:TokenRef|null}
type Profile={paper_cash_sol:number;initial_paper_cash_sol:number}
const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(n<1?6:2)}`
const paper=(n:number)=>`${n.toFixed(3)} PAPER SOL`

export default function PortfolioPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [profile,setProfile]=useState<Profile|null>(null)
  const [positions,setPositions]=useState<Position[]>([])
  const [trades,setTrades]=useState<Trade[]>([])
  const [live,setLive]=useState<Record<string,MarketToken>>({})
  const [solUsd,setSolUsd]=useState(0)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)

  const load=useCallback(async()=>{
    if(!supabase)return
    try{
      const user=await ensurePaperUser(supabase)
      const [{data:p,error:pe},{data:pos,error:poe},{data:tx,error:te}]=await Promise.all([
        supabase.from('profiles').select('paper_cash_sol,initial_paper_cash_sol').eq('id',user.id).single(),
        supabase.from('paper_positions').select('id,status,quantity_tokens,cost_basis_sol,average_entry_price_usd,average_entry_mc_usd,realized_pnl_sol,opened_at,closed_at,tokens(mint_address,ticker,name,image_url)').eq('user_id',user.id).order('opened_at',{ascending:false}),
        supabase.from('paper_trades').select('id,action,amount_sol,quantity_tokens,displayed_price_usd,simulated_fill_price_usd,displayed_mc_usd,price_impact_pct,fee_sol,ts,tokens(mint_address,ticker,name,image_url)').eq('user_id',user.id).order('ts',{ascending:false}).limit(100),
      ])
      if(pe)throw pe;if(poe)throw poe;if(te)throw te
      const all=(pos||[]) as unknown as Position[],open=all.filter(x=>x.status==='open')
      setProfile(p as Profile);setPositions(all);setTrades((tx||[]) as unknown as Trade[])
      const mints=[...new Set(open.map(x=>x.tokens?.mint_address).filter((m):m is string=>Boolean(m)))]
      const [marketRes,solRes]=await Promise.all([
        mints.length?fetch(`/api/market/batch?mints=${encodeURIComponent(mints.join(','))}`,{cache:'no-store'}):Promise.resolve(null),
        fetch('/api/market/sol',{cache:'no-store'}),
      ])
      if(marketRes){const j=await marketRes.json();if(marketRes.ok){const map:Record<string,MarketToken>={};for(const t of (j.tokens||[]) as MarketToken[])map[t.mint]=t;setLive(map)}}
      const sj=await solRes.json();if(solRes.ok)setSolUsd(Number(sj.priceUsd||0))
      setError('')
    }catch(e){setError(e instanceof Error?e.message:'Portfolio unavailable')}
    finally{setLoading(false)}
  },[supabase])

  useEffect(()=>{void load();const id=window.setInterval(()=>{if(!document.hidden)void load()},15_000);const changed=()=>void load();window.addEventListener('paper:account-changed',changed);return()=>{window.clearInterval(id);window.removeEventListener('paper:account-changed',changed)}},[load])

  const openPositions=positions.filter(p=>p.status==='open')
  const marks=useMemo(()=>openPositions.map(p=>{
    const mint=p.tokens?.mint_address||'',market=live[mint]
    const price=Number(market?.priceUsd||p.average_entry_price_usd||0)
    const usd=Number(p.quantity_tokens)*price
    const markedSol=solUsd>0?usd/solUsd:Number(p.cost_basis_sol)*(price/Math.max(Number(p.average_entry_price_usd),1e-18))
    const unrealized=markedSol-Number(p.cost_basis_sol)
    return {...p,market,price,markedSol,unrealized,roi:Number(p.cost_basis_sol)>0?unrealized/Number(p.cost_basis_sol)*100:0}
  }),[openPositions,live,solUsd])

  const cash=Number(profile?.paper_cash_sol||0),initial=Number(profile?.initial_paper_cash_sol||1000),openValue=marks.reduce((s,p)=>s+p.markedSol,0),equity=cash+openValue,pnl=equity-initial,roi=initial>0?pnl/initial*100:0,realized=positions.reduce((s,p)=>s+Number(p.realized_pnl_sol||0),0)

  return <div className="ax-app"><AppHeader active="portfolio"/><main className="terminal-page portfolio-page"><div className="terminal-page-inner portfolio-inner">
    <div className="portfolio-title-row"><div><div className="terminal-eyebrow">PAPER PORTFOLIO · LIVE MARKS</div><h1>Portfolio</h1><p className="terminal-lead">Your PAPER cash, live marked positions, realized performance and complete simulated activity.</p></div><div className="portfolio-sol-price"><small>LIVE SOL/USD</small><b>{solUsd?money(solUsd):'Loading…'}</b></div></div>
    {error&&<div className="error-card">{error}<button onClick={()=>void load()}>Retry</button></div>}
    <section className="portfolio-stat-grid">
      <div className="portfolio-stat hero"><small>TOTAL PAPER EQUITY</small><b>{loading?'…':paper(equity)}</b><span>Cash + live marked positions</span></div>
      <div className="portfolio-stat"><small>PAPER CASH</small><b>{paper(cash)}</b><span>Available to trade</span></div>
      <div className="portfolio-stat"><small>OPEN VALUE</small><b>{paper(openValue)}</b><span>{marks.length} open position{marks.length===1?'':'s'}</span></div>
      <div className="portfolio-stat"><small>TOTAL P&amp;L</small><b className={pnl>=0?'gain':'loss'}>{pnl>=0?'+':''}{paper(pnl)}</b><span className={roi>=0?'gain':'loss'}>{roi>=0?'+':''}{roi.toFixed(2)}% ROI</span></div>
      <div className="portfolio-stat"><small>REALIZED P&amp;L</small><b className={realized>=0?'gain':'loss'}>{realized>=0?'+':''}{paper(realized)}</b><span>Closed PAPER performance</span></div>
    </section>

    <section className="portfolio-panel"><div className="portfolio-panel-head"><b>ACTIVE POSITIONS</b><span>Marked against current Solana market prices</span></div><div className="portfolio-table portfolio-positions-head"><span>Token</span><span>Cost</span><span>Marked Value</span><span>Entry</span><span>Current</span><span>P&amp;L</span><span>ROI</span></div>{!marks.length?<div className="portfolio-empty">No open PAPER positions. <Link href="/">Find a memecoin</Link>.</div>:marks.map(p=><Link href={`/spot?mint=${p.tokens?.mint_address||''}`} key={p.id} className="portfolio-table portfolio-position-row"><span className="portfolio-token">{p.tokens?.image_url?<img src={p.tokens.image_url} alt=""/>:<i>{(p.tokens?.ticker||'??').slice(0,2)}</i>}<b>${p.tokens?.ticker||'MEME'}</b></span><span>{paper(Number(p.cost_basis_sol))}</span><span>{paper(p.markedSol)}</span><span>{money(Number(p.average_entry_price_usd))}</span><span>{money(p.price)}</span><strong className={p.unrealized>=0?'gain':'loss'}>{p.unrealized>=0?'+':''}{paper(p.unrealized)}</strong><strong className={p.roi>=0?'gain':'loss'}>{p.roi>=0?'+':''}{p.roi.toFixed(2)}%</strong></Link>)}</section>

    <section className="portfolio-panel"><div className="portfolio-panel-head"><b>PAPER ACTIVITY</b><span>Last {Math.min(100,trades.length)} simulated fills</span></div><div className="portfolio-table portfolio-history-head"><span>Time</span><span>Side</span><span>Token</span><span>Size</span><span>Displayed</span><span>Fill</span><span>Impact</span><span>Fee</span></div>{!trades.length?<div className="portfolio-empty">No PAPER fills yet.</div>:trades.map(t=><div className="portfolio-table portfolio-history-row" key={t.id}><span>{new Date(t.ts).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span><b className={t.action==='buy'?'gain':'loss'}>{t.action.toUpperCase()}</b><span>${t.tokens?.ticker||'MEME'}</span><span>{Number(t.amount_sol).toFixed(3)} SOL</span><span>{money(Number(t.displayed_price_usd))}</span><span>{money(Number(t.simulated_fill_price_usd))}</span><span>{Number(t.price_impact_pct).toFixed(2)}%</span><span>{Number(t.fee_sol).toFixed(4)}</span></div>)}</section>
  </div></main><BottomDock active="portfolio"/></div>
}
