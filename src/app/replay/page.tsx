'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { History, Pause, Play, RotateCcw, Search } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import type { MarketToken } from '@/lib/types'

type Candle={time:number;open:number;high:number;low:number;close:number;volume:number}
type ReplayTrade={side:'buy'|'sell';time:number;price:number;quantity:number;notional:number}
const money=(n:number)=>!Number.isFinite(n)?'—':'$'+n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
const isMint=(s:string)=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim())

export default function ReplayPage(){
  const host=useRef<HTMLDivElement|null>(null),chart=useRef<IChartApi|null>(null),series=useRef<ISeriesApi<'Candlestick'>|null>(null)
  const [query,setQuery]=useState(''),[token,setToken]=useState<MarketToken|null>(null),[candles,setCandles]=useState<Candle[]>([]),[index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[loading,setLoading]=useState(false),[error,setError]=useState('')
  const [cash,setCash]=useState(1000),[quantity,setQuantity]=useState(0),[cost,setCost]=useState(0),[amount,setAmount]=useState(100),[trades,setTrades]=useState<ReplayTrade[]>([])

  useEffect(()=>{
    if(!host.current)return
    const c=createChart(host.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#080b0f'},textColor:'#8f99aa',fontSize:11},grid:{vertLines:{color:'#1c222b'},horzLines:{color:'#1c222b'}},rightPriceScale:{borderColor:'#242a32'},timeScale:{borderColor:'#242a32',timeVisible:true,secondsVisible:false,rightOffset:8,barSpacing:7},crosshair:{}})
    const s=c.addSeries(CandlestickSeries,{upColor:'#11c7a3',downColor:'#ef394f',borderVisible:false,wickUpColor:'#11c7a3',wickDownColor:'#ef394f',priceLineVisible:false})
    chart.current=c;series.current=s
    return()=>{c.remove();chart.current=null;series.current=null}
  },[])

  useEffect(()=>{
    if(!series.current)return
    series.current.setData(candles.slice(0,index+1).map(c=>({time:c.time as UTCTimestamp,open:c.open,high:c.high,low:c.low,close:c.close})))
    if(index>0)requestAnimationFrame(()=>chart.current?.timeScale().scrollToRealTime())
  },[candles,index])

  useEffect(()=>{
    if(!playing||!candles.length||index>=candles.length-1)return
    const id=window.setTimeout(()=>setIndex(v=>Math.min(candles.length-1,v+1)),Math.max(90,700/speed))
    return()=>clearTimeout(id)
  },[playing,index,candles.length,speed])
  useEffect(()=>{if(index>=candles.length-1)setPlaying(false)},[index,candles.length])

  const current=candles[index],marketValue=quantity*Number(current?.close||0),equity=cash+marketValue,unrealized=marketValue-cost,realized=trades.filter(t=>t.side==='sell').reduce((s,t)=>s,0)
  const pnl=equity-1000,roi=pnl/1000*100

  async function loadReplay(event?:FormEvent){
    event?.preventDefault()
    const q=query.trim()
    if(!isMint(q)){setError('Paste a valid Solana contract address.');return}
    setLoading(true);setError('')
    try{
      const tr=await fetch('/api/market/token/'+encodeURIComponent(q),{cache:'no-store'}),tj=await tr.json()
      if(!tr.ok||!tj.token?.pairAddress)throw new Error(tj.error||'No active replay market found.')
      const tok=tj.token as MarketToken
      const cr=await fetch('/api/market/ohlcv/'+encodeURIComponent(tok.pairAddress!)+'?tf=1m',{cache:'no-store'}),cj=await cr.json()
      if(!cr.ok||!Array.isArray(cj.candles)||cj.candles.length<20)throw new Error(cj.error||'Not enough historical candles for replay.')
      const rows=(cj.candles as Candle[]).sort((a,b)=>a.time-b.time)
      setToken(tok);setCandles(rows);setIndex(Math.min(20,rows.length-1));setCash(1000);setQuantity(0);setCost(0);setTrades([]);setPlaying(false)
    }catch(e){setError(e instanceof Error?e.message:'Replay could not load')}finally{setLoading(false)}
  }

  function reset(){if(!candles.length)return;setIndex(Math.min(20,candles.length-1));setCash(1000);setQuantity(0);setCost(0);setTrades([]);setPlaying(false)}
  function buy(){
    if(!current||amount<=0||amount>cash)return
    const fee=amount*.01,spend=amount+fee
    if(spend>cash)return
    const qty=amount/current.close
    setCash(v=>v-spend);setQuantity(v=>v+qty);setCost(v=>v+amount);setTrades(v=>[...v,{side:'buy',time:current.time,price:current.close,quantity:qty,notional:amount}])
  }
  function sell(pct:number){
    if(!current||quantity<=0)return
    const qty=quantity*(pct/100),gross=qty*current.close,fee=gross*.01
    const basis=quantity>0?cost*(qty/quantity):0
    setCash(v=>v+gross-fee);setQuantity(v=>Math.max(0,v-qty));setCost(v=>Math.max(0,v-basis));setTrades(v=>[...v,{side:'sell',time:current.time,price:current.close,quantity:qty,notional:gross}])
  }

  return <div className="ax-app"><AppHeader active="spot"/><main className="terminal-page"><div className="terminal-page-inner">
    <div className="final-page-hero"><div><div className="terminal-eyebrow">PAPER REPLAY · HISTORICAL PRACTICE</div><h1>Trade Replay</h1><p className="terminal-lead">Load a Solana token, hide the future, and practice the launch candle-by-candle with a fresh $1,000 PAPER replay balance.</p></div><History size={26}/></div>
    {error&&<div className="error-card">{error}</div>}
    <section className="replay-shell">
      <div className="replay-chart-card">
        <form className="replay-toolbar" onSubmit={loadReplay}><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Paste Solana CA to replay"/><button disabled={loading}>{loading?'Loading…':'Load replay'}</button></form>
        <div className="replay-stage"><div ref={host} style={{position:'absolute',inset:0}}/>{!token&&<div className="chart-state">Load a token to start replay.</div>}</div>
      </div>
      <aside className="replay-control-card">
        <h2>{token?'$'+token.symbol:'Replay controls'}</h2><p>{token?token.name:'Historical candles only. Replay trades are local practice and do not change your main PAPER account.'}</p>
        <div className="replay-kpis"><span><small>EQUITY</small><b>{money(equity)}</b></span><span><small>P&L</small><b className={pnl>=0?'gain':'loss'}>{pnl>=0?'+':''}{money(pnl)}</b></span><span><small>ROI</small><b className={roi>=0?'gain':'loss'}>{roi>=0?'+':''}{roi.toFixed(2)}%</b></span><span><small>CANDLE</small><b>{candles.length?index+1:0} / {candles.length}</b></span><span><small>CASH</small><b>{money(cash)}</b></span><span><small>POSITION</small><b>{money(marketValue)}</b></span></div>
        <div className="replay-controls"><button onClick={()=>setPlaying(v=>!v)} disabled={!candles.length}>{playing?<Pause size={13}/>:<Play size={13}/>} {playing?'Pause':'Play'}</button><button className={speed===2?'active':''} onClick={()=>setSpeed(v=>v===1?2:v===2?4:1)}>{speed}x</button><button onClick={reset} disabled={!candles.length}><RotateCcw size={13}/> Reset</button></div>
        <div className="replay-trade-box"><label>PAPER buy amount</label><input type="number" min="1" step="1" value={amount} onChange={e=>setAmount(Math.max(1,Number(e.target.value)||1))}/><button className="replay-buy" onClick={buy} disabled={!current||amount*1.01>cash}>BUY · PAPER</button><div className="replay-controls"><button className="replay-sell" disabled={!quantity} onClick={()=>sell(25)}>Sell 25%</button><button className="replay-sell" disabled={!quantity} onClick={()=>sell(50)}>Sell 50%</button><button className="replay-sell" disabled={!quantity} onClick={()=>sell(100)}>Sell 100%</button></div></div>
        <div className="advanced-order-list"><div className="advanced-order-list-head"><span>REPLAY TRADES</span><b>{trades.length}</b></div>{trades.slice(-8).reverse().map((t,i)=><div className="advanced-order-row" key={t.time+'-'+i}><span><b className={t.side==='buy'?'gain':'loss'}>{t.side.toUpperCase()}</b><small>{new Date(t.time*1000).toLocaleString()}</small></span><strong>{money(t.notional)}</strong><span/></div>)}</div>
      </aside>
    </section>
  </div></main><BottomDock active="spot"/></div>
}
