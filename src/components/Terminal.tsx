'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import CandleChart from '@/components/CandleChart'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

type DbPosition = {
  id: string
  token_id: string
  quantity_tokens: number
  cost_basis_sol: number
  average_entry_price_usd: number
  average_entry_mc_usd: number | null
  realized_pnl_sol: number
  opened_at: string
  tokens: { mint_address: string; ticker: string | null; name: string | null; image_url: string | null } | null
}

type LivePosition = DbPosition & { current?: MarketToken }
type PulseMode = 'new' | 'trending' | 'final' | 'migrated'
type ProfileMini = { username: string | null; display_name: string | null; avatar_emoji: string | null; accent: string | null }

const money = (n:number) => !Number.isFinite(n) ? '—' : n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(n < 1 ? 6 : 2)}`
const pct = (n:number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
const short = (s:string) => s.length > 11 ? `${s.slice(0,5)}…${s.slice(-4)}` : s
const age = (ms?:number) => {
  if(!ms)return '—'
  const d=Math.max(0,Date.now()-ms), m=Math.floor(d/60000)
  if(m<1)return '<1m'
  if(m<60)return `${m}m`
  const h=Math.floor(m/60)
  if(h<24)return `${h}h`
  return `${Math.floor(h/24)}d`
}

export default function Terminal() {
  const [tokens,setTokens]=useState<MarketToken[]>([])
  const [selected,setSelected]=useState<MarketToken|null>(null)
  const [mode,setMode]=useState<PulseMode>('new')
  const [amount,setAmount]=useState(1)
  const [sellPct,setSellPct]=useState(100)
  const [side,setSide]=useState<'buy'|'sell'>('buy')
  const [positions,setPositions]=useState<LivePosition[]>([])
  const [paperCash,setPaperCash]=useState<number|null>(null)
  const [userId,setUserId]=useState('')
  const [profile,setProfile]=useState<ProfileMini|null>(null)
  const [solUsd,setSolUsd]=useState(0)
  const [busy,setBusy]=useState(false)
  const [accountBusy,setAccountBusy]=useState(true)
  const [accountError,setAccountError]=useState('')
  const [error,setError]=useState('')
  const [query,setQuery]=useState('')
  const [quote,setQuote]=useState('')
  const [copied,setCopied]=useState(false)

  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])

  const loadAccount=useCallback(async(id?:string)=>{
    if(!supabase)return
    let uid=id
    if(!uid){
      const {data:{user}}=await supabase.auth.getUser()
      uid=user?.id
    }
    if(!uid)return
    setUserId(uid)
    const [{data:profileRow},{data:dbPositions}]=await Promise.all([
      supabase.from('profiles').select('paper_cash_sol,username,display_name,avatar_emoji,accent').eq('id',uid).single(),
      supabase.from('paper_positions')
        .select('id,token_id,quantity_tokens,cost_basis_sol,average_entry_price_usd,average_entry_mc_usd,realized_pnl_sol,opened_at,tokens(mint_address,ticker,name,image_url)')
        .eq('user_id',uid).eq('status','open').order('opened_at',{ascending:false}),
    ])
    if(profileRow){
      setPaperCash(Number(profileRow.paper_cash_sol))
      setProfile(profileRow as ProfileMini)
    }
    const base=(dbPositions||[]) as unknown as DbPosition[]
    const live=await Promise.all(base.map(async p=>{
      const mint=p.tokens?.mint_address
      if(!mint)return p
      try{
        const r=await fetch(`/api/market/token/${mint}`,{cache:'no-store'})
        if(!r.ok)return p
        const j=await r.json()
        return {...p,current:j.token as MarketToken}
      }catch{return p}
    }))
    setPositions(live)
  },[supabase])

  const bootstrapAccount=useCallback(async()=>{
    if(!supabase){setAccountError('PAPER account service is not configured.');setAccountBusy(false);return}
    try{
      setAccountBusy(true)
      const user=await ensurePaperUser(supabase)
      await loadAccount(user.id)
      setAccountError('')
    }catch(e){
      setAccountError(e instanceof Error?e.message:'Could not start PAPER account')
    }finally{setAccountBusy(false)}
  },[supabase,loadAccount])

  async function refreshFeed(){
    try{
      const r=await fetch('/api/market/latest',{cache:'no-store'})
      const j=await r.json()
      if(!r.ok)throw new Error(j.error||'feed unavailable')
      const next=(j.tokens||[]) as MarketToken[]
      setTokens(next)
      setError('')
      setSelected(cur=>cur?(next.find(t=>t.mint===cur.mint)||cur):(next[0]||null))
    }catch(e){setError(e instanceof Error?e.message:'feed unavailable')}
  }

  useEffect(()=>{
    void bootstrapAccount()
    void refreshFeed()
    const feedId=setInterval(refreshFeed,10000)
    const accountId=setInterval(()=>{void loadAccount()},15000)
    return()=>{clearInterval(feedId);clearInterval(accountId)}
  },[bootstrapAccount,loadAccount])

  useEffect(()=>{
    let alive=true
    async function getSol(){
      try{
        const r=await fetch('/api/market/token/So11111111111111111111111111111111111111112',{cache:'no-store'})
        if(!r.ok)return
        const j=await r.json()
        if(alive&&j.token?.priceUsd)setSolUsd(Number(j.token.priceUsd))
      }catch{}
    }
    void getSol(); const id=setInterval(getSol,30000)
    return()=>{alive=false;clearInterval(id)}
  },[])

  useEffect(()=>{
    if(!selected)return
    const id=setInterval(async()=>{
      try{
        const r=await fetch(`/api/market/token/${selected.mint}`,{cache:'no-store'})
        if(!r.ok)return
        const j=await r.json()
        if(j.token)setSelected(j.token)
      }catch{}
    },3000)
    return()=>clearInterval(id)
  },[selected?.mint])

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase()
    let list=tokens.filter(t=>!q||t.symbol.toLowerCase().includes(q)||t.name.toLowerCase().includes(q)||t.mint.toLowerCase().includes(q))
    if(mode==='new')list=[...list].sort((a,b)=>(b.pairCreatedAt||0)-(a.pairCreatedAt||0))
    if(mode==='trending')list=[...list].sort((a,b)=>((b.volume24h)+(b.buys24h+b.sells24h)*100+Math.abs(b.priceChange24h)*500)-((a.volume24h)+(a.buys24h+a.sells24h)*100+Math.abs(a.priceChange24h)*500))
    if(mode==='final'){
      const pump=list.filter(t=>(t.dexId||'').toLowerCase().includes('pump')&&t.marketCap>0&&t.marketCap<500000)
      list=(pump.length?pump:list.filter(t=>t.marketCap>0&&t.marketCap<250000)).sort((a,b)=>b.marketCap-a.marketCap)
    }
    if(mode==='migrated'){
      const migrated=list.filter(t=>/(pumpswap|raydium|meteora)/i.test(t.dexId||''))
      list=(migrated.length?migrated:list.filter(t=>t.liquidityUsd>20000)).sort((a,b)=>b.volume24h-a.volume24h)
    }
    return list
  },[tokens,query,mode])

  async function executePaperTrade(){
    if(!selected||!supabase)return
    if(!userId){setQuote('Your PAPER wallet is still starting.');return}
    setBusy(true);setQuote('')
    try{
      const payload=side==='buy'?{mint:selected.mint,side:'buy',amountSol:amount}:{mint:selected.mint,side:'sell',sellPct}
      const {data,error:fnError}=await supabase.functions.invoke('paper-trade',{body:payload})
      if(fnError)throw fnError
      if(data?.error)throw new Error(data.error)
      const impact=Number(data?.fill?.priceImpactPct||0)
      const fillMc=Number(data?.fill?.simulatedFillMcUsd||0)
      const fee=Number(data?.fill?.feeSol||0)
      setQuote(`${side==='buy'?'PAPER BUY':'PAPER SELL'} FILLED · impact ${impact.toFixed(2)}% · fill MC ${money(fillMc)} · fee ${fee.toFixed(4)} PAPER SOL`)
      await loadAccount(userId)
    }catch(e){setQuote(e instanceof Error?e.message:'PAPER order rejected')}
    finally{setBusy(false)}
  }

  async function copyMint(){
    if(!selected)return
    try{await navigator.clipboard.writeText(selected.mint);setCopied(true);setTimeout(()=>setCopied(false),1200)}catch{}
  }

  const selectedPosition=selected?positions.find(p=>p.tokens?.mint_address===selected.mint):undefined
  const portfolioSol=useMemo(()=>{
    const cash=paperCash??0
    const open=positions.reduce((sum,p)=>{
      if(p.current&&solUsd>0)return sum+(Number(p.quantity_tokens)*p.current.priceUsd/solUsd)
      return sum+Number(p.cost_basis_sol)
    },0)
    return cash+open
  },[paperCash,positions,solUsd])
  const totalPnl=portfolioSol-1000

  return <div className="shell" id="terminal">
    <header className="topbar">
      <Link href="/" className="brand">PAPER<span>.FUN</span></Link>
      <span className="paper-pill">SIMULATED</span>
      <nav className="nav">
        <a className="active" href="#terminal">Terminal</a>
        <a href="#pulse">Pulse</a>
        <Link href="/leaderboards">Leaderboard</Link>
        <Link href="/profile">Profile</Link>
      </nav>
      <div className="spacer"/>
      <input className="search" placeholder="Search ticker, name or mint" value={query} onChange={e=>setQuery(e.target.value)}/>
      <button className="icon-button" onClick={()=>void refreshFeed()} title="Refresh live market">↻</button>
      <div className="paper-wallet">
        <small>PAPER WALLET</small>
        <b>{paperCash==null?'—':`${paperCash.toFixed(2)} SOL`}</b>
      </div>
      <Link className={`profile-chip accent-${profile?.accent||'violet'}`} href="/profile"><span>{profile?.avatar_emoji||'🪙'}</span>{profile?.display_name||profile?.username||'Paper Trader'}</Link>
    </header>

    {accountError&&<div className="account-banner">PAPER account setup needs one project setting: {accountError}</div>}

    <main className="terminal-grid">
      <aside className="pulse" id="pulse">
        <div className="panel-title"><div><span className="live-dot"/>PULSE</div><span>{visible.length} tokens</span></div>
        <div className="pulse-tabs">
          <button className={mode==='new'?'active':''} onClick={()=>setMode('new')}>New Creations</button>
          <button className={mode==='trending'?'active':''} onClick={()=>setMode('trending')}>Trending</button>
          <button className={mode==='final'?'active':''} onClick={()=>setMode('final')}>Final Stretch</button>
          <button className={mode==='migrated'?'active':''} onClick={()=>setMode('migrated')}>Migrated</button>
        </div>
        {error&&<div className="feed-error">{error}</div>}
        <div className="token-list">
          {!tokens.length&&!error&&<div className="loading">Loading live Solana memecoins…</div>}
          {visible.map(t=><button key={t.mint} className={`token-row ${selected?.mint===t.mint?'selected':''}`} onClick={()=>setSelected(t)}>
            <div className="token-avatar">{t.image?<img src={t.image} alt=""/>:t.symbol.slice(0,2)}</div>
            <div className="token-copy">
              <div className="token-line"><b>${t.symbol}</b><span>{age(t.pairCreatedAt)}</span></div>
              <div className="token-sub">MC {money(t.marketCap)} · LQ {money(t.liquidityUsd)}</div>
              <div className="token-sub muted">{t.dexId||'Solana'} · Vol {money(t.volume24h)}</div>
            </div>
            <div className="token-price"><b>{money(t.priceUsd)}</b><span className={t.priceChange24h>=0?'gain':'loss'}>{pct(t.priceChange24h)}</span></div>
          </button>)}
          {!!tokens.length&&!visible.length&&<div className="loading">No tokens match this Pulse filter yet.</div>}
        </div>
        <div className="pulse-note">Final Stretch and Migrated use live public market signals until direct Pump.fun/Helius ingestion is connected.</div>
      </aside>

      <section className="market-center">
        <div className="token-head">
          {selected?<>
            <div className="token-avatar large">{selected.image?<img src={selected.image} alt=""/>:selected.symbol.slice(0,2)}</div>
            <div><div className="token-title">${selected.symbol}<span>{selected.name}</span></div><button className="mint-button" onClick={copyMint}>{copied?'Copied':short(selected.mint)} ⧉</button></div>
            <div className="spacer"/>
            <div className="headline-stat"><small>PRICE</small><b>{money(selected.priceUsd)}</b></div>
            <div className="headline-stat"><small>24H</small><b className={selected.priceChange24h>=0?'gain':'loss'}>{pct(selected.priceChange24h)}</b></div>
            <div className="headline-stat"><small>MC</small><b>{money(selected.marketCap)}</b></div>
          </>:<span>Select a live memecoin</span>}
        </div>

        <CandleChart poolAddress={selected?.pairAddress} currentPrice={selected?.priceUsd}/>

        <div className="metric-strip">
          {[
            ['Market Cap',selected?money(selected.marketCap):'—'],
            ['Liquidity',selected?money(selected.liquidityUsd):'—'],
            ['24H Volume',selected?money(selected.volume24h):'—'],
            ['Buys',selected?selected.buys24h.toLocaleString():'—'],
            ['Sells',selected?selected.sells24h.toLocaleString():'—'],
            ['Age',selected?age(selected.pairCreatedAt):'—'],
          ].map(([l,v])=><div className="metric" key={l}><small>{l}</small><b>{v}</b></div>)}
        </div>

        <div className="positions-panel">
          <div className="positions-title"><span>OPEN PAPER POSITIONS</span><span className={totalPnl>=0?'gain':'loss'}>{totalPnl>=0?'+':''}{totalPnl.toFixed(2)} PAPER SOL total</span></div>
          <div className="pos-head"><span>Token</span><span>Cost</span><span>Entry MC</span><span>Current MC</span><span>PAPER ROI</span></div>
          {accountBusy?<div className="loading">Creating your 1,000 PAPER SOL wallet…</div>:positions.length===0?<div className="loading">No open PAPER positions. Pick a live memecoin and place a PAPER trade.</div>:positions.map(p=>{
            const currentPrice=p.current?.priceUsd||Number(p.average_entry_price_usd)
            const roi=(currentPrice/Number(p.average_entry_price_usd)-1)*100
            return <button className="pos-row" key={p.id} onClick={()=>p.current&&setSelected(p.current)}>
              <b>${p.tokens?.ticker||'MEME'}</b><span>{Number(p.cost_basis_sol).toFixed(3)} SOL</span><span>{money(Number(p.average_entry_mc_usd||0))}</span><span>{money(p.current?.marketCap||0)}</span><strong className={roi>=0?'gain':'loss'}>{pct(roi)} PAPER</strong>
            </button>
          })}
        </div>
      </section>

      <aside className="trade-panel">
        <div className="panel-title"><div>INSTANT PAPER TRADE</div><span>REAL MARKET</span></div>
        <div className="panel-body">
          <div className="account-card"><small>PORTFOLIO VALUE</small><strong>{portfolioSol.toFixed(2)} PAPER SOL</strong><span className={totalPnl>=0?'gain':'loss'}>{totalPnl>=0?'+':''}{totalPnl.toFixed(2)} since start</span></div>
          <div className="side-switch"><button className={side==='buy'?'buy':''} onClick={()=>setSide('buy')}>BUY</button><button className={side==='sell'?'sell':''} onClick={()=>setSide('sell')}>SELL</button></div>
          {side==='buy'?<>
            <label className="field-label">SIZE · PAPER SOL</label>
            <input className="amount" type="number" min="0.001" value={amount} onChange={e=>setAmount(Math.max(.001,Number(e.target.value)||0))}/>
            <div className="preset-grid">{[.1,.5,1,5,10,25].map(n=><button key={n} className={amount===n?'preset selected':'preset'} onClick={()=>setAmount(n)}>{n}</button>)}</div>
          </>:<>
            <label className="field-label">SELL PAPER POSITION</label>
            <div className="preset-grid four">{[25,50,75,100].map(n=><button key={n} className={sellPct===n?'preset selected':'preset'} onClick={()=>setSellPct(n)}>{n}%</button>)}</div>
            {!selectedPosition&&<div className="trade-note">No open PAPER position in this token.</div>}
          </>}
          <button className={`trade-submit ${side}`} onClick={executePaperTrade} disabled={!selected||busy||accountBusy||(side==='sell'&&!selectedPosition)}>{busy?'CHECKING LIVE LIQUIDITY…':`${side==='buy'?'PAPER BUY':'PAPER SELL'} ${selected?`$${selected.symbol}`:'TOKEN'}`}</button>
          {quote&&<div className="trade-note emphasis">{quote}</div>}
          <div className="trade-details"><div><span>Balance</span><b>{paperCash==null?'—':`${paperCash.toFixed(3)} PAPER SOL`}</b></div><div><span>Execution</span><b>Liquidity-aware</b></div><div><span>Money at risk</span><b>$0 real funds</b></div></div>
          <div className="paper-stamp">PAPER TRADE</div>
        </div>
      </aside>
    </main>
  </div>
}
