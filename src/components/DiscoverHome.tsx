'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Globe2, Link2, Search, Settings2, Zap } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import FastPulseStrip from '@/components/FastPulseStrip'
import MarketMiniChart from '@/components/MarketMiniChart'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(n<1?6:2)}`
const age=(ms?:number)=>{if(!ms)return'—';const s=Math.floor(Math.max(0,Date.now()-ms)/1000);if(s<60)return`${s}s`;const m=Math.floor(s/60);if(m<60)return`${m}m`;const h=Math.floor(m/60);return h<24?`${h}h`:`${Math.floor(h/24)}d`}
const ageMs=(ms?:number)=>ms?Math.max(0,Date.now()-ms):Number.MAX_SAFE_INTEGER

type TabMode='top'|'trending'|'radar'
type VenueMode='all'|'pump'|'raydium'|'meteora'|'other'
type Timeframe='1m'|'5m'|'1h'|'6h'|'24h'
const presets:{id:string;value:number}[]=[{id:'P1',value:.1},{id:'P2',value:.5},{id:'P3',value:1}]
const changeFor=(t:MarketToken,tf:Timeframe)=>Number(tf==='1m'?t.priceChange1m:tf==='5m'?t.priceChange5m:tf==='1h'?t.priceChange1h:tf==='6h'?t.priceChange6h:t.priceChange24h)||0
const volumeFor=(t:MarketToken,tf:Timeframe)=>Number(tf==='1m'?t.volume1m:tf==='5m'?t.volume5m:tf==='1h'?t.volume1h:tf==='6h'?t.volume6h:t.volume24h)||0
const buysFor=(t:MarketToken,tf:Timeframe)=>Number(tf==='1m'?t.buys1m:tf==='5m'?t.buys5m:tf==='1h'?t.buys1h:tf==='6h'?t.buys6h:t.buys24h)||0
const sellsFor=(t:MarketToken,tf:Timeframe)=>Number(tf==='1m'?t.sells1m:tf==='5m'?t.sells5m:tf==='1h'?t.sells1h:tf==='6h'?t.sells6h:t.sells24h)||0
const hotScore=(t:MarketToken)=>Number(t.volume5m||0)*4+(Number(t.buys5m||0)+Number(t.sells5m||0))*180+Math.abs(Number(t.priceChange5m||0))*4500+Number(t.boostsActive||0)*1000

export default function DiscoverHome(){
  const [tokens,setTokens]=useState<MarketToken[]>([])
  const [views,setViews]=useState<Record<string,number>>({})
  const [tab,setTab]=useState<TabMode>('top')
  const [venue,setVenue]=useState<VenueMode>('all')
  const [time,setTime]=useState<Timeframe>('5m')
  const [buySize,setBuySize]=useState(.1)
  const [presetId,setPresetId]=useState('P1')
  const [buying,setBuying]=useState('')
  const [notice,setNotice]=useState('')
  const [feedError,setFeedError]=useState('')
  const [loading,setLoading]=useState(true)
  const [source,setSource]=useState('')
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [compactRows,setCompactRows]=useState(false)
  const [hideLowLiquidity,setHideLowLiquidity]=useState(false)
  const loadBusy=useRef(false)
  const lastViewsAt=useRef(0)
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const router=useRouter()

  async function loadViews(next:MarketToken[]){
    if(!supabase||!next.length||Date.now()-lastViewsAt.current<20_000)return
    lastViewsAt.current=Date.now()
    const {data}=await supabase.from('token_view_totals').select('mint_address,views').in('mint_address',next.map(t=>t.mint))
    if(data){const map:Record<string,number>={};for(const row of data)map[String(row.mint_address)]=Number(row.views||0);setViews(map)}
  }

  async function load(force=false){
    if(loadBusy.current&&!force)return
    if(typeof document!=='undefined'&&document.hidden&&!force)return
    loadBusy.current=true
    try{
      const r=await fetch('/api/market/latest',{cache:'no-store'});const j=await r.json()
      if(!r.ok)throw new Error(j.error||`market feed ${r.status}`)
      const next=(j.tokens||[]) as MarketToken[]
      if(!next.length)throw new Error('Market feed returned zero Solana tokens.')
      setTokens(next);setSource(j.source||'live');setFeedError(j.warning||'');void loadViews(next)
    }catch(e){setFeedError(e instanceof Error?e.message:'Live market feed unavailable')}
    finally{setLoading(false);loadBusy.current=false}
  }

  useEffect(()=>{void load(true);const id=window.setInterval(()=>void load(),2_500);const onVisible=()=>{if(!document.hidden)void load(true)};document.addEventListener('visibilitychange',onVisible);return()=>{window.clearInterval(id);document.removeEventListener('visibilitychange',onVisible)}},[])
  useEffect(()=>{const savedId=window.localStorage.getItem('paper.quickBuyPreset');const savedSize=Number(window.localStorage.getItem('paper.quickBuySize'));if(savedId&&presets.some(p=>p.id===savedId))setPresetId(savedId);if(Number.isFinite(savedSize)&&savedSize>0)setBuySize(savedSize);const handler=(event:Event)=>{const detail=(event as CustomEvent<{id:string;value:number}>).detail;if(detail){setPresetId(detail.id);setBuySize(detail.value)}};window.addEventListener('paper:preset',handler);return()=>window.removeEventListener('paper:preset',handler)},[])
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(target?.matches('input,textarea,[contenteditable="true"]'))return;if(event.key==='1')choosePreset('P1',.1);if(event.key==='2')choosePreset('P2',.5);if(event.key==='3')choosePreset('P3',1);if(event.key==='Escape')setSettingsOpen(false)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[])
  useEffect(()=>{if(!notice)return;const id=window.setTimeout(()=>setNotice(''),3200);return()=>window.clearTimeout(id)},[notice])

  function choosePreset(id:string,value:number){setPresetId(id);setBuySize(value);window.localStorage.setItem('paper.quickBuyPreset',id);window.localStorage.setItem('paper.quickBuySize',String(value))}

  const rows=useMemo(()=>{
    let list=[...tokens]
    if(venue==='pump')list=list.filter(t=>/pump/i.test(t.dexId||''))
    if(venue==='raydium')list=list.filter(t=>/raydium/i.test(t.dexId||''))
    if(venue==='meteora')list=list.filter(t=>/meteora/i.test(t.dexId||''))
    if(venue==='other')list=list.filter(t=>!/(pump|raydium|meteora)/i.test(t.dexId||''))
    if(hideLowLiquidity)list=list.filter(t=>t.liquidityUsd>=10000)
    if(tab==='top')list.sort((a,b)=>hotScore(b)-hotScore(a))
    if(tab==='trending')list.sort((a,b)=>(volumeFor(b,time)+Math.abs(changeFor(b,time))*1500+(buysFor(b,time)+sellsFor(b,time))*70)-(volumeFor(a,time)+Math.abs(changeFor(a,time))*1500+(buysFor(a,time)+sellsFor(a,time))*70))
    if(tab==='radar'){const fresh=list.filter(t=>ageMs(t.pairCreatedAt)<6*60*60*1000);list=(fresh.length?fresh:list).sort((a,b)=>(b.pairCreatedAt||0)-(a.pairCreatedAt||0))}
    return list.slice(0,18)
  },[tokens,tab,venue,hideLowLiquidity,time])

  async function quickBuy(t:MarketToken){
    if(!supabase){setNotice('PAPER account service is unavailable.');return}
    try{setBuying(t.mint);setNotice('');await ensurePaperUser(supabase);const {data,error}=await supabase.functions.invoke('paper-trade',{body:{mint:t.mint,side:'buy',amountSol:buySize}});if(error)throw error;if(data?.error)throw new Error(data.error);setNotice(`Filled ${buySize} PAPER SOL of $${t.symbol}`);window.dispatchEvent(new Event('paper:account-changed'))}catch(e){setNotice(e instanceof Error?e.message:'PAPER buy failed')}finally{setBuying('')}
  }

  const tabs:[TabMode,string][]=[['top','Top'],['trending','Trending'],['radar','Radar']]
  const venues:{id:VenueMode;label:string;className?:string;title:string}[]=[{id:'all',label:'All',title:'All Solana venues'},{id:'pump',label:'⚡',className:'venue-pump',title:'Pump venues'},{id:'raydium',label:'R',title:'Raydium'},{id:'meteora',label:'M',title:'Meteora'},{id:'other',label:'◇',title:'Other Solana venues'}]

  return <div className="ax-app">
    <AppHeader active="spot"/>
    <main className="market-console">
      <section className="market-topbar">
        <div className="market-tabs">{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div><div className="market-top-spacer"/>
        <div className="time-tabs-terminal">{(['1m','5m','1h','6h','24h'] as Timeframe[]).map(v=><button key={v} className={time===v?'active':''} onClick={()=>setTime(v)}>{v}{v==='1m'&&<i className="live-tf-dot"/>}</button>)}</div>
        <div className="terminal-control-row"><button className={`icon-control ${settingsOpen?'active':''}`} title="Display settings" onClick={()=>setSettingsOpen(v=>!v)}><Settings2 size={15}/></button><button className={`icon-control ${hideLowLiquidity?'active':''}`} title="Hide low-liquidity pairs" onClick={()=>setHideLowLiquidity(v=>!v)}>{hideLowLiquidity?<EyeOff size={15}/>:<Eye size={15}/>}</button><div className="quick-buy-terminal"><Zap size={12} color="#6c82ff"/><span>Quick Buy</span><input aria-label="Quick buy PAPER SOL" type="number" min=".01" step=".01" value={buySize} onChange={e=>{setPresetId('');setBuySize(Math.max(.01,Number(e.target.value)||.01))}}/><small>PAPER SOL</small></div><div className="preset-strip">{presets.map(p=><button key={p.id} className={presetId===p.id?'active':''} onClick={()=>choosePreset(p.id,p.value)}>{p.id}</button>)}</div></div>
        {settingsOpen&&<div className="terminal-settings-pop"><label><span>Compact rows</span><input type="checkbox" checked={compactRows} onChange={e=>setCompactRows(e.target.checked)}/></label><label><span>Hide liquidity &lt; $10K</span><input type="checkbox" checked={hideLowLiquidity} onChange={e=>setHideLowLiquidity(e.target.checked)}/></label><small>Top is ranked by live 5m activity. 1m is an observed rolling window that warms for about a minute after a cold start.</small></div>}
      </section>
      <FastPulseStrip tokens={tokens}/>
      {feedError&&<div className="terminal-error"><span><b>Live feed:</b> {feedError}</span><button onClick={()=>void load(true)}>Retry</button></div>}{notice&&<div className="terminal-toast">{notice}</div>}
      <section className="market-workspace"><aside className="venue-rail">{venues.map(v=><button key={v.id} title={v.title} className={`${venue===v.id?'active ':''}${v.className||''}`} onClick={()=>setVenue(v.id)}>{v.label}</button>)}<div className="rail-divider"/><small>SOL</small></aside><div className="market-table-shell"><div className="market-table"><div className="terminal-table-head"><span>Pair Info</span><span>Chart</span><span>Market Cap</span><span>Liquidity</span><span>{time} Volume</span><span>{time} TXNS</span><span>Token Info</span><span>Action</span></div>{rows.map(t=>{
        const buys=buysFor(t,time),sells=sellsFor(t,time),tx=buys+sells,buyPct=Math.round(buys/Math.max(1,tx)*100),sellPct=100-buyPct,lqRatio=t.marketCap>0?Math.min(999,(t.liquidityUsd/t.marketCap)*100):0,change=changeFor(t,time),up=change>=0,minuteWarm=time==='1m'&&!t.observed1mReady
        return <div className={`terminal-table-row ${compactRows?'compact':''}`} key={t.mint}>
          <button className="pair-cell-terminal" onClick={()=>router.push(`/spot?mint=${t.mint}`)}><div className="pair-avatar-terminal">{t.image?<img src={t.image} alt="" loading="lazy"/>:<span>{t.symbol.slice(0,2)}</span>}</div><div className="pair-copy-terminal"><div className="pair-title-terminal"><b>{t.symbol}</b><span>{t.name}</span><small className="pair-fee">LQ {lqRatio.toFixed(1)}%</small></div><div className="pair-meta-terminal"><b>{age(t.pairCreatedAt)}</b>{t.website?<Globe2 size={12}/>:<Link2 size={12}/>}<Search size={12}/><Eye size={12}/><span>{(views[t.mint]||0).toLocaleString()} views</span></div></div></button>
          <div className="spark-cell-terminal"><MarketMiniChart token={t} timeframe={time}/></div><div className="metric-terminal"><b>{money(t.marketCap)}</b><span className={up?'gain':'loss'}>{minuteWarm?'warming':`${up?'+':''}${change.toFixed(2)}%`}</span></div><div className="metric-terminal"><b>{money(t.liquidityUsd)}</b><span>{lqRatio.toFixed(1)}% of MC</span></div><div className="metric-terminal"><b>{minuteWarm?'warming':money(volumeFor(t,time))}</b><span>{t.dexId||'Solana'}</span></div><div className="tx-terminal"><b>{minuteWarm?'—':tx.toLocaleString()}</b><span><em className="gain">{buys}</em> / <em className="loss">{sells}</em></span></div><div className="token-info-terminal"><span className="metric-pill bad">S {sellPct}%</span><span className="metric-pill good">B {buyPct}%</span><span className="metric-pill">LQ {lqRatio.toFixed(1)}%</span><span className={`metric-pill ${up?'good':'bad'}`}>{minuteWarm?'1m live':`${up?'+':''}${Math.round(change)}%`}</span><span className="metric-pill blue">{String(t.dexId||'SOL').slice(0,9)}</span>{t.boostsActive?<span className="metric-pill gold">⚡ {t.boostsActive}</span>:<span className="metric-pill gold">{age(t.pairCreatedAt)}</span>}</div><div className="terminal-buy-wrap"><button className="terminal-buy" disabled={buying===t.mint} onClick={()=>void quickBuy(t)}>{buying===t.mint?'Buying…':<>Buy {buySize}<small>PAPER SOL</small></>}</button></div>
        </div>})}{!rows.length&&loading&&Array.from({length:6}).map((_,i)=><div className="terminal-skeleton-row" key={i}><span/><span/><span/><span/><span/><span/></div>)}{!rows.length&&!loading&&<div className="terminal-empty">{feedError?'Live token feed is temporarily unavailable. Retrying automatically.':'No pairs match this filter right now.'}</div>}</div></div></section>
      <div className={`terminal-source ${feedError?'warning':''}`} style={{margin:'8px 18px 0 78px'}}><i/>{feedError?'Feed degraded':`Live Solana · ${source||'market feed'} · refreshing about every 2.5 seconds`}</div>
    </main><BottomDock active="spot"/>
  </div>
}
