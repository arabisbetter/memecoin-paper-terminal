'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MarketTrade } from '@/lib/types'

const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(n<1?4:2)}`
const short=(s:string)=>s.length>12?`${s.slice(0,5)}…${s.slice(-4)}`:s

export default function MarketTape({poolAddress}:{poolAddress?:string}){
  const [trades,setTrades]=useState<MarketTrade[]>([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const busy=useRef(false)

  useEffect(()=>{
    if(!poolAddress){setTrades([]);setError('');return}
    let alive=true
    const load=async(force=false)=>{
      if(busy.current||(!force&&document.hidden))return
      busy.current=true;if(alive)setLoading(true)
      try{
        const r=await fetch(`/api/market/trades/${encodeURIComponent(poolAddress)}`,{cache:'no-store'})
        const j=await r.json()
        if(!r.ok)throw new Error(j.error||'trade tape unavailable')
        if(alive){setTrades((j.trades||[]) as MarketTrade[]);setError(j.warning||'')}
      }catch(e){if(alive)setError(e instanceof Error?e.message:'trade tape unavailable')}
      finally{busy.current=false;if(alive)setLoading(false)}
    }
    void load(true)
    const id=window.setInterval(()=>void load(),30_000)
    const onVisible=()=>{if(!document.hidden)void load(true)}
    document.addEventListener('visibilitychange',onVisible)
    return()=>{alive=false;window.clearInterval(id);document.removeEventListener('visibilitychange',onVisible)}
  },[poolAddress])

  const rows=useMemo(()=>trades.slice(0,24),[trades])
  return <section className="market-tape">
    <div className="market-tape-head"><div><b>LIVE MARKET TAPE</b><small>Real pool trades</small></div><span className={error?'tape-status warn':'tape-status'}><i/>{loading&&!rows.length?'Loading':'LIVE'}</span></div>
    <div className="market-tape-columns"><span>Side</span><span>Size</span><span>Price</span><span>Trader</span><span>Time</span></div>
    <div className="market-tape-list">
      {!rows.length&&!loading&&<div className="tape-empty">{error?'Recent pool trades are temporarily unavailable.':'No recent trades returned for this pool.'}</div>}
      {!rows.length&&loading&&Array.from({length:7}).map((_,i)=><div className="tape-skeleton" key={i}/>) }
      {rows.map((t,i)=>{
        const when=t.timestamp?new Date(t.timestamp):null
        return <div className="market-tape-row" key={`${t.txHash}-${i}`}>
          <b className={t.kind==='buy'?'gain':'loss'}>{t.kind.toUpperCase()}</b>
          <span>{money(t.volumeUsd)}</span>
          <span>{money(t.priceUsd)}</span>
          <span title={t.trader||''}>{t.trader?short(t.trader):'—'}</span>
          <span title={t.txHash}>{when&&!Number.isNaN(when.getTime())?when.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):short(t.txHash)}</span>
        </div>
      })}
    </div>
    {error&&rows.length>0&&<div className="tape-warning">Showing the most recent cached tape while the upstream feed recovers.</div>}
  </section>
}
