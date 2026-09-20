'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Filter, LayoutList, RefreshCw, Zap } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import FastPulseStrip from '@/components/FastPulseStrip'
import MarketFilterDrawer from '@/components/MarketFilterDrawer'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import { activeFilterCount, defaultMarketFilters, tokenMatchesFilters, type MarketFilters } from '@/lib/market-filters'
import { useInstantMode } from '@/lib/use-instant-mode'
import type { MarketToken } from '@/lib/types'

const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:`$${n.toFixed(n<1?6:2)}`
const age=(ms?:number)=>{if(!ms)return'—';const s=Math.floor(Math.max(0,Date.now()-ms)/1000);if(s<60)return`${s}s`;const m=Math.floor(s/60);if(m<60)return`${m}m`;const h=Math.floor(m/60);return h<24?`${h}h`:`${Math.floor(h/24)}d`}
type Venue='all'|'pump'|'raydium'|'meteora'|'other'
const presets=[{id:'$10',value:10},{id:'$25',value:25},{id:'$50',value:50},{id:'$100',value:100}]

function PulseCard({t,compact,buySize,buying,disabled,instantMode,onOpen,onAction}:{t:MarketToken;compact:boolean;buySize:number;buying:boolean;disabled:boolean;instantMode:boolean;onOpen:()=>void;onAction:()=>void}){
  const buys=Number(t.buys5m||0),sells=Number(t.sells5m||0),tx=buys+sells,buyPct=Math.round(buys/Math.max(1,tx)*100),lqRatio=t.marketCap>0?Math.min(999,(t.liquidityUsd/t.marketCap)*100):0,liveChange=Number(t.priceChange5m||0)
  return <div className={`pulse-card-terminal ${compact?'compact':''}`} role="button" tabIndex={0} onClick={onOpen} aria-label={'Open '+t.symbol+' in Trade'} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen()}}}>
    <div className="pulse-img-terminal">{t.image?<img src={t.image} alt="" loading="lazy"/>:<span>{t.symbol.slice(0,2)}</span>}</div>
    <div className="pulse-card-body"><div className="pulse-card-title"><b>{t.symbol}</b><span>{t.name}</span><i>MC <strong>{money(t.marketCap)}</strong></i></div><div className="pulse-card-meta"><em>{age(t.pairCreatedAt)}</em><span className="pulse-live-dot">LIVE</span><span>5m V {money(Number(t.volume5m||0))}</span><span>◎ {tx}</span><span>≋ {t.priceNative?t.priceNative.toFixed(4):'—'}</span></div><div className="pulse-card-badges"><span className={buyPct>=50?'metric-pill good':'metric-pill bad'}>B {buyPct}%</span><span className="metric-pill">LQ {lqRatio.toFixed(1)}%</span><span className={liveChange>=0?'metric-pill good':'metric-pill bad'}>{liveChange>=0?'+':''}{liveChange.toFixed(1)}%</span><span className="metric-pill blue">{String(t.dexId||'SOL').slice(0,8)}</span></div></div>
    <button className={`pulse-quick-buy ${instantMode?'instant':''}`} title={instantMode?`Instant PAPER buy ${buySize}`:'Open PAPER trade panel'} disabled={disabled} aria-label={instantMode?`Instant PAPER buy ${t.symbol} for ${buySize}`:`Open ${t.symbol} trade panel`} onClick={e=>{e.stopPropagation();onAction()}}>{buying?'…':instantMode?<Zap size={12}/>:<span>↗</span>}</button>
  </div>
}

