'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, ExternalLink } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import CandleChart from '@/components/CandleChart'
import MarketTape from '@/components/MarketTape'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

type DbPosition={id:string;token_id:string;quantity_tokens:number;cost_basis_sol:number;average_entry_price_usd:number;average_entry_mc_usd:number|null;realized_pnl_sol:number;opened_at:string;tokens:{mint_address:string;ticker:string|null;name:string|null;image_url:string|null}|null}
type LivePosition=DbPosition&{current?:MarketToken}
const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(n<1?6:2)}`
const pct=(n:number)=>`${n>=0?'+':''}${n.toFixed(2)}%`
const short=(s:string)=>s.length>11?`${s.slice(0,5)}…${s.slice(-4)}`:s

export default function Terminal(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [tokens,setTokens]=useState<MarketToken[]>([])
  const [selected,setSelected]=useState<MarketToken|null>(null)
  const [positions,setPositions]=useState<LivePosition[]>([])
  const [paperCash,setPaperCash]=useState(1000)
  const [userId,setUserId]=useState('')
  const [viewCount,setViewCount]=useState(0)
  const [query,setQuery]=useState('')
  const [side,setSide]=useState<'buy'|'sell'>('buy')
  const [amount,setAmount]=useState(1)
  const [sellPct,setSellPct]=useState(100)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [copied,setCopied]=useState(false)
  const feedBusy=useRef(false)
  const accountBusy=useRef(false)

  const loadAccount=useCallback(async(id?:string,force=false)=>{
    if(!supabase||accountBusy.current||(!force&&typeof document!=='undefined'&&document.hidden))return
    accountBusy.current=true
    try{
      const uid=id||(await supabase.auth.getUser()).data.user?.id
      if(!uid)return
      setUserId(uid)
      const [{data:p,error:profileError},{data:rows,error:positionError}]=await Promise.all([
        supabase.from('profiles').select('paper_cash_sol').eq('id',uid).single(),
        supabase.from('paper_positions').select('id,token_id,quantity_tokens,cost_basis_sol,average_entry_price_usd,average_entry_mc_usd,realized_pnl_sol,opened_at,tokens(mint_address,ticker,name,image_url)').eq('user_id',uid).eq('status','open').order('opened_at',{ascending:false}),
      ])
      if(profileError)throw profileError
      if(positionError)throw positionError
      if(p)setPaperCash(Number(p.paper_cash_sol))
      const base=(rows||[]) as unknown as DbPosition[]
      const mints=base.map(r=>r.tokens?.mint_address).filter((m):m is string=>Boolean(m))
      let liveTokens:MarketToken[]=[]
      if(mints.length){try{const r=await fetch(`/api/market/batch?mints=${encodeURIComponent(mints.join(','))}`,{cache:'no-store'});const j=await r.json();if(r.ok)liveTokens=(j.tokens||[]) as MarketToken[]}catch{}}
      const byMint=new Map(liveTokens.map(t=>[t.mint,t]))
      setPositions(base.map(row=>({...row,current:row.tokens?.mint_address?byMint.get(row.tokens.mint_address):undefined})))
    }catch(e){setMessage(e instanceof Error?e.message:'PAPER account unavailable')}
    finally{accountBusy.current=false}
  },[supabase])

  const loadFeed=useCallback(async(force=false)=>{
    if(feedBusy.current||(!force&&typeof document!=='undefined'&&document.hidden))return
    feedBusy.current=true
    try{
      const r=await fetch('/api/market/latest',{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Market feed unavailable')
      const list=(j.tokens||[]) as MarketToken[]
      if(list.length)setTokens(list)
      const requested=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('mint'):null
      setSelected(cur=>cur||list.find(t=>t.mint===requested)||list[0]||null)
    }catch(e){setMessage(e instanceof Error?e.message:'Market feed unavailable')}
    finally{feedBusy.current=false}
  },[])

  useEffect(()=>{
    if(!supabase)return
    let alive=true
    void(async()=>{try{const user=await ensurePaperUser(supabase);if(alive)await loadAccount(user.id,true)}catch(e){if(alive)setMessage(e instanceof Error?e.message:'Could not start PAPER account')}})()
    void loadFeed(true)
    const feedId=window.setInterval(()=>void loadFeed(),12_000),acctId=window.setInterval(()=>void loadAccount(),12_000)
    const onVisible=()=>{if(!document.hidden){void loadFeed(true);void loadAccount(undefined,true)}}
    const onAccount=()=>void loadAccount(undefined,true)
    document.addEventListener('visibilitychange',onVisible);window.addEventListener('paper:account-changed',onAccount)
    return()=>{alive=false;window.clearInterval(feedId);window.clearInterval(acctId);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('paper:account-changed',onAccount)}
  },[supabase,loadAccount,loadFeed])

  useEffect(()=>{const saved=Number(window.localStorage.getItem('paper.quickBuySize'));if(Number.isFinite(saved)&&saved>0)setAmount(saved);const handler=(event:Event)=>{const detail=(event as CustomEvent<{value:number}>).detail;if(detail?.value)setAmount(detail.value)};window.addEventListener('paper:preset',handler);return()=>window.removeEventListener('paper:preset',handler)},[])

  useEffect(()=>{
    if(!selected)return
    const refresh=async()=>{if(document.hidden)return;try{const r=await fetch(`/api/market/token/${encodeURIComponent(selected.mint)}`,{cache:'no-store'});const j=await r.json();if(r.ok&&j.token)setSelected(j.token)}catch{}}
    const id=window.setInterval(()=>void refresh(),6_000)
    return()=>window.clearInterval(id)
  },[selected?.mint])

  useEffect(()=>{
    if(!supabase||!selected?.mint||!userId)return
    let alive=true
    const track=async()=>{
      const key=`paper-view:${selected.mint}`
      if(!sessionStorage.getItem(key)){
        const {error}=await supabase.from('token_view_events').insert({user_id:userId,mint_address:selected.mint})
        if(!error)sessionStorage.setItem(key,'1')
      }
      const {data}=await supabase.from('token_view_totals').select('views').eq('mint_address',selected.mint).maybeSingle()
      if(alive)setViewCount(Number(data?.views||0))
    }
    void track();return()=>{alive=false}
  },[supabase,userId,selected?.mint])

  const visible=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return tokens;return tokens.filter(t=>t.symbol.toLowerCase().includes(q)||t.name.toLowerCase().includes(q)||t.mint.toLowerCase().includes(q))},[tokens,query])
  const selectedPosition=selected?positions.find(p=>p.tokens?.mint_address===selected.mint):undefined

  async function trade(){
    if(!selected||!supabase||!userId)return
    setBusy(true);setMessage('')
    try{
      const body=side==='buy'?{mint:selected.mint,side:'buy',amountSol:amount}:{mint:selected.mint,side:'sell',sellPct}
      const {data,error}=await supabase.functions.invoke('paper-trade',{body})
      if(error)throw error;if(data?.error)throw new Error(data.error)
      setMessage(`${side==='buy'?'PAPER BUY':'PAPER SELL'} filled · impact ${Number(data.fill?.priceImpactPct||0).toFixed(2)}% · fee ${Number(data.fill?.feeSol||0).toFixed(4)} PAPER SOL`)
      await loadAccount(userId,true);window.dispatchEvent(new Event('paper:account-changed'))
    }catch(e){setMessage(e instanceof Error?e.message:'PAPER order rejected')}finally{setBusy(false)}
  }

  async function copyMint(){if(!selected)return;try{await navigator.clipboard.writeText(selected.mint);setCopied(true);setTimeout(()=>setCopied(false),1000)}catch{}}

  return <div className="ax-app">
    <AppHeader active="spot"/>
    <main className="spot-detail">
      <aside className="spot-token-list"><div className="spot-search"><input placeholder="Search ticker, name or mint" value={query} onChange={e=>setQuery(e.target.value)}/><button onClick={()=>void loadFeed(true)}>↻</button></div><div className="spot-list-head">LIVE MEMECOINS <span>{visible.length}</span></div><div className="token-list">{visible.map(t=><button key={t.mint} className={`token-row ${selected?.mint===t.mint?'selected':''}`} onClick={()=>setSelected(t)}><div className="token-avatar">{t.image?<img src={t.image} alt="" loading="lazy"/>:t.symbol.slice(0,2)}</div><div className="token-copy"><div className="token-line"><b>${t.symbol}</b><span>{t.name}</span></div><div className="token-sub">MC {money(t.marketCap)} · LQ {money(t.liquidityUsd)}</div></div><div className="token-price"><b>{money(t.priceUsd)}</b><span className={t.priceChange24h>=0?'gain':'loss'}>{pct(t.priceChange24h)}</span></div></button>)}</div></aside>
      <section className="spot-market">
        <div className="token-head">{selected?<><div className="token-avatar large">{selected.image?<img src={selected.image} alt=""/>:selected.symbol.slice(0,2)}</div><div><div className="token-title">${selected.symbol}<span>{selected.name}</span></div><div className="token-link-row"><button className="mint-button" onClick={()=>void copyMint()}>{copied?'Copied':short(selected.mint)} ⧉</button>{selected.website&&<a href={selected.website} target="_blank" rel="noreferrer">Web <ExternalLink size={10}/></a>}{selected.twitter&&<a href={selected.twitter} target="_blank" rel="noreferrer">X <ExternalLink size={10}/></a>}</div></div><div className="spacer"/><div className="headline-stat"><small>VIEWS</small><b className="view-stat"><Eye size={12}/>{viewCount.toLocaleString()}</b></div><div className="headline-stat"><small>PRICE</small><b>{money(selected.priceUsd)}</b></div><div className="headline-stat"><small>24H</small><b className={selected.priceChange24h>=0?'gain':'loss'}>{pct(selected.priceChange24h)}</b></div><div className="headline-stat"><small>MC</small><b>{money(selected.marketCap)}</b></div></>:<span>Select a live memecoin</span>}</div>
        <CandleChart poolAddress={selected?.pairAddress} currentPrice={selected?.priceUsd}/>
        <div className="metric-strip">{[['Market Cap',selected?money(selected.marketCap):'—'],['Liquidity',selected?money(selected.liquidityUsd):'—'],['24H Volume',selected?money(selected.volume24h):'—'],['24H Buys',selected?String(selected.buys24h):'—'],['24H Sells',selected?String(selected.sells24h):'—']].map(([l,v])=><div className="metric" key={l}><small>{l}</small><b>{v}</b></div>)}</div>
        <div className="detail-data-grid">
          <div className="positions-panel"><div className="positions-title"><span>OPEN PAPER POSITIONS</span><span>{paperCash.toFixed(2)} PAPER SOL balance</span></div><div className="pos-head"><span>Token</span><span>Cost</span><span>Entry MC</span><span>Current MC</span><span>PAPER ROI</span></div>{positions.length===0?<div className="loading">No open PAPER positions yet.</div>:positions.map(p=>{const current=p.current?.priceUsd||Number(p.average_entry_price_usd);const roi=(current/Number(p.average_entry_price_usd)-1)*100;return <button className="pos-row" key={p.id} onClick={()=>{const token=tokens.find(t=>t.mint===p.tokens?.mint_address);if(token)setSelected(token)}}><b>${p.tokens?.ticker||'MEME'}</b><span>{Number(p.cost_basis_sol).toFixed(3)} PAPER SOL</span><span>{money(Number(p.average_entry_mc_usd||0))}</span><span>{money(p.current?.marketCap||0)}</span><span className={roi>=0?'gain':'loss'}>{pct(roi)}</span></button>})}</div>
          <MarketTape poolAddress={selected?.pairAddress}/>
        </div>
      </section>
      <aside className="spot-trade-panel"><div className="panel-title">INSTANT PAPER TRADE</div><div className="panel-body"><div className="side-switch"><button className={side==='buy'?'buy':''} onClick={()=>setSide('buy')}>BUY PAPER</button><button className={side==='sell'?'sell':''} onClick={()=>setSide('sell')}>SELL PAPER</button></div>{side==='buy'?<><label>SIZE · PAPER SOL</label><input className="amount" type="number" min=".01" value={amount} onChange={e=>setAmount(Math.max(.01,Number(e.target.value)||.01))}/><div className="preset-grid">{[.1,.5,1,5].map(v=><button key={v} className={`preset ${amount===v?'selected':''}`} onClick={()=>setAmount(v)}>{v}</button>)}</div></>:<><label>SELL POSITION</label><div className="preset-grid">{[25,50,75,100].map(v=><button key={v} className={`preset ${sellPct===v?'selected':''}`} onClick={()=>setSellPct(v)}>{v}%</button>)}</div>{!selectedPosition&&<div className="disclaimer">No open PAPER position in this token.</div>}</>}<button className="paper-buy" disabled={busy||!selected||(side==='sell'&&!selectedPosition)} onClick={()=>void trade()}>{busy?'VERIFYING LIVE MARKET…':`${side==='buy'?'PAPER BUY':'PAPER SELL'} ${selected?`$${selected.symbol}`:'TOKEN'}`}</button>{message&&<div className="disclaimer trade-message">{message}</div>}<div className="disclaimer"><b>PAPER ONLY</b><br/>No real trade is submitted. Fills use current market price, liquidity-aware impact and simulated fees.</div></div></aside>
    </main>
    <BottomDock active="spot"/>
  </div>
}
