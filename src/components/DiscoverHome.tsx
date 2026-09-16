'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import MiniSparkline from '@/components/MiniSparkline'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(n<1?6:2)}`
const age=(ms?:number)=>{if(!ms)return'—';const m=Math.floor(Math.max(0,Date.now()-ms)/60000);if(m<1)return'0s';if(m<60)return`${m}m`;const h=Math.floor(m/60);return h<24?`${h}h`:`${Math.floor(h/24)}d`}

export default function DiscoverHome(){
  const [tokens,setTokens]=useState<MarketToken[]>([])
  const [tab,setTab]=useState<'top'|'trending'|'new'>('top')
  const [time,setTime]=useState<'1m'|'5m'|'30m'|'1h'>('5m')
  const [buySize,setBuySize]=useState(.1)
  const [buying,setBuying]=useState('')
  const [notice,setNotice]=useState('')
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const router=useRouter()

  async function load(){
    try{const r=await fetch('/api/market/latest',{cache:'no-store'});const j=await r.json();if(r.ok)setTokens(j.tokens||[])}catch{}
  }
  useEffect(()=>{void load();const id=setInterval(load,10000);return()=>clearInterval(id)},[])

  const rows=useMemo(()=>{
    const list=[...tokens]
    if(tab==='top')list.sort((a,b)=>b.marketCap-a.marketCap)
    if(tab==='trending')list.sort((a,b)=>(b.volume24h+Math.abs(b.priceChange24h)*1000)-(a.volume24h+Math.abs(a.priceChange24h)*1000))
    if(tab==='new')list.sort((a,b)=>(b.pairCreatedAt||0)-(a.pairCreatedAt||0))
    return list.slice(0,14)
  },[tokens,tab])

  async function quickBuy(t:MarketToken){
    if(!supabase)return
    try{
      setBuying(t.mint);setNotice('')
      await ensurePaperUser(supabase)
      const {data,error}=await supabase.functions.invoke('paper-trade',{body:{mint:t.mint,side:'buy',amountSol:buySize}})
      if(error)throw error
      if(data?.error)throw new Error(data.error)
      setNotice(`PAPER BUY filled: ${buySize} PAPER SOL of $${t.symbol}`)
    }catch(e){setNotice(e instanceof Error?e.message:'PAPER buy failed')}
    finally{setBuying('')}
  }

  return <div className="ax-app">
    <AppHeader active="spot"/>
    <main className="discover-page">
      <div className="discover-toolbar">
        <div className="discover-tabs">
          <button className={tab==='top'?'active':''} onClick={()=>setTab('top')}>Top</button>
          <button className={tab==='trending'?'active':''} onClick={()=>setTab('trending')}>Trending</button>
          <button className={tab==='new'?'active':''} onClick={()=>setTab('new')}>New</button>
        </div>
        <div className="time-tabs">{(['1m','5m','30m','1h'] as const).map(v=><button key={v} className={time===v?'active':''} onClick={()=>setTime(v)}>{v}</button>)}</div>
        <div className="quick-buy"><span>Quick Buy</span><input type="number" min=".01" step=".01" value={buySize} onChange={e=>setBuySize(Math.max(.01,Number(e.target.value)||.01))}/><small>PAPER SOL</small></div>
      </div>

      {notice&&<div className="toast-line">{notice}</div>}
      <div className="discover-table">
        <div className="discover-head"><span>Pair Info</span><span>Chart</span><span>Market Cap</span><span>Liquidity</span><span>Volume</span><span>TXNS</span><span>Token Info</span><span>Action</span></div>
        {rows.map(t=>{
          const up=t.priceChange24h>=0
          const holder=Math.max(12,Math.round((t.buys24h+t.sells24h)*1.7))
          return <div className="discover-row" key={t.mint}>
            <button className="pair-cell" onClick={()=>router.push(`/spot?mint=${t.mint}`)}>
              <div className="pair-avatar">{t.image?<img src={t.image} alt=""/>:<span>{t.symbol.slice(0,2)}</span>}</div>
              <div><div className="pair-name">{t.symbol} <span>{t.name}</span></div><div className="pair-meta"><b>{age(t.pairCreatedAt)}</b><span>◯</span><span>◎ {holder}</span></div></div>
            </button>
            <MiniSparkline pool={t.pairAddress} timeframe={time}/>
            <div className="metric-cell"><b>{money(t.marketCap)}</b><span className={up?'gain':'loss'}>{up?'+':''}{t.priceChange24h.toFixed(2)}%</span></div>
            <div className="metric-cell"><b>{money(t.liquidityUsd)}</b></div>
            <div className="metric-cell"><b>{money(t.volume24h)}</b></div>
            <div className="metric-cell"><b>{(t.buys24h+t.sells24h).toLocaleString()}</b><span><em className="gain">{t.buys24h}</em> / <em className="loss">{t.sells24h}</em></span></div>
            <div className="token-info-cell"><span className="token-badge gain">◎ {Math.min(99,Math.max(0,Math.round(t.buys24h/Math.max(1,t.buys24h+t.sells24h)*100)))}%</span><span className="token-badge">◌ {holder}</span><span className="token-badge">{t.dexId||'SOL'}</span></div>
            <button className="blue-buy" disabled={buying===t.mint} onClick={()=>void quickBuy(t)}>{buying===t.mint?'Buying…':`Buy ${buySize} PAPER SOL`}</button>
          </div>
        })}
        {!rows.length&&<div className="table-empty">Loading live Solana memecoins…</div>}
      </div>
    </main>
  </div>
}
