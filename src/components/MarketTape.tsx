'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { MarketTrade } from '@/lib/types'

const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(n<1?4:2)}`
const short=(s:string)=>s.length>12?`${s.slice(0,5)}…${s.slice(-4)}`:s

export default function MarketTape({poolAddress}:{poolAddress?:string}){
  const [trades,setTrades]=useState<MarketTrade[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[asOf,setAsOf]=useState(0),[stale,setStale]=useState(false)
  const busy=useRef(false)

  useEffect(()=>{
    if(!poolAddress){setTrades([]);setError('');setAsOf(0);setStale(false);return}
    let alive=true
    const load=async(force=false)=>{
      if(busy.current||(!force&&document.hidden))return
      busy.current=true;if(alive&&!trades.length)setLoading(true)
      try{
        const r=await fetch(`/api/market/trades/${encodeURIComponent(poolAddress)}`,{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'trade tape unavailable')
        if(alive){setTrades((j.trades||[]) as MarketTrade[]);setError(j.warning||'');setAsOf(Number(j.asOf||Date.now()));setStale(Boolean(j.stale||j.live===false))}
      }catch(e){if(alive){setError(e instanceof Error?e.message:'trade tape unavailable');setStale(true)}}finally{busy.current=false;if(alive)setLoading(false)}
    }
    void load(true);const id=window.setInterval(()=>void load(),5_000),onVisible=()=>{if(!document.hidden)void load(true)};document.addEventListener('visibilitychange',onVisible)
    return()=>{alive=false;window.clearInterval(id);document.removeEventListener('visibilitychange',onVisible)}
  },[poolAddress])

  const rows=useMemo(()=>trades.slice(0,28),[trades])
  return <section className="market-tape">
    <div className="market-tape-head"><div><b>LIVE MARKET TAPE</b><small>Real pool buys &amp; sells · ~5s refresh</small></div><span className={stale||error?'tape-status warn':'tape-status'}><i/>{loading&&!rows.length?'Loading':stale?'STALE':'LIVE'}</span></div>
    <div className="market-tape-columns"><span>Side</span><span>Size</span><span>Price</span><span>Trader</span><span>Time</span></div>
    <div className="market-tape-list">
      {!rows.length&&!loading&&<div className="tape-empty">{error?'Recent pool trades are temporarily unavailable.':'No recent trades returned for this pool.'}</div>}
      {!rows.length&&loading&&Array.from({length:7}).map((_,i)=><div className="tape-skeleton" key={i}/>)}
      {rows.map((t,i)=>{const when=t.timestamp?new Date(t.timestamp):null;return <a className="market-tape-row tape-row-link" key={`${t.txHash}-${i}`} href={`https://solscan.io/tx/${encodeURIComponent(t.txHash)}`} target="_blank" rel="noreferrer"><b className={t.kind==='buy'?'gain':'loss'}>{t.kind.toUpperCase()}</b><span>{money(t.volumeUsd)}</span><span>{money(t.priceUsd)}</span><span title={t.trader||''}>{t.trader?short(t.trader):'—'}</span><span title={t.txHash}>{when&&!Number.isNaN(when.getTime())?when.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):short(t.txHash)} <ExternalLink size={8}/></span></a>})}
    </div>
    <div className="market-tape-foot"><span>{asOf?`Updated ${new Date(asOf).toLocaleTimeString()}`:'Waiting for pool activity'}</span><span>Source · GeckoTerminal</span></div>{error&&rows.length>0&&<div className="tape-warning">Showing the most recent tape while the upstream feed recovers.</div>}
  </section>
}