export default function PulsePage(){
  const [tokens,setTokens]=useState<MarketToken[]>([]),[queries,setQueries]=useState({new:'',final:'',migrated:'',trending:'',volume:''}),[refreshing,setRefreshing]=useState(false),[feedError,setFeedError]=useState(''),[source,setSource]=useState(''),[dataStatus,setDataStatus]=useState<'LIVE'|'DEGRADED'|'STALE'>('DEGRADED'),[compact,setCompact]=useState(false),[hideLowLiquidity,setHideLowLiquidity]=useState(false),[venue,setVenue]=useState<Venue>('all'),[buySize,setBuySize]=useState(25),[presetId,setPresetId]=useState('$25'),[buying,setBuying]=useState(''),[notice,setNotice]=useState(''),[filters,setFilters]=useState<MarketFilters>(defaultMarketFilters),[filterOpen,setFilterOpen]=useState(false),[solUsd,setSolUsd]=useState(0),[paperCash,setPaperCash]=useState(0)
  const loadBusy=useRef(false),buyLock=useRef(false),router=useRouter(),supabase=useMemo(()=>{try{return createClient()}catch{return null}},[]),[instantMode]=useInstantMode(),filterCount=activeFilterCount(filters)

  async function load(force=false){if(loadBusy.current||document.hidden&&!force)return;loadBusy.current=true;if(force)setRefreshing(true);try{const r=await fetch('/api/market/latest',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||`market feed ${r.status}`);const next=(j.tokens||[]) as MarketToken[];if(!next.length)throw new Error('Market feed returned zero Solana tokens.');setTokens(next);setSource(j.source||'market feed');setFeedError(j.warning||'');setDataStatus(j.stale?'STALE':j.warning||j.fallback||j.live===false?'DEGRADED':'LIVE')}catch(e){setFeedError(e instanceof Error?e.message:'Live market feed unavailable');setDataStatus('DEGRADED')}finally{if(force)setRefreshing(false);loadBusy.current=false}}
  useEffect(()=>{const start=window.setTimeout(()=>void load(true),0),id=setInterval(()=>void load(),1800),onVisible=()=>{if(!document.hidden)void load(true)};document.addEventListener('visibilitychange',onVisible);return()=>{clearTimeout(start);clearInterval(id);document.removeEventListener('visibilitychange',onVisible)}},[])
  useEffect(()=>{
    let alive=true
    const refreshBuyingPower=async()=>{
      try{
        const sr=await fetch('/api/market/sol',{cache:'no-store'}),sj=await sr.json()
        if(alive&&sr.ok)setSolUsd(Number(sj?.priceUsd||0))
        if(supabase){
          const user=await ensurePaperUser(supabase)
          const {data}=await supabase.from('paper_accounts').select('cash_usd').eq('user_id',user.id).single()
          if(alive&&data)setPaperCash(Number(data.cash_usd||0))
        }
      }catch{}
    }
    void refreshBuyingPower()
    const changed=()=>void refreshBuyingPower()
    const id=window.setInterval(()=>{if(!document.hidden)void refreshBuyingPower()},10000)
    window.addEventListener('paper:account-changed',changed)
    return()=>{alive=false;clearInterval(id);window.removeEventListener('paper:account-changed',changed)}
  },[supabase])
  useEffect(()=>{
    const start=window.setTimeout(()=>{
    const legacyId=localStorage.getItem('paper.quickBuyPreset')
    const legacySize=Number(localStorage.getItem('paper.quickBuySize'))
    let savedId=localStorage.getItem('paper.pulse.quickBuyPreset')
    let savedSize=Number(localStorage.getItem('paper.pulse.quickBuyUsd'))
    if(!savedId&&legacyId&&(presets.some(p=>p.id===legacyId)||legacyId==='MAX')){
      savedId=legacyId
      if(legacySize>0)savedSize=legacySize
      localStorage.setItem('paper.pulse.quickBuyPreset',legacyId)
      if(legacySize>0)localStorage.setItem('paper.pulse.quickBuyUsd',String(legacySize))
      localStorage.removeItem('paper.quickBuyPreset')
      localStorage.removeItem('paper.quickBuySize')
    }
    if(savedId&&(presets.some(p=>p.id===savedId)||savedId==='MAX'))setPresetId(savedId)
    if(savedSize>0)setBuySize(savedSize)
    },0)
    return()=>clearTimeout(start)
  },[])
  useEffect(()=>{const start=window.setTimeout(()=>{try{const saved=JSON.parse(localStorage.getItem('paper.pulse.workspace.v1')||'{}');if(saved.venue&&['all','pump','raydium','meteora','other'].includes(saved.venue))setVenue(saved.venue);if(typeof saved.compact==='boolean')setCompact(saved.compact);if(typeof saved.hideLowLiquidity==='boolean')setHideLowLiquidity(saved.hideLowLiquidity);if(saved.queries&&typeof saved.queries==='object')setQueries(cur=>({...cur,...saved.queries}));if(saved.filters&&typeof saved.filters==='object')setFilters(cur=>({...cur,...saved.filters}))}catch{}},0);return()=>clearTimeout(start)},[])
  useEffect(()=>{localStorage.setItem('paper.pulse.workspace.v1',JSON.stringify({venue,compact,hideLowLiquidity,queries,filters}))},[venue,compact,hideLowLiquidity,queries,filters])
  useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),4200);return()=>clearTimeout(id)},[notice])
  function choosePreset(id:string,value:number){setPresetId(id);setBuySize(value);localStorage.setItem('paper.pulse.quickBuyPreset',id);localStorage.setItem('paper.pulse.quickBuyUsd',String(value))}
  async function quickBuy(t:MarketToken){
    if(!supabase){setNotice('PAPER account service is unavailable.');return}
    if(buyLock.current)return
    if(dataStatus==='STALE'){setNotice('Live market data is stale. Refresh Pulse before using instant buy.');return}
    buyLock.current=true
    try{
      setBuying(t.mint);setNotice('')
      const user=await ensurePaperUser(supabase)
      const {data:acct}=await supabase.from('paper_accounts').select('cash_usd').eq('user_id',user.id).single()
      const currentCash=Number(acct?.cash_usd||0);setPaperCash(currentCash)
      let price=solUsd
      if(!price){const sr=await fetch('/api/market/sol',{cache:'no-store'}),sj=await sr.json();price=Number(sj?.priceUsd||0);if(price)setSolUsd(price)}
      if(!price)throw new Error('SOL/USD is unavailable for quick buy.')
      const usd=presetId==='MAX'?Math.max(0,currentCash/1.01):buySize
      if(usd<=0)throw new Error('No PAPER buying power available.')
      if(presetId!=='MAX'&&usd*1.01>currentCash+.001)throw new Error('Not enough PAPER buying power for this preset plus the PAPER fee.')
      const {data,error}=await supabase.functions.invoke('paper-trade',{body:{mint:t.mint,side:'buy',amountSol:usd/price,idempotencyKey:crypto.randomUUID()}})
      if(error)throw error
      if(data?.error)throw new Error(data.error)
      setNotice(`PAPER BUY FILLED · ${t.symbol} · ${money(Number(data.fill?.requestedAmountUsd||0))} · fee ${money(Number(data.fill?.paperFeeUsd||0))}`)
      const {data:nextAcct}=await supabase.from('paper_accounts').select('cash_usd').eq('user_id',user.id).single()
      if(nextAcct)setPaperCash(Number(nextAcct.cash_usd||0))
      window.dispatchEvent(new Event('paper:account-changed'))
    }catch(e){setNotice(e instanceof Error?e.message:'PAPER buy failed')}
    finally{buyLock.current=false;setBuying('')}
  }

  const base=useMemo(()=>{let list=[...tokens].filter(t=>tokenMatchesFilters(t,filters));if(venue==='pump')list=list.filter(t=>/pump/i.test(t.dexId||''));if(venue==='raydium')list=list.filter(t=>/raydium/i.test(t.dexId||''));if(venue==='meteora')list=list.filter(t=>/meteora/i.test(t.dexId||''));if(venue==='other')list=list.filter(t=>!/(pump|raydium|meteora)/i.test(t.dexId||''));if(hideLowLiquidity)list=list.filter(t=>t.liquidityUsd>=10000);return list},[tokens,venue,hideLowLiquidity,filters])
  const newer=useMemo(()=>[...base].sort((a,b)=>(b.pairCreatedAt||0)-(a.pairCreatedAt||0)).slice(0,30),[base])
  const final=useMemo(()=>{const pump=base.filter(t=>/pump/i.test(t.dexId||'')&&t.marketCap>0&&t.marketCap<500000);return [...(pump.length?pump:base.filter(t=>t.marketCap>0&&t.marketCap<500000))].sort((a,b)=>(Number(b.volume5m||0)+Number(b.buys5m||0)*200+Math.max(0,Number(b.priceChange5m||0))*1000)-(Number(a.volume5m||0)+Number(a.buys5m||0)*200+Math.max(0,Number(a.priceChange5m||0))*1000)).slice(0,30)},[base])
  const migrated=useMemo(()=>[...base.filter(t=>/(raydium|meteora|pumpswap)/i.test(t.dexId||'')||t.liquidityUsd>20000)].sort((a,b)=>(Number(b.volume5m||0)+Math.abs(Number(b.priceChange5m||0))*3000+Number(b.liquidityUsd||0)*.05)-(Number(a.volume5m||0)+Math.abs(Number(a.priceChange5m||0))*3000+Number(a.liquidityUsd||0)*.05)).slice(0,30),[base])
  const trending=useMemo(()=>[...base].sort((a,b)=>(Number(b.buys5m||0)*350+Number(b.volume5m||0)+Math.max(0,Number(b.priceChange5m||0))*2500)-(Number(a.buys5m||0)*350+Number(a.volume5m||0)+Math.max(0,Number(a.priceChange5m||0))*2500)).slice(0,30),[base])
  const highVolume=useMemo(()=>[...base].sort((a,b)=>Number(b.volume5m||0)-Number(a.volume5m||0)).slice(0,30),[base])
  function filterColumn(list:MarketToken[],key:keyof typeof queries){const q=queries[key].trim().toLowerCase();return q?list.filter(t=>t.symbol.toLowerCase().includes(q)||t.name.toLowerCase().includes(q)):list}
  const columns=[{key:'new' as const,title:'New Pairs',list:filterColumn(newer,'new')},{key:'final' as const,title:'Final Stretch',list:filterColumn(final,'final')},{key:'migrated' as const,title:'Migrated',list:filterColumn(migrated,'migrated')},{key:'trending' as const,title:'Trending',list:filterColumn(trending,'trending')},{key:'volume' as const,title:'High Volume',list:filterColumn(highVolume,'volume')}]

  return <div className="ax-app"><AppHeader active="pulse"/><main className="pulse-console master-pulse"><section className="pulse-console-head"><h1>Pulse</h1><div className="pulse-chain-strip"><button aria-label="All venues" className={venue==='all'?'active':''} onClick={()=>setVenue('all')}>All</button><button aria-label="Pump.fun" className={venue==='pump'?'active':''} onClick={()=>setVenue('pump')}>⚡</button><button aria-label="Raydium" className={venue==='raydium'?'active':''} onClick={()=>setVenue('raydium')}>R</button><button aria-label="Meteora" className={venue==='meteora'?'active':''} onClick={()=>setVenue('meteora')}>M</button><button aria-label="Other venues" className={venue==='other'?'active':''} onClick={()=>setVenue('other')}>◇</button></div><span className={`beta-feed-terminal ${dataStatus.toLowerCase()}`}>{dataStatus==='LIVE'?'FAST FEED':dataStatus}</span><span className={`instant-status-chip ${instantMode?'on':''}`}><Zap size={11}/>{instantMode?'INSTANT ON':'INSTANT OFF'}</span><div className="pulse-console-spacer"/><button className={`pulse-head-control ${compact?'active':''}`} onClick={()=>setCompact(v=>!v)}><LayoutList size={14}/> Display</button><button className={`pulse-head-control ${hideLowLiquidity?'active':''}`} onClick={()=>setHideLowLiquidity(v=>!v)}>{hideLowLiquidity?<EyeOff size={14}/>:<Eye size={14}/>} Liquidity</button><button className={`pulse-head-control ${filterCount?'active':''}`} onClick={()=>setFilterOpen(true)}><Filter size={14}/> Filters {filterCount?`(${filterCount})`:''}</button><button className="pulse-head-control" onClick={()=>void load(true)} disabled={refreshing}><RefreshCw className={refreshing?'spin':''} size={14}/>{refreshing?'Refreshing':'Refresh'}</button><div className="preset-strip">{presets.map(p=><button key={p.id} className={presetId===p.id?'active':''} onClick={()=>choosePreset(p.id,p.value)}>{p.id}</button>)}<button className={presetId==='MAX'?'active':''} disabled={paperCash<=0} onClick={()=>{setPresetId('MAX');localStorage.setItem('paper.pulse.quickBuyPreset','MAX')}}>MAX</button></div></section><MarketFilterDrawer open={filterOpen} filters={filters} onChange={setFilters} onClose={()=>setFilterOpen(false)}/><FastPulseStrip tokens={tokens}/>{feedError&&<div className="pulse-error"><b>{dataStatus}:</b> {feedError}</div>}{notice&&<div className="terminal-toast">{notice}</div>}<section className="pulse-grid pulse-five-grid">{columns.map(col=><article className="pulse-board-column" key={col.key}><div className="pulse-board-head"><b>{col.title}</b><input value={queries[col.key]} onChange={e=>setQueries(q=>({...q,[col.key]:e.target.value}))} aria-label={`Search ${col.title}`} placeholder="Search by ticker"/><small>{col.list.length}</small></div><div className="pulse-board-scroll">{col.list.map(t=><PulseCard key={t.mint} t={t} compact={compact} buySize={buySize} buying={buying===t.mint} disabled={Boolean(buying)||(instantMode&&(dataStatus==='STALE'||paperCash<=0||(presetId!=='MAX'&&buySize*1.01>paperCash+.001)))} instantMode={instantMode} onOpen={()=>router.push(`/spot?mint=${t.mint}`)} onAction={()=>instantMode?void quickBuy(t):router.push(`/spot?mint=${t.mint}`)}/>)}{!tokens.length&&refreshing&&Array.from({length:5}).map((_,i)=><div className="pulse-skeleton-card" key={i}><span/><span/><span/></div>)}{tokens.length>0&&!col.list.length&&<div className="pulse-empty">No matching tokens right now.</div>}{!tokens.length&&!refreshing&&feedError&&<div className="pulse-empty">Feed unavailable — retrying automatically.</div>}</div></article>)}</section><div className={`terminal-source ${dataStatus!=='LIVE'?'warning':''}`}><i/> {dataStatus} · {source||'market feed'} · {base.length}/{tokens.length} tokens after filters · ~1.8s client refresh · New/Final/Migrated remain public-feed classifications until direct Pump.fun ingestion is connected.</div></main></div>
}
