'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowDownRight, ArrowUpRight, Trophy } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import DegenHours from '@/components/DegenHours'
import PortfolioEquityChart from '@/components/PortfolioEquityChart'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

type TokenRef={mint_address:string;ticker:string|null;name:string|null;image_url:string|null}
type Position={id:string;status:string;quantity_tokens:number;cost_basis_usd:number|null;average_entry_price_usd:number;average_entry_mc_usd:number|null;realized_pnl_usd:number|null;accounting_version:string|null;opened_at:string;closed_at:string|null;tokens:TokenRef|null}
type Trade={id:string;action:'buy'|'sell';notional_usd:number|null;amount_sol:number;quantity_tokens:number;displayed_price_usd:number;simulated_fill_price_usd:number;displayed_mc_usd:number|null;price_impact_pct:number;fee_usd:number|null;quote_timestamp:string|null;market_data_age_ms:number|null;execution_quality:string|null;accounting_version:string|null;ts:string;tokens:TokenRef|null}
type Account={cash_usd:number;starting_balance_usd:number;status:string;created_at:string}
type Ledger={id:string;entry_type:string;amount_usd:number;balance_after_usd:number;created_at:string}
type Snapshot={id:number;equity_usd:number;cash_usd:number;open_value_usd:number;realized_pnl_usd:number;unrealized_pnl_usd:number;created_at:string}
const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${Math.abs(n).toFixed(2)}`
const signedMoney=(n:number)=>`${n>=0?'+':'-'}${money(Math.abs(n))}`
const paper=(n:number)=>`${n<0?'-':''}${money(Math.abs(n))} PAPER`

export default function PortfolioPage(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[]),snapshotBusy=useRef(false)
  const [userId,setUserId]=useState(''),[account,setAccount]=useState<Account|null>(null),[positions,setPositions]=useState<Position[]>([]),[trades,setTrades]=useState<Trade[]>([]),[ledger,setLedger]=useState<Ledger[]>([]),[snapshots,setSnapshots]=useState<Snapshot[]>([]),[tradeCount,setTradeCount]=useState(0),[live,setLive]=useState<Record<string,MarketToken>>({}),[solUsd,setSolUsd]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true)

  const load=useCallback(async()=>{
    if(!supabase)return
    try{
      const user=await ensurePaperUser(supabase);setUserId(user.id)
      const [{data:a,error:ae},{data:pos,error:poe},{data:tx,error:te},{data:le,error:lee},{data:ss,error:se},{count:tc,error:tce}]=await Promise.all([
        supabase.from('paper_accounts').select('cash_usd,starting_balance_usd,status,created_at').eq('user_id',user.id).single(),
        supabase.from('paper_positions').select('id,status,quantity_tokens,cost_basis_usd,average_entry_price_usd,average_entry_mc_usd,realized_pnl_usd,accounting_version,opened_at,closed_at,tokens(mint_address,ticker,name,image_url)').eq('user_id',user.id).order('opened_at',{ascending:false}),
        supabase.from('paper_trades').select('id,action,notional_usd,amount_sol,quantity_tokens,displayed_price_usd,simulated_fill_price_usd,displayed_mc_usd,price_impact_pct,fee_usd,quote_timestamp,market_data_age_ms,execution_quality,accounting_version,ts,tokens(mint_address,ticker,name,image_url)').eq('user_id',user.id).eq('accounting_version','usd_v2').order('ts',{ascending:false}).limit(250),
        supabase.from('paper_ledger_entries').select('id,entry_type,amount_usd,balance_after_usd,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(150),
        supabase.from('portfolio_snapshots').select('id,equity_usd,cash_usd,open_value_usd,realized_pnl_usd,unrealized_pnl_usd,created_at').eq('user_id',user.id).order('created_at',{ascending:true}).limit(1000),
        supabase.from('paper_trades').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('accounting_version','usd_v2'),
      ])
      if(ae)throw ae;if(poe)throw poe;if(te)throw te;if(lee)throw lee;if(se)throw se;if(tce)throw tce
      const all=(pos||[]) as unknown as Position[],open=all.filter(x=>x.status==='open'&&x.accounting_version==='usd_v2')
      setAccount(a as Account);setPositions(all);setTrades((tx||[]) as unknown as Trade[]);setLedger((le||[]) as unknown as Ledger[]);setSnapshots((ss||[]) as Snapshot[]);setTradeCount(Number(tc||0))
      const mints=[...new Set(open.map(x=>x.tokens?.mint_address).filter((m):m is string=>Boolean(m)))]
      const [marketRes,solRes]=await Promise.all([mints.length?fetch(`/api/market/batch?mints=${encodeURIComponent(mints.join(','))}`,{cache:'no-store'}):Promise.resolve(null),fetch('/api/market/sol',{cache:'no-store'})])
      if(marketRes){const j=await marketRes.json();if(marketRes.ok){const map:Record<string,MarketToken>={};for(const t of (j.tokens||[]) as MarketToken[])map[t.mint]=t;setLive(map)}}else setLive({})
      const sj=await solRes.json().catch(()=>null);if(solRes.ok)setSolUsd(Number(sj?.priceUsd||0));setError('')
    }catch(e){setError(e instanceof Error?e.message:'Portfolio unavailable')}finally{setLoading(false)}
  },[supabase])

  useEffect(()=>{void load();const id=window.setInterval(()=>{if(!document.hidden)void load()},10000),changed=()=>void load();window.addEventListener('paper:account-changed',changed);return()=>{clearInterval(id);window.removeEventListener('paper:account-changed',changed)}},[load])

  const marks=useMemo(()=>positions.filter(p=>p.status==='open'&&p.accounting_version==='usd_v2').map(p=>{const mint=p.tokens?.mint_address||'',market=live[mint],price=Number(market?.priceUsd||p.average_entry_price_usd||0),markedUsd=Number(p.quantity_tokens)*price,costUsd=Number(p.cost_basis_usd||0),unrealized=markedUsd-costUsd;return {...p,market,price,markedUsd,costUsd,unrealized,roi:costUsd>0?unrealized/costUsd*100:0}}),[positions,live])
  const closed=useMemo(()=>positions.filter(p=>p.status==='closed'&&p.accounting_version==='usd_v2'),[positions])
  const cash=Number(account?.cash_usd||0),initial=Number(account?.starting_balance_usd||1000),openValue=marks.reduce((s,p)=>s+p.markedUsd,0),equity=cash+openValue,pnl=equity-initial,roi=initial>0?pnl/initial*100:0,realized=positions.filter(p=>p.accounting_version==='usd_v2').reduce((s,p)=>s+Number(p.realized_pnl_usd||0),0),unrealized=marks.reduce((s,p)=>s+p.unrealized,0),solEq=solUsd>0?equity/solUsd:0
  const winners=closed.filter(p=>Number(p.realized_pnl_usd||0)>0),losers=closed.filter(p=>Number(p.realized_pnl_usd||0)<0),winRate=closed.length?winners.length/closed.length*100:0,avgWinner=winners.length?winners.reduce((s,p)=>s+Number(p.realized_pnl_usd||0),0)/winners.length:0,avgLoser=losers.length?losers.reduce((s,p)=>s+Number(p.realized_pnl_usd||0),0)/losers.length:0,bestTrade=closed.length?Math.max(...closed.map(p=>Number(p.realized_pnl_usd||0))):0,worstTrade=closed.length?Math.min(...closed.map(p=>Number(p.realized_pnl_usd||0))):0
  const equityPoints=useMemo(()=>{const list=snapshots.map(s=>({time:Math.floor(new Date(s.created_at).getTime()/1000),equity:Number(s.equity_usd)}));if(account?.created_at){const t=Math.floor(new Date(account.created_at).getTime()/1000);if(Number.isFinite(t)&&(!list.length||t<list[0].time))list.unshift({time:t,equity:initial})}const now=Math.floor(Date.now()/1000);if(!list.length||Math.abs((list[list.length-1]?.equity||0)-equity)>.001||now-(list[list.length-1]?.time||0)>90)list.push({time:now,equity});return list},[snapshots,account?.created_at,initial,equity])

  useEffect(()=>{if(!supabase||!userId||!account||loading||snapshotBusy.current||!Number.isFinite(equity))return;snapshotBusy.current=true;void supabase.rpc('record_portfolio_snapshot',{p_equity_usd:equity,p_cash_usd:cash,p_open_value_usd:openValue,p_realized_pnl_usd:realized,p_unrealized_pnl_usd:unrealized}).then((result:{error:unknown})=>{if(!result.error){const now=new Date().toISOString();setSnapshots(cur=>{const last=cur[cur.length-1];if(last&&Date.now()-new Date(last.created_at).getTime()<55_000)return cur;return[...cur,{id:Date.now(),equity_usd:equity,cash_usd:cash,open_value_usd:openValue,realized_pnl_usd:realized,unrealized_pnl_usd:unrealized,created_at:now}].slice(-1000)})}}).finally(()=>{snapshotBusy.current=false})},[supabase,userId,account,loading,equity,cash,openValue,realized,unrealized])

  const performance=[['TOTAL P&L',signedMoney(pnl),pnl],['REALIZED',signedMoney(realized),realized],['UNREALIZED',signedMoney(unrealized),unrealized],['TXNS',tradeCount.toLocaleString(),0],['WIN RATE',`${winRate.toFixed(1)}%`,winRate-50],['AVG WIN',winners.length?signedMoney(avgWinner):'—',avgWinner],['AVG LOSS',losers.length?signedMoney(avgLoser):'—',avgLoser],['BEST CLOSE',closed.length?signedMoney(bestTrade):'—',bestTrade],['WORST CLOSE',closed.length?signedMoney(worstTrade):'—',worstTrade]] as const

  return <div className="ax-app"><AppHeader active="portfolio"/><main className="terminal-page portfolio-page p45-portfolio"><div className="terminal-page-inner portfolio-inner">
    <div className="portfolio-title-row"><div><div className="terminal-eyebrow">PAPER PORTFOLIO · SERVER ACCOUNT · LIVE MARKS</div><h1>Portfolio</h1><p className="terminal-lead">Interactive PAPER equity, live positions, verified simulated fills and trading-behavior analytics.</p></div><div className="portfolio-sol-price"><small>LIVE SOL/USD</small><b>{solUsd?money(solUsd):'Loading…'}</b><span>{solEq?`Equity ≈ ${solEq.toFixed(3)} SOL`:''}</span></div></div>
    {error&&<div className="error-card">{error}<button onClick={()=>void load()}>Retry</button></div>}
    <section className="portfolio-stat-grid"><div className="portfolio-stat hero"><small>TOTAL PAPER EQUITY</small><b>{loading?'…':paper(equity)}</b><span>Cash + current live marks</span></div><div className="portfolio-stat"><small>PAPER BUYING POWER</small><b>{paper(cash)}</b><span>Server-side cash balance</span></div><div className="portfolio-stat"><small>OPEN VALUE</small><b>{paper(openValue)}</b><span>{marks.length} live position{marks.length===1?'':'s'}</span></div><div className="portfolio-stat"><small>TOTAL P&amp;L</small><b className={pnl>=0?'gain':'loss'}>{signedMoney(pnl)}</b><span className={roi>=0?'gain':'loss'}>{roi>=0?'+':''}{roi.toFixed(2)}% ROI</span></div><div className="portfolio-stat"><small>REALIZED / UNREALIZED</small><b><span className={realized>=0?'gain':'loss'}>{signedMoney(realized)}</span> / <span className={unrealized>=0?'gain':'loss'}>{signedMoney(unrealized)}</span></b><span>PAPER performance</span></div></section>

    <section className="portfolio-analytics-grid"><PortfolioEquityChart points={equityPoints} startingEquity={initial}/><aside className="portfolio-performance-card"><div className="portfolio-panel-head"><div><b>PERFORMANCE</b><span>Calculated from server-recorded PAPER positions and fills</span></div><Trophy size={15}/></div><div className="performance-grid">{performance.map(([label,value,signal])=><div key={label}><small>{label}</small><b className={label==='TXNS'?'':signal>=0?'gain':'loss'}>{value}</b></div>)}</div></aside></section>

    <section className="portfolio-workspace"><div className="portfolio-main-column"><section className="portfolio-panel"><div className="portfolio-panel-head"><b>ACTIVE POSITIONS</b><span>Current market marks · unavailable markets fall back to recorded entry price</span></div><div className="portfolio-table portfolio-positions-head"><span>Token</span><span>Cost</span><span>Marked Value</span><span>Entry</span><span>Current</span><span>P&amp;L</span><span>ROI</span></div>{!marks.length?<div className="portfolio-empty">No open USD-mode PAPER positions. <Link href="/">Find a memecoin</Link>.</div>:marks.map(p=><Link href={`/spot?mint=${p.tokens?.mint_address||''}`} key={p.id} className="portfolio-table portfolio-position-row"><span className="portfolio-token">{p.tokens?.image_url?<img src={p.tokens.image_url} alt=""/>:<i>{(p.tokens?.ticker||'??').slice(0,2)}</i>}<b>${p.tokens?.ticker||'MEME'}</b></span><span>{paper(p.costUsd)}</span><span>{paper(p.markedUsd)}</span><span>{money(Number(p.average_entry_price_usd))}</span><span>{money(p.price)}</span><strong className={p.unrealized>=0?'gain':'loss'}>{signedMoney(p.unrealized)}</strong><strong className={p.roi>=0?'gain':'loss'}>{p.roi>=0?'+':''}{p.roi.toFixed(2)}%</strong></Link>)}</section>

      <DegenHours positions={closed}/>

      <section className="portfolio-panel"><div className="portfolio-panel-head"><b>PAPER FILLS</b><span>Server-recorded USD-mode fills · showing {Math.min(250,trades.length)} of {tradeCount}</span></div><div className="portfolio-table portfolio-history-head"><span>Time</span><span>Side</span><span>Token</span><span>Notional</span><span>Reference</span><span>Fill</span><span>Impact</span><span>Fee</span></div>{!trades.length?<div className="portfolio-empty">No USD-mode PAPER fills yet.</div>:trades.map(t=><div className="portfolio-table portfolio-history-row" key={t.id}><span>{new Date(t.ts).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span><b className={t.action==='buy'?'gain':'loss'}>{t.action.toUpperCase()}</b><span>${t.tokens?.ticker||'MEME'}</span><span>{money(Number(t.notional_usd||0))}</span><span>{money(Number(t.displayed_price_usd))}</span><span>{money(Number(t.simulated_fill_price_usd))}</span><span>{Number(t.price_impact_pct).toFixed(2)}%</span><span>{money(Number(t.fee_usd||0))}</span></div>)}</section></div>

      <aside className="portfolio-activity-card"><div className="portfolio-panel-head"><div><b>ACTIVITY</b><span>Latest PAPER execution events</span></div><Activity size={15}/></div><div className="portfolio-activity-list">{!trades.length?<div className="portfolio-empty">No PAPER activity yet.</div>:trades.slice(0,24).map(t=><Link href={t.tokens?.mint_address?`/spot?mint=${t.tokens.mint_address}`:'#'} key={t.id} className="portfolio-activity-row"><span className={`activity-icon ${t.action}`}>{t.action==='buy'?<ArrowUpRight size={13}/>:<ArrowDownRight size={13}/>}</span><div><b>{t.action.toUpperCase()} ${t.tokens?.ticker||'MEME'}</b><span>{money(Number(t.notional_usd||0))} · impact {Number(t.price_impact_pct||0).toFixed(2)}%</span></div><time>{new Date(t.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></Link>)}</div></aside>
    </section>

    <section className="portfolio-panel"><div className="portfolio-panel-head"><b>ACCOUNT LEDGER</b><span>Immutable server-side cash events</span></div><div className="ledger-list">{ledger.map(entry=><div className="ledger-row" key={entry.id}><span>{new Date(entry.created_at).toLocaleString()}</span><b>{entry.entry_type.replaceAll('_',' ')}</b><span className={Number(entry.amount_usd)>=0?'gain':'loss'}>{signedMoney(Number(entry.amount_usd))}</span><span>Balance {money(Number(entry.balance_after_usd))}</span></div>)}</div></section>
  </div></main><BottomDock active="portfolio"/></div>
}
