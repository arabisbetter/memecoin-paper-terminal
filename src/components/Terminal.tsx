'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, ExternalLink, Info, Search, ShieldCheck, Zap } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import CandleChart from '@/components/CandleChart'
import MarketTape from '@/components/MarketTape'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

type TokenRef={mint_address:string;ticker:string|null;name:string|null;image_url:string|null}
type DbPosition={id:string;token_id:string;quantity_tokens:number;cost_basis_usd:number|null;average_entry_price_usd:number;average_entry_mc_usd:number|null;realized_pnl_usd:number|null;accounting_version:string|null;opened_at:string;tokens:TokenRef|null}
type LivePosition=DbPosition&{current?:MarketToken}
type Account={cash_usd:number;starting_balance_usd:number;status:string}
type FillReceipt={side:'buy'|'sell';symbol:string;amountUsd:number;referencePrice:number;fillPrice:number;impactPct:number;feeUsd:number;quality:string;ageMs:number}
const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:n>=1?`$${n.toFixed(2)}`:`$${n.toPrecision(5)}`
const pct=(n:number)=>`${n>=0?'+':''}${n.toFixed(2)}%`
const short=(s:string)=>s.length>11?`${s.slice(0,5)}…${s.slice(-4)}`:s
const isMint=(s:string)=>/^[1-9A-HJ-NP-Za-km-z]{32,60}$/.test(s.trim())

