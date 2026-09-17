'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

type TokenRef={mint_address:string;ticker:string|null;name:string|null;image_url:string|null}
type Position={id:string;status:string;quantity_tokens:number;cost_basis_usd:number|null;average_entry_price_usd:number;average_entry_mc_usd:number|null;realized_pnl_usd:number|null;accounting_version:string|null;opened_at:string;closed_at:string|null;tokens:TokenRef|null}
type Trade={id:string;action:'buy'|'sell';notional_usd:number|null;amount_sol:number;quantity_tokens:number;displayed_price_usd:number;simulated_fill_price_usd:number;displayed_mc_usd:number|null;price_impact_pct:number;fee_usd:number|null;quote_timestamp:string|null;market_data_age_ms:number|null;execution_quality:string|null;accounting_version:string|null;ts:string;tokens:TokenRef|null}
type Account={cash_usd:number;starting_balance_usd:number;status:string}
type Ledger={id:string;entry_type:string;amount_usd:number;balance_after_usd:number;created_at:string}
const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(2)}`
const paper=(n:number)=>`${money(n)} PAPER`

export default function PortfolioPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [account,setAccount]=useState<Account|null>(null),[positions,setPositions]=useState<Position[]>([]),[trades,setTrades]=useState<Trade[]>([]),[ledger,setLedger]=useState<Ledger[]>([]),[live,setLive]=useState<Record<string,MarketToken>>({}),[solUsd,setSolUsd]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true)

  const load=useCallback(async()=>{
    if(!supabase)return
    try{
      const user=await ensurePaperUser(supabase)
      const [{data:a,error:ae},{data:pos,error:poe},{data:tx,error:te},{data:le,error:lee}]=await Promise.all([
        supabase.from('paper_accounts').select('cash_usd,starting_balance_usd,status').eq('user_id',user.id).single(),
        supabase.from('paper_positions').select('id,status,quantity_tokens,cost_basis_usd,average_entry_price_usd,average_entry_mc_usd,realized_pnl_usd,accounting_version,opened_at,closed_at,tokens(mint_address,ticker,name,image_url)').eq('user_id',user.id).order('opened_at',{ascending:false}),
        supabase.from('paper_trades').select('id,action,notional_usd,amount_sol,quantity_tokens,displayed_price_usd,simulated_fill_price_usd,displayed_mc_usd,price_impact_pct,fee_usd,quote_timestamp,market_data_age_ms,execution_quality,accounting_version,ts,tokens(mint_address,ticker,name,image_url)').eq('user_id',user.id).eq('accounting_version','usd_v2').order('ts',{ascending:false}).limit(100),
        supabase.from('paper_ledger_entries').select('id,entry_type,amount_usd,balance_after_usd,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100),
      ])
      if(ae)throw ae;if(poe)throw poe;if(te)throw te;if(lee)throw lee
      const all=(pos||[]) as unknown as Position[],open=all.filter(x=>x.status==='open'&&x.accounting_version==='usd_v2')
      setAccount(a as Account);setPositions(all);setTrades((tx||[]) as unknown as Trade[]);setLedger((le||[]) as unknown as Ledger[])
      const mints=[...new Set(open.map(x=>x.tokens?.mint_address).filter((m):m is string=>Boolean(m)))]
      const [marketRes,solRes]=await Promise.all([mints.length?fetch(`/api/market/batch?mints=${encodeURIComponent(mints.join(','))}`,{cache:'no-store'}):Promise.resolve(null),fetch('/api/market/sol',{cache:'no-store'})])
      if(marketRes){const j=await marketRes.json();if(marketRes.ok){const map:Record<string,MarketToken>={};for(const t of (j.tokens||[]) as MarketToken[])map[t.mint]=t;setLive(map)}}
      const sj=await solRes.json().catch(()=>null);if(solRes.ok)setSolUsd(Number(sj?.priceUsd||0));setError('')
    }catch(e){setError(e instanceof Error?e.message:'Portfolio unavailable')}finally{setLoading(false)}
  },[supabase])

  useEffect(()=>{void load();const id=window.setInterval(()=>{if(!document.hidden)void load()},10000),changed=()=>void load();window.addEventListener('paper:account-changed',changed);return()=>{clearInterval(id);window.removeEventListener('paper:account-changed',changed)}},[load])

  const marks=useMemo(()=>positions.filter(p=>p.status==='open'&&p.accounting_version==='usd_v2').map(p=>{const mint=p.tokens?.mint_address||'',market=live[mint],price=Number(market?.priceUsd||p.average_entry_price_usd||0),markedUsd=Number(p.quantity_tokens)*price,costUsd=Number(p.cost_basis_usd||0),unrealized=markedUsd-costUsd;return {...p,market,price,markedUsd,costUsd,unrealized,roi:costUsd>0?unrealized/costUsd*100:0}}),[positions,live])
  const cash=Number(account?.cash_usd||0),initial=Number(account?.starting_balance_usd||1000),openValue=marks.reduce((s,p)=>s+p.markedUsd,0),equity=cash+openValue,pnl=equity-initial,roi=initial>0?pnl/initial*100:0,realized=positions.filter(p=>p.accounting_version==='usd_v2').reduce((s,p)=>s+Number(p.realized_pnl_usd||0),0),unrealized=marks.reduce((s,p)=>s+p.unrealized,0),solEq=solUsd>0?equity/solUsd:0

  return <div className="ax-app"><AppHeader active="portfolio"/><main className="terminal-page portfolio-page"><div className="terminal-page-inner portfolio-inner">
    <div className="portfolio-title-row"><div><div className="terminal-eyebrow">PAPER PORTFOLIO · SERVER ACCOUNT · LIVE MARKS</div><h1>Portfolio</h1><p className="terminal-lead">$1,000 starting PAPER equity, current buying power, live positions and server-recorded simulated fills.</p></div><div className="portfolio-sol-price"><small>LIVE SOL/USD</small><b>{solUsd?money(solUsd):'Loading…'}</b><span>{solEq?`Equity ≈ ${solEq.toFixed(3)} SOL`:''}</span></div></div>
    {error&&<div className="error-card">{error}<button onClick={()=>void load()}>Retry</button></div>}
    <section className="portfolio-stat-grid"><div className="portfolio-stat hero"><small>TOTAL PAPER EQUITY</small><b>{loading?'…':paper(equity)}</b><span>Cash + live marked USD positions</span></div><div className="portfolio-stat"><small>PAPER BUYING POWER</small><b>{paper(cash)}</b><span>Server-side cash balance</span></div><div className="portfolio-stat"><small>OPEN VALUE</small><b>{paper(openValue)}</b><span>{marks.length} live position{marks.length===1?'':'s'}</span></div><div className="portfolio-stat"><small>TOTAL P&amp;L</small><b className={pnl>=0?'gain':'loss'}>{pnl>=0?'+':''}{paper(pnl)}</b><span className={roi>=0?'gain':'loss'}>{roi>=0?'+':''}{roi.toFixed(2)}% ROI</span></div><div className="portfolio-stat"><small>REALIZED / UNREALIZED</small><b><span className={realized>=0?'gain':'loss'}>{realized>=0?'+':''}{money(realized)}</span> / <span className={unrealized>=0?'gain':'loss'}>{unrealized>=0?'+':''}{money(unrealized)}</span></b><span>PAPER performance</span></div></section>

    <section className="portfolio-panel"><div className="portfolio-panel-head"><b>ACTIVE POSITIONS</b><span>Current market marks · missing/stale markets fall back to last entry price</span></div><div className="portfolio-table portfolio-positions-head"><span>Token</span><span>Cost</span><span>Marked Value</span><span>Entry</span><span>Current</span><span>P&amp;L</span><span>ROI</span></div>{!marks.length?<div className="portfolio-empty">No open USD-mode PAPER positions. <Link href="/">Find a memecoin</Link>.</div>:marks.map(p=><Link href={`/spot?mint=${p.tokens?.mint_address||''}`} key={p.id} className="portfolio-table portfolio-position-row"><span className="portfolio-token">{p.tokens?.image_url?<img src={p.tokens.image_url} alt=""/>:<i>{(p.tokens?.ticker||'??').slice(0,2)}</i>}<b>${p.tokens?.ticker||'MEME'}</b></span><span>{paper(p.costUsd)}</span><span>{paper(p.markedUsd)}</span><span>{money(Number(p.average_entry_price_usd))}</span><span>{money(p.price)}</span><strong className={p.unrealized>=0?'gain':'loss'}>{p.unrealized>=0?'+':''}{paper(p.unrealized)}</strong><strong className={p.roi>=0?'gain':'loss'}>{p.roi>=0?'+':''}{p.roi.toFixed(2)}%</strong></Link>)}</section>

    <section className="portfolio-panel"><div className="portfolio-panel-head"><b>PAPER FILLS</b><span>USD-mode fills only · last {Math.min(100,trades.length)}</span></div><div className="portfolio-table portfolio-history-head"><span>Time</span><span>Side</span><span>Token</span><span>Notional</span><span>Reference</span><span>Fill</span><span>Impact</span><span>Fee</span></div>{!trades.length?<div className="portfolio-empty">No USD-mode PAPER fills yet.</div>:trades.map(t=><div className="portfolio-table portfolio-history-row" key={t.id}><span>{new Date(t.ts).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span><b className={t.action==='buy'?'gain':'loss'}>{t.action.toUpperCase()}</b><span>${t.tokens?.ticker||'MEME'}</span><span>{money(Number(t.notional_usd||0))}</span><span>{money(Number(t.displayed_price_usd))}</span><span>{money(Number(t.simulated_fill_price_usd))}</span><span>{Number(t.price_impact_pct).toFixed(2)}%</span><span>{money(Number(t.fee_usd||0))}</span></div>)}</section>

    <section className="portfolio-panel"><div className="portfolio-panel-head"><b>ACCOUNT LEDGER</b><span>Immutable server-side balance events</span></div><div className="ledger-list">{ledger.map(entry=><div className="ledger-row" key={entry.id}><span>{new Date(entry.created_at).toLocaleString()}</span><b>{entry.entry_type.replaceAll('_',' ')}</b><span className={Number(entry.amount_usd)>=0?'gain':'loss'}>{Number(entry.amount_usd)>=0?'+':''}{money(Number(entry.amount_usd))}</span><span>Balance {money(Number(entry.balance_after_usd))}</span></div>)}</div></section>
  </div></main><BottomDock active="portfolio"/></div>
}