export default function Terminal(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [tokens,setTokens]=useState<MarketToken[]>([]),[selected,setSelected]=useState<MarketToken|null>(null),[positions,setPositions]=useState<LivePosition[]>([])
  const [account,setAccount]=useState<Account|null>(null),[solUsd,setSolUsd]=useState(0),[userId,setUserId]=useState(''),[viewCount,setViewCount]=useState(0)
  const [query,setQuery]=useState(''),[side,setSide]=useState<'buy'|'sell'>('buy'),[amount,setAmount]=useState(.1),[sellPct,setSellPct]=useState(100),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[copied,setCopied]=useState(false)
  const [selectedUpdatedAt,setSelectedUpdatedAt]=useState(0),[receipt,setReceipt]=useState<FillReceipt|null>(null),[instantMode,setInstantMode]=useState(false)
  const feedBusy=useRef(false),accountBusy=useRef(false)

  const loadAccount=useCallback(async(id?:string,force=false)=>{
    if(!supabase||accountBusy.current||(!force&&typeof document!=='undefined'&&document.hidden))return
    accountBusy.current=true
    try{
      const uid=id||(await supabase.auth.getUser()).data.user?.id;if(!uid)return;setUserId(uid)
      const [{data:a,error:accountError},{data:rows,error:positionError},solRes]=await Promise.all([
        supabase.from('paper_accounts').select('cash_usd,starting_balance_usd,status').eq('user_id',uid).single(),
        supabase.from('paper_positions').select('id,token_id,quantity_tokens,cost_basis_usd,average_entry_price_usd,average_entry_mc_usd,realized_pnl_usd,accounting_version,opened_at,tokens(mint_address,ticker,name,image_url)').eq('user_id',uid).eq('status','open').order('opened_at',{ascending:false}),
        fetch('/api/market/sol',{cache:'no-store'}),
      ])
      if(accountError)throw accountError;if(positionError)throw positionError
      setAccount(a as Account);const sj=await solRes.json().catch(()=>null);if(solRes.ok)setSolUsd(Number(sj?.priceUsd||0))
      const base=(rows||[]) as unknown as DbPosition[],mints=base.map(r=>r.tokens?.mint_address).filter((m):m is string=>Boolean(m))
      let liveTokens:MarketToken[]=[]
      if(mints.length){try{const r=await fetch(`/api/market/batch?mints=${encodeURIComponent(mints.join(','))}`,{cache:'no-store'}),j=await r.json();if(r.ok)liveTokens=(j.tokens||[]) as MarketToken[]}catch{}}
      const byMint=new Map(liveTokens.map(t=>[t.mint,t]));setPositions(base.map(row=>({...row,current:row.tokens?.mint_address?byMint.get(row.tokens.mint_address):undefined})))
    }catch(e){setMessage(e instanceof Error?e.message:'PAPER account unavailable')}finally{accountBusy.current=false}
  },[supabase])

  const loadFeed=useCallback(async(force=false)=>{
    if(feedBusy.current||(!force&&typeof document!=='undefined'&&document.hidden))return
    feedBusy.current=true
    try{const r=await fetch('/api/market/latest',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Market feed unavailable');const list=(j.tokens||[]) as MarketToken[];if(list.length)setTokens(list);const requested=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('mint'):null;if(requested){const local=list.find(t=>t.mint===requested);if(local){setSelected(local);setSelectedUpdatedAt(Date.now())}else if(isMint(requested)){const tr=await fetch(`/api/market/token/${encodeURIComponent(requested)}`,{cache:'no-store'}),tj=await tr.json();if(tr.ok&&tj.token){setSelected(tj.token);setSelectedUpdatedAt(Date.now())}}}else setSelected(cur=>cur||list[0]||null)}catch(e){setMessage(e instanceof Error?e.message:'Market feed unavailable')}finally{feedBusy.current=false}
  },[])

  useEffect(()=>{if(!supabase)return;let alive=true;void(async()=>{try{const user=await ensurePaperUser(supabase);if(alive)await loadAccount(user.id,true)}catch(e){if(alive)setMessage(e instanceof Error?e.message:'Could not start PAPER account')}})();void loadFeed(true);const feedId=window.setInterval(()=>void loadFeed(),8000),acctId=window.setInterval(()=>void loadAccount(),12000),onVisible=()=>{if(!document.hidden){void loadFeed(true);void loadAccount(undefined,true)}},onAccount=()=>void loadAccount(undefined,true);document.addEventListener('visibilitychange',onVisible);window.addEventListener('paper:account-changed',onAccount);return()=>{alive=false;clearInterval(feedId);clearInterval(acctId);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('paper:account-changed',onAccount)}},[supabase,loadAccount,loadFeed])
  useEffect(()=>{const saved=Number(localStorage.getItem('paper.quickBuySize'));if(saved>0)setAmount(saved);setInstantMode(localStorage.getItem('paper.instantMode')==='1')},[])
  useEffect(()=>{if(!selected)return;const refresh=async()=>{if(document.hidden)return;try{const r=await fetch(`/api/market/token/${encodeURIComponent(selected.mint)}`,{cache:'no-store'}),j=await r.json();if(r.ok&&j.token){setSelected(cur=>cur?{...cur,...j.token,description:j.token.description||cur.description,profileUrl:j.token.profileUrl||cur.profileUrl,buyUrl:j.token.buyUrl||cur.buyUrl}:j.token);setSelectedUpdatedAt(Date.now())}}catch{}};void refresh();const id=window.setInterval(()=>void refresh(),3000);return()=>clearInterval(id)},[selected?.mint])
  useEffect(()=>{if(!supabase||!selected?.mint||!userId)return;let alive=true;void(async()=>{const key=`paper-view:${selected.mint}`;if(!sessionStorage.getItem(key)){const {error}=await supabase.from('token_view_events').insert({user_id:userId,mint_address:selected.mint});if(!error)sessionStorage.setItem(key,'1')}const {data}=await supabase.from('token_view_totals').select('views').eq('mint_address',selected.mint).maybeSingle();if(alive)setViewCount(Number(data?.views||0))})();return()=>{alive=false}},[supabase,userId,selected?.mint])

  const visible=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return tokens;return tokens.filter(t=>t.symbol.toLowerCase().includes(q)||t.name.toLowerCase().includes(q)||t.mint.toLowerCase().includes(q))},[tokens,query])
  const selectedPosition=selected?positions.find(p=>p.tokens?.mint_address===selected.mint):undefined
  const dataAgeMs=selectedUpdatedAt?Date.now()-selectedUpdatedAt:Number.MAX_SAFE_INTEGER,dataStatus=dataAgeMs<=5000?'LIVE':dataAgeMs<=10000?'DEGRADED':'STALE'
  const cash=Number(account?.cash_usd||0),nativeEquivalent=solUsd>0?cash/solUsd:0,buyUsd=amount*solUsd,estimatedFee=buyUsd*.005
  const fiveBuys=Number(selected?.buys5m||0),fiveSells=Number(selected?.sells5m||0),fiveTx=fiveBuys+fiveSells
  const description=selected?.description?.trim()|| (selected?`$${selected.symbol} is a live ${selected.dexId||'Solana'} market with ${money(selected.marketCap)} market cap, ${money(selected.liquidityUsd)} liquidity and ${money(Number(selected.volume5m||0))} of observed 5-minute volume. No verified project description was provided by the current market source.`:'')

  async function searchToken(e?:FormEvent){e?.preventDefault();const q=query.trim();if(!q)return;const local=tokens.find(t=>t.mint===q||t.symbol.toLowerCase()===q.toLowerCase());if(local){setSelected(local);setSelectedUpdatedAt(Date.now());return}if(!isMint(q)){setMessage('No exact live token match. Paste a Solana contract address for direct lookup.');return}try{const r=await fetch(`/api/market/token/${encodeURIComponent(q)}`,{cache:'no-store'}),j=await r.json();if(!r.ok||!j.token)throw new Error(j.error||'Token found, but no supported active market was detected.');setSelected(j.token);setSelectedUpdatedAt(Date.now())}catch(e2){setMessage(e2 instanceof Error?e2.message:'Token lookup failed')}}

  async function trade(){
    if(!selected||!supabase||!userId||dataStatus==='STALE')return
    setBusy(true);setMessage('');setReceipt(null)
    try{const idempotencyKey=crypto.randomUUID(),body=side==='buy'?{mint:selected.mint,side:'buy',amountSol:amount,idempotencyKey}:{mint:selected.mint,side:'sell',sellPct,idempotencyKey};const {data,error}=await supabase.functions.invoke('paper-trade',{body});if(error)throw error;if(data?.error)throw new Error(data.error);const fill=data.fill||{},market=data.market||{};setReceipt({side,symbol:selected.symbol,amountUsd:Number(fill.requestedAmountUsd||0),referencePrice:Number(market.referencePriceUsd||0),fillPrice:Number(fill.simulatedFillPriceUsd||0),impactPct:Number(fill.priceImpactPct||0),feeUsd:Number(fill.paperFeeUsd||0),quality:String(fill.executionQuality||'estimated'),ageMs:Number(market.marketDataAgeMs||0)});setMessage(`${side==='buy'?'PAPER BUY':'PAPER SELL'} FILLED`);await loadAccount(userId,true);window.dispatchEvent(new Event('paper:account-changed'))}catch(e){setMessage(e instanceof Error?e.message:'PAPER order rejected')}finally{setBusy(false)}
  }

  function toggleInstant(){if(!instantMode&&!window.confirm('Instant Mode submits PAPER orders immediately using your selected preset. PAPER only — no real trade is submitted.'))return;const next=!instantMode;setInstantMode(next);localStorage.setItem('paper.instantMode',next?'1':'0')}
  async function copyMint(){if(!selected)return;try{await navigator.clipboard.writeText(selected.mint);setCopied(true);setTimeout(()=>setCopied(false),1000)}catch{}}

  return <div className="ax-app"><AppHeader active="spot"/><main className="spot-detail phase1-terminal">
    <aside className="spot-token-list"><form className="spot-search" onSubmit={searchToken}><Search size={13}/><input placeholder="Ticker, name or CA" value={query} onChange={e=>setQuery(e.target.value)}/><button type="submit">Go</button></form><div className="spot-list-head">LIVE MEMECOINS <span>{visible.length}</span></div><div className="token-list">{visible.map(t=><button key={t.mint} className={`token-row ${selected?.mint===t.mint?'selected':''}`} onClick={()=>{setSelected(t);setSelectedUpdatedAt(Date.now())}}><div className="token-avatar">{t.image?<img src={t.image} alt="" loading="lazy"/>:t.symbol.slice(0,2)}</div><div className="token-copy"><div className="token-line"><b>${t.symbol}</b><span>{t.name}</span></div><div className="token-sub">MC {money(t.marketCap)} · LQ {money(t.liquidityUsd)}</div></div><div className="token-price"><b>{money(t.priceUsd)}</b><span className={t.priceChange24h>=0?'gain':'loss'}>{pct(t.priceChange24h)}</span></div></button>)}</div></aside>

    <section className="spot-market"><div className="token-head">{selected?<><div className="token-avatar large">{selected.image?<img src={selected.image} alt=""/>:selected.symbol.slice(0,2)}</div><div><div className="token-title">${selected.symbol}<span>{selected.name}</span></div><div className="token-link-row"><button className="mint-button" onClick={()=>void copyMint()}>{copied?'Copied':short(selected.mint)} ⧉</button>{selected.website&&<a href={selected.website} target="_blank" rel="noreferrer">Web <ExternalLink size={10}/></a>}{selected.twitter&&<a href={selected.twitter} target="_blank" rel="noreferrer">X <ExternalLink size={10}/></a>}</div></div><div className="spacer"/><div className="headline-stat"><small>VIEWS</small><b className="view-stat"><Eye size={12}/>{viewCount.toLocaleString()}</b></div><div className="headline-stat"><small>PRICE</small><b>{money(selected.priceUsd)}</b></div><div className="headline-stat"><small>5M</small><b className={Number(selected.priceChange5m||0)>=0?'gain':'loss'}>{pct(Number(selected.priceChange5m||0))}</b></div><div className="headline-stat"><small>MC</small><b>{money(selected.marketCap)}</b></div><span className={`data-health ${dataStatus.toLowerCase()}`}>{dataStatus}</span></>:<span>Select a live memecoin</span>}</div>
      <CandleChart poolAddress={selected?.pairAddress} currentPrice={selected?.priceUsd}/>
      <div className="metric-strip">{[['Market Cap',selected?money(selected.marketCap):'—'],['Liquidity',selected?money(selected.liquidityUsd):'—'],['5m Volume',selected?money(Number(selected.volume5m||0)):'—'],['5m Buys',selected?String(fiveBuys):'—'],['5m Sells',selected?String(fiveSells):'—']].map(([l,v])=><div className="metric" key={l}><small>{l}</small><b>{v}</b></div>)}</div>
      <div className="detail-data-grid"><MarketTape poolAddress={selected?.pairAddress}/><div className="positions-panel"><div className="positions-title"><span>OPEN PAPER POSITIONS</span><span>{money(cash)} available</span></div><div className="pos-head"><span>Token</span><span>Cost</span><span>Entry MC</span><span>Current MC</span><span>PAPER ROI</span></div>{!positions.length?<div className="loading">No open PAPER positions yet.</div>:positions.map(p=>{const current=p.current?.priceUsd||Number(p.average_entry_price_usd),roi=(current/Number(p.average_entry_price_usd)-1)*100;return <button className="pos-row" key={p.id} onClick={()=>{const token=tokens.find(t=>t.mint===p.tokens?.mint_address);if(token)setSelected(token)}}><b>${p.tokens?.ticker||'MEME'}</b><span>{money(Number(p.cost_basis_usd||0))}</span><span>{money(Number(p.average_entry_mc_usd||0))}</span><span>{money(p.current?.marketCap||0)}</span><span className={roi>=0?'gain':'loss'}>{pct(roi)}</span></button>})}</div></div>
      {selected&&<section className="coin-intel-card"><div className="coin-intel-title"><Info size={15}/><div><b>WHAT IS ${selected.symbol}?</b><small>Available project metadata + observed market context</small></div></div><p>{description}</p><div className="coin-intel-actions">{selected.website&&<a href={selected.website} target="_blank" rel="noreferrer">PROJECT SITE <ExternalLink size={12}/></a>}{(selected.buyUrl||selected.pairUrl)&&<a className="real-market-link" href={selected.buyUrl||selected.pairUrl} target="_blank" rel="noreferrer">OPEN REAL MARKET <ExternalLink size={12}/></a>}</div><div className="real-market-warning"><ShieldCheck size={13}/> External market link — leaving PAPER may involve real funds.</div></section>}
      <div className="impact-mini"><Info size={16}/><div><b>Planned charity matching</b><span>PAPER intends to match eligible funded community giveaways dollar-for-dollar with verified charitable donations. No donation is claimed until it is completed and proof is published.</span></div><Link href="/coin">Program info →</Link></div>
    </section>

    <aside className="spot-trade-panel axiom-paper-trade"><div className="trade-stats-top"><span><small>5m Vol</small><b>{selected?money(Number(selected.volume5m||0)):'—'}</b></span><span><small>Buys</small><b className="gain">{fiveBuys}</b></span><span><small>Sells</small><b className="loss">{fiveSells}</b></span><span><small>TXNS</small><b>{fiveTx}</b></span></div><div className="panel-body"><div className="side-switch"><button className={side==='buy'?'buy':''} onClick={()=>setSide('buy')}>Buy</button><button className={side==='sell'?'sell':''} onClick={()=>setSide('sell')}>Sell</button></div><div className="trade-mode-row"><b>Market</b><button className={`instant-toggle ${instantMode?'on':''}`} onClick={toggleInstant}><Zap size={12}/> Instant {instantMode?'ON':'OFF'}</button><span>{money(cash)} PAPER</span></div>
      {side==='buy'?<><label>AMOUNT <span>{solUsd?`≈ ${money(buyUsd)} PAPER`:''}</span></label><div className="amount-with-symbol"><input className="amount" type="number" min=".01" value={amount} onChange={e=>setAmount(Math.max(.01,Number(e.target.value)||.01))}/><b>≋ SOL</b></div><div className="preset-grid">{[.01,.1,1,10].map(v=><button key={v} className={`preset ${amount===v?'selected':''}`} onClick={()=>setAmount(v)}>{v}</button>)}</div><div className="trade-estimate-row"><span>Buying power <b>{money(cash)}</b></span><span>Fee <b>{money(estimatedFee)}</b></span><span>Data <b className={dataStatus==='LIVE'?'gain':dataStatus==='STALE'?'loss':''}>{dataStatus}</b></span></div></>:<><label>SELL POSITION <span>{selectedPosition?`${Number(selectedPosition.quantity_tokens).toLocaleString()} tokens`:'No position'}</span></label><div className="preset-grid sell-presets">{[10,25,50,100].map(v=><button key={v} className={`preset ${sellPct===v?'selected':''}`} onClick={()=>setSellPct(v)}>{v}%</button>)}</div>{selectedPosition&&<div className="trade-estimate-row"><span>Cost basis <b>{money(Number(selectedPosition.cost_basis_usd||0))}</b></span><span>Entry <b>{money(Number(selectedPosition.average_entry_price_usd))}</b></span></div>}</>}
      <button className={`paper-buy ${side==='sell'?'paper-sell':''}`} disabled={busy||!selected||dataStatus==='STALE'||(side==='sell'&&!selectedPosition)} onClick={()=>void trade()}>{busy?'VERIFYING LIVE MARKET…':`${side==='buy'?'Buy':'Sell'} ${selected?`$${selected.symbol}`:'token'} · PAPER`}</button>
      <div className="paper-only-note">PAPER only — no real trade is submitted.</div>{dataStatus==='STALE'&&<div className="trade-message loss">Live pricing is stale. New PAPER orders are temporarily paused.</div>}{message&&<div className="trade-message">{message}</div>}
      {receipt&&<div className="fill-receipt"><div className="fill-receipt-head"><b>PAPER {receipt.side.toUpperCase()} FILLED</b><span>{receipt.quality.toUpperCase()}</span></div><dl><div><dt>Amount</dt><dd>{money(receipt.amountUsd)}</dd></div><div><dt>Reference</dt><dd>{money(receipt.referencePrice)}</dd></div><div><dt>Simulated fill</dt><dd>{money(receipt.fillPrice)}</dd></div><div><dt>Impact</dt><dd>{receipt.impactPct.toFixed(2)}%</dd></div><div><dt>PAPER fee</dt><dd>{money(receipt.feeUsd)}</dd></div><div><dt>Data age</dt><dd>{(receipt.ageMs/1000).toFixed(2)}s</dd></div></dl><small>Simulated fills are based on available market data and may differ from actual on-chain execution.</small></div>}
      <div className="trade-account-footer"><span><small>PAPER cash</small><b>{money(cash)}</b></span><span><small>SOL equivalent</small><b>{solUsd?`${nativeEquivalent.toFixed(3)} SOL`:'—'}</b></span><span><small>Open positions</small><b>{positions.length}</b></span></div>
    </div></aside>
  </main><BottomDock active="spot"/></div>
}
