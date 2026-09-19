'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Activity, Copy, Eye, ExternalLink, Globe2, Info, MessageCircle, Search, ShieldCheck, Zap } from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import BottomDock from '@/components/BottomDock'
import CandleChart from '@/components/CandleChart'
import MarketTape from '@/components/MarketTape'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'
import TokenRiskPanel from '@/components/TokenRiskPanel'
import AdvancedOrderPanel from '@/components/AdvancedOrderPanel'
import { usePaperPresets } from '@/lib/use-paper-presets'

type TokenRef={mint_address:string;ticker:string|null;name:string|null;image_url:string|null}
type DbPosition={id:string;token_id:string;quantity_tokens:number;cost_basis_usd:number|null;average_entry_price_usd:number;average_entry_mc_usd:number|null;realized_pnl_usd:number|null;accounting_version:string|null;opened_at:string;tokens:TokenRef|null}
type LivePosition=DbPosition&{current?:MarketToken}
type Account={cash_usd:number;starting_balance_usd:number;status:string}
type Side='buy'|'sell'
type AmountMode='sol'|'usd'
type StatsWindow='1m'|'5m'|'1h'|'6h'|'24h'
type MobilePane='chart'|'trade'|'positions'|'info'
type FillReceipt={side:Side;symbol:string;amountUsd:number;referencePrice:number;executionReferencePrice?:number;fillPrice:number;impactPct:number;totalSlippagePct?:number;marketMovePct?:number;latencyMs?:number;maxSlippagePct?:number;feeUsd:number;quality:string;ageMs:number;orderId?:string;replayed?:boolean}
type WindowStats={label:string;ready:boolean;volume:number;buys:number;sells:number;change:number}

const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?`$${(n/1e9).toFixed(2)}B`:n>=1e6?`$${(n/1e6).toFixed(2)}M`:n>=1e3?`$${(n/1e3).toFixed(1)}K`:n>=1?`$${n.toFixed(2)}`:`$${n.toPrecision(5)}`
const pct=(n:number)=>`${n>=0?'+':''}${n.toFixed(2)}%`
const short=(s:string)=>s.length>13?`${s.slice(0,6)}…${s.slice(-5)}`:s
const isMint=(s:string)=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim())
const age=(created?:number)=>{if(!created)return'—';const ms=Math.max(0,Date.now()-created),m=Math.floor(ms/60000);if(m<1)return'<1m';if(m<60)return`${m}m`;const h=Math.floor(m/60);if(h<48)return`${h}h`;return`${Math.floor(h/24)}d`}

function statsFor(token:MarketToken|null,window:StatsWindow):WindowStats{
  if(!token)return{label:window,ready:false,volume:0,buys:0,sells:0,change:0}
  if(window==='1m')return{label:'1m',ready:Boolean(token.observed1mReady),volume:Number(token.volume1m||0),buys:Number(token.buys1m||0),sells:Number(token.sells1m||0),change:Number(token.priceChange1m||0)}
  if(window==='5m')return{label:'5m',ready:true,volume:Number(token.volume5m||0),buys:Number(token.buys5m||0),sells:Number(token.sells5m||0),change:Number(token.priceChange5m||0)}
  if(window==='1h')return{label:'1h',ready:true,volume:Number(token.volume1h||0),buys:Number(token.buys1h||0),sells:Number(token.sells1h||0),change:Number(token.priceChange1h||0)}
  if(window==='6h')return{label:'6h',ready:true,volume:Number(token.volume6h||0),buys:Number(token.buys6h||0),sells:Number(token.sells6h||0),change:Number(token.priceChange6h||0)}
  return{label:'24h',ready:true,volume:Number(token.volume24h||0),buys:Number(token.buys24h||0),sells:Number(token.sells24h||0),change:Number(token.priceChange24h||0)}
}

export default function Terminal(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const {values:paperPresets}=usePaperPresets()
  const [tokens,setTokens]=useState<MarketToken[]>([]),[selected,setSelected]=useState<MarketToken|null>(null),[positions,setPositions]=useState<LivePosition[]>([])
  const [account,setAccount]=useState<Account|null>(null),[solUsd,setSolUsd]=useState(0),[userId,setUserId]=useState(''),[viewCount,setViewCount]=useState(0)
  const [query,setQuery]=useState(''),[side,setSide]=useState<Side>('buy'),[amount,setAmount]=useState(.1),[amountMode,setAmountMode]=useState<AmountMode>('sol'),[sellPct,setSellPct]=useState(100)
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[copied,setCopied]=useState(false),[lookupBusy,setLookupBusy]=useState(false)
  const [selectedUpdatedAt,setSelectedUpdatedAt]=useState(0),[receipt,setReceipt]=useState<FillReceipt|null>(null),[instantMode,setInstantMode]=useState(false),[confirmOrders,setConfirmOrders]=useState(false),[statsWindow,setStatsWindow]=useState<StatsWindow>('5m'),[maxSlippagePct,setMaxSlippagePct]=useState(15)
  const [feedSource,setFeedSource]=useState(''),[feedAsOf,setFeedAsOf]=useState(0),[feedWarning,setFeedWarning]=useState('')
  const [tokenRailWidth,setTokenRailWidth]=useState(280),[tradePanelWidth,setTradePanelWidth]=useState(350),[mobilePane,setMobilePane]=useState<MobilePane>('chart')
  const feedBusy=useRef(false),accountBusy=useRef(false)

  const chooseToken=useCallback((token:MarketToken,syncUrl=true,clearFeedback=true)=>{
    setSelected(token);setSelectedUpdatedAt(Date.now());if(clearFeedback){setReceipt(null);setMessage('')}
    if(syncUrl&&typeof window!=='undefined'){const url=new URL(window.location.href);url.searchParams.set('mint',token.mint);window.history.replaceState({},'',`${url.pathname}${url.search}`)}
  },[])

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
      const base=(rows||[]) as unknown as DbPosition[],mints=base.map(r=>r.tokens?.mint_address).filter((m):m is string=>Boolean(m));let liveTokens:MarketToken[]=[]
      if(mints.length){try{const r=await fetch(`/api/market/batch?mints=${encodeURIComponent(mints.join(','))}`,{cache:'no-store'}),j=await r.json();if(r.ok)liveTokens=(j.tokens||[]) as MarketToken[]}catch{}}
      const byMint=new Map(liveTokens.map(t=>[t.mint,t]));setPositions(base.map(row=>({...row,current:row.tokens?.mint_address?byMint.get(row.tokens.mint_address):undefined})))
    }catch(e){setMessage(e instanceof Error?e.message:'PAPER account unavailable')}finally{accountBusy.current=false}
  },[supabase])

  const loadFeed=useCallback(async(force=false)=>{
    if(feedBusy.current||(!force&&typeof document!=='undefined'&&document.hidden))return
    feedBusy.current=true
    try{
      const r=await fetch('/api/market/latest',{cache:'no-store'}),j=await r.json();if(!r.ok)throw new Error(j.error||'Market feed unavailable')
      const list=(j.tokens||[]) as MarketToken[]
      if(list.length)setTokens(list)
      setFeedSource(String(j.source||'market feed'));setFeedAsOf(Number(j.asOf||Date.now()))
      setFeedWarning(j.stale?'Live providers are temporarily limited. Showing the last real snapshot while PAPER retries automatically.':list.length?'':'No live tokens are available right now. PAPER is retrying automatically.')
      const requested=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('mint'):null
      if(requested){const local=list.find(t=>t.mint===requested);if(local)chooseToken(local,false);else if(isMint(requested)){const tr=await fetch(`/api/market/token/${encodeURIComponent(requested)}`,{cache:'no-store'}),tj=await tr.json();if(tr.ok&&tj.token)chooseToken(tj.token,false)}}else if(list.length){setSelected(cur=>cur?list.find(t=>t.mint===cur.mint)||cur:list[0]);setSelectedUpdatedAt(Number(j.asOf||Date.now()))}
    }catch(e){setFeedWarning((e instanceof Error?e.message:'Market feed unavailable')+' · Retrying automatically.')}finally{feedBusy.current=false}
  },[chooseToken])

  useEffect(()=>{if(!supabase)return;let alive=true;void(async()=>{try{const user=await ensurePaperUser(supabase);if(alive)await loadAccount(user.id,true)}catch(e){if(alive)setMessage(e instanceof Error?e.message:'Could not start PAPER account')}})();void loadFeed(true);const feedId=window.setInterval(()=>void loadFeed(),10000),acctId=window.setInterval(()=>void loadAccount(),12000),onVisible=()=>{if(!document.hidden){void loadFeed(true);void loadAccount(undefined,true)}},onAccount=()=>void loadAccount(undefined,true);document.addEventListener('visibilitychange',onVisible);window.addEventListener('paper:account-changed',onAccount);return()=>{alive=false;clearInterval(feedId);clearInterval(acctId);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('paper:account-changed',onAccount)}},[supabase,loadAccount,loadFeed])
  useEffect(()=>{const saved=Number(localStorage.getItem('paper.quickBuySize')),savedMode=localStorage.getItem('paper.tradeAmountMode'),savedSlip=Number(localStorage.getItem('paper.maxSlippagePct'));if(saved>0)setAmount(saved);if(savedMode==='usd'||savedMode==='sol')setAmountMode(savedMode);if(savedSlip>=.1&&savedSlip<=50)setMaxSlippagePct(savedSlip);setInstantMode(localStorage.getItem('paper.instantMode')==='1');setConfirmOrders(localStorage.getItem('paper.confirmOrders')==='1')},[])
  useEffect(()=>{
    const apply=(event:Event)=>{
      const detail=(event as CustomEvent<{id?:string;value?:number}>).detail
      const value=Number(detail?.value||0)
      if(value>0){setAmountMode('sol');setAmount(value);localStorage.setItem('paper.quickBuySize',String(value));setMobilePane('trade')}
    }
    window.addEventListener('paper:preset',apply)
    return()=>window.removeEventListener('paper:preset',apply)
  },[])
  useEffect(()=>{localStorage.setItem('paper.tradeAmountMode',amountMode);if(amountMode==='sol')localStorage.setItem('paper.quickBuySize',String(amount));localStorage.setItem('paper.maxSlippagePct',String(maxSlippagePct))},[amountMode,amount,maxSlippagePct])
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('paper.terminal.workspace.v1')||'{}');if(Number(saved.tokenRailWidth)>=220&&Number(saved.tokenRailWidth)<=420)setTokenRailWidth(Number(saved.tokenRailWidth));if(Number(saved.tradePanelWidth)>=300&&Number(saved.tradePanelWidth)<=520)setTradePanelWidth(Number(saved.tradePanelWidth));if(['chart','trade','positions','info'].includes(saved.mobilePane))setMobilePane(saved.mobilePane)}catch{}},[])
  useEffect(()=>{localStorage.setItem('paper.terminal.workspace.v1',JSON.stringify({tokenRailWidth,tradePanelWidth,mobilePane,statsWindow,side,sellPct}))},[tokenRailWidth,tradePanelWidth,mobilePane,statsWindow,side,sellPct])
  useEffect(()=>{if(!selected)return;let alive=true;const refresh=async()=>{if(document.hidden)return;try{const r=await fetch(`/api/market/token/${encodeURIComponent(selected.mint)}`,{cache:'no-store'}),j=await r.json();if(r.ok&&j.token&&alive){setSelected(cur=>cur?{...cur,...j.token,description:j.token.description||cur.description,profileUrl:j.token.profileUrl||cur.profileUrl,buyUrl:j.token.buyUrl||cur.buyUrl}:j.token);setSelectedUpdatedAt(Number(j.asOf||Date.now()))}}catch{}};void refresh();const id=window.setInterval(()=>void refresh(),8000);return()=>{alive=false;clearInterval(id)}},[selected?.mint])
  useEffect(()=>{if(!supabase||!selected?.mint||!userId)return;let alive=true;void(async()=>{const key=`paper-view:${selected.mint}`;if(!sessionStorage.getItem(key)){const {error}=await supabase.from('token_view_events').insert({user_id:userId,mint_address:selected.mint});if(!error)sessionStorage.setItem(key,'1')}const {data}=await supabase.from('token_view_totals').select('views').eq('mint_address',selected.mint).maybeSingle();if(alive)setViewCount(Number(data?.views||0))})();return()=>{alive=false}},[supabase,userId,selected?.mint])

  const visible=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return tokens;return tokens.filter(t=>t.symbol.toLowerCase().includes(q)||t.name.toLowerCase().includes(q)||t.mint.toLowerCase().includes(q))},[tokens,query])
  const selectedPosition=selected?positions.find(p=>p.tokens?.mint_address===selected.mint):undefined
  const dataAgeMs=selectedUpdatedAt?Date.now()-selectedUpdatedAt:Number.MAX_SAFE_INTEGER,dataStatus=dataAgeMs<=5000?'LIVE':dataAgeMs<=10000?'DEGRADED':'STALE'
  const cash=Number(account?.cash_usd||0),nativeEquivalent=solUsd>0?cash/solUsd:0,buySol=amountMode==='sol'?amount:(solUsd>0?amount/solUsd:0),buyUsd=amountMode==='usd'?amount:amount*solUsd,estimatedFee=buyUsd*.01,totalDebit=buyUsd+estimatedFee
  const activeStats=statsFor(selected,statsWindow),txCount=activeStats.buys+activeStats.sells,buyPressure=txCount?activeStats.buys/txCount*100:0,liquidityRatio=selected?.marketCap?selected.liquidityUsd/selected.marketCap*100:0
  const description=selected?.description?.trim()||(selected?`$${selected.symbol} is trading on ${selected.dexId||'a Solana DEX'} with ${money(selected.marketCap)} market cap and ${money(selected.liquidityUsd)} liquidity. Current activity shows ${money(Number(selected.volume5m||0))} in observed 5-minute volume. No verified project description was supplied by the current market source.`:'')
  const presets=amountMode==='sol'?paperPresets:[10,25,50,100],canBuy=Boolean(selected&&buySol>0&&solUsd>0&&totalDebit<=cash&&dataStatus!=='STALE')

  async function searchToken(e?:FormEvent){e?.preventDefault();const q=query.trim();if(!q)return;setLookupBusy(true);setMessage('');try{const local=tokens.find(t=>t.mint===q||t.symbol.toLowerCase()===q.toLowerCase()||t.name.toLowerCase()===q.toLowerCase());if(local){chooseToken(local);return}if(!isMint(q)){setMessage('No exact live match. Paste a Solana contract address for direct lookup.');return}const r=await fetch(`/api/market/token/${encodeURIComponent(q)}`,{cache:'no-store'}),j=await r.json();if(!r.ok||!j.token)throw new Error(j.error||'Token found, but no supported active market was detected.');chooseToken(j.token)}catch(e2){setMessage(e2 instanceof Error?e2.message:'Token lookup failed')}finally{setLookupBusy(false)}}

  async function executeTrade(target=selected,action=side){
    if(!target||!supabase||!userId)return
    if(action==='buy'&&(!buySol||buySol<=0))return
    if(action==='buy'&&totalDebit>cash){setMessage('Not enough PAPER buying power for this order and estimated fee.');return}
    if(action==='sell'&&(!selectedPosition||target.mint!==selected?.mint)){setMessage('No open PAPER position for this token.');return}
    if(target.mint===selected?.mint&&dataStatus==='STALE'){setMessage('Live pricing is stale. New PAPER orders are temporarily paused.');return}
    if(confirmOrders&&!instantMode&&!window.confirm('Confirm PAPER '+action.toUpperCase()+' for '+target.symbol+'? This is simulated only.'))return
    setBusy(true);setMessage('');setReceipt(null)
    try{
      const idempotencyKey=crypto.randomUUID(),body=action==='buy'?{mint:target.mint,side:'buy',amountSol:buySol,idempotencyKey,maxSlippagePct}:{mint:target.mint,side:'sell',sellPct,idempotencyKey,maxSlippagePct}
      const {data,error}=await supabase.functions.invoke('paper-trade',{body});if(error)throw error;if(data?.error)throw new Error(data.error)
      const fill=data.fill||{},market=data.market||{},result=data.account||{}
      chooseToken(target,true,false)
      setReceipt({side:action,symbol:target.symbol,amountUsd:Number(fill.requestedAmountUsd||result.gross_usd||0),referencePrice:Number(market.referencePriceUsd||0),executionReferencePrice:Number(market.executionReferencePriceUsd||0),fillPrice:Number(fill.simulatedFillPriceUsd||0),impactPct:Number(fill.priceImpactPct||0),totalSlippagePct:Number(fill.totalSlippagePct||0),marketMovePct:Number(market.marketMovePct||0),latencyMs:Number(market.simulatedLatencyMs||0),maxSlippagePct:Number(market.maxSlippagePct||maxSlippagePct),feeUsd:Number(fill.paperFeeUsd||0),quality:String(fill.executionQuality||'estimated'),ageMs:Number(market.marketDataAgeMs||0),orderId:String(result.order_id||''),replayed:Boolean(result.replayed)})
      setMessage(`${action==='buy'?'PAPER BUY':'PAPER SELL'} FILLED`);await loadAccount(userId,true);window.dispatchEvent(new Event('paper:account-changed'))
    }catch(e){setMessage(e instanceof Error?e.message:'PAPER order rejected')}finally{setBusy(false)}
  }

  async function instantBuy(token:MarketToken){if(!instantMode||busy)return;await executeTrade(token,'buy')}
  function toggleInstant(){if(!instantMode&&!window.confirm('Instant Mode lets the lightning button submit a PAPER buy immediately using your current buy amount. PAPER only — no real trade is submitted.'))return;const next=!instantMode;setInstantMode(next);localStorage.setItem('paper.instantMode',next?'1':'0')}
  function toggleConfirm(){const next=!confirmOrders;setConfirmOrders(next);localStorage.setItem('paper.confirmOrders',next?'1':'0')}
  async function copyMint(){if(!selected)return;try{await navigator.clipboard.writeText(selected.mint);setCopied(true);setTimeout(()=>setCopied(false),1000)}catch{}}

  function beginPanelResize(kind:'token'|'trade',event:ReactPointerEvent<HTMLButtonElement>){
    if(typeof window==='undefined'||window.innerWidth<=900)return
    event.preventDefault()
    const startX=event.clientX,startValue=kind==='token'?tokenRailWidth:tradePanelWidth
    const move=(e:PointerEvent)=>{
      const delta=e.clientX-startX
      if(kind==='token')setTokenRailWidth(Math.max(220,Math.min(420,startValue+delta)))
      else setTradePanelWidth(Math.max(300,Math.min(520,startValue-delta)))
    }
    const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)}
    window.addEventListener('pointermove',move)
    window.addEventListener('pointerup',up,{once:true})
  }

  useEffect(()=>{
    const handler=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement|null
      if(target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.tagName==='SELECT'||target.isContentEditable))return
      const key=event.key.toLowerCase()
      if(key==='b'){setSide('buy');setMobilePane('trade');return}
      if(key==='s'){setSide('sell');setMobilePane('trade');return}
      if(key==='c'){setMobilePane('chart');return}
      if(key==='p'){setMobilePane('positions');return}
      if(key==='i'){setMobilePane('info');return}
      if(['1','2','3','4'].includes(key)){
        const index=Number(key)-1
        if(side==='buy'){const values=amountMode==='sol'?[.01,.1,.5,1]:[10,25,50,100];setAmount(values[index])}
        else setSellPct([25,50,75,100][index])
        return
      }
      if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();if(!busy)void executeTrade()}
    }
    window.addEventListener('keydown',handler)
    return()=>window.removeEventListener('keydown',handler)
  },[side,amountMode,busy,selected?.mint,sellPct,canBuy])

  return <div className="ax-app"><AppHeader active="spot"/><nav className="mobile-terminal-tabs"><button className={mobilePane==='chart'?'active':''} onClick={()=>setMobilePane('chart')}>Chart</button><button className={mobilePane==='trade'?'active':''} onClick={()=>setMobilePane('trade')}>Trade</button><button className={mobilePane==='positions'?'active':''} onClick={()=>setMobilePane('positions')}>Positions</button><button className={mobilePane==='info'?'active':''} onClick={()=>setMobilePane('info')}>Info</button></nav><main data-mobile-pane={mobilePane} className="spot-detail phase1-terminal parts23-terminal" style={{'--paper-token-rail':tokenRailWidth+'px','--paper-trade-panel':tradePanelWidth+'px'} as CSSProperties}>
    <aside className="spot-token-list p23-token-rail"><form className="spot-search p23-search" onSubmit={searchToken}><Search size={13}/><input placeholder="Search ticker, name or CA" value={query} onChange={e=>setQuery(e.target.value)}/><button type="submit" disabled={lookupBusy}>{lookupBusy?'…':'Go'}</button></form><div className="spot-list-head"><span>LIVE MEMECOINS</span><span>{visible.length}</span></div><div className="token-list">{!visible.length&&<div className="portfolio-empty">Market data is temporarily unavailable. PAPER is retrying automatically. <button onClick={()=>void loadFeed(true)}>Retry now</button></div>}{visible.map(t=><div key={t.mint} role="button" tabIndex={0} className={`token-row-shell ${selected?.mint===t.mint?'selected':''}`} onClick={()=>chooseToken(t)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseToken(t)}}}><div className="token-avatar">{t.image?<img src={t.image} alt="" loading="lazy" decoding="async"/>:t.symbol.slice(0,2)}</div><div className="token-copy"><div className="token-line"><b>${t.symbol}</b><span>{t.name}</span></div><div className="token-sub"><span>MC {money(t.marketCap)}</span><span>LQ {money(t.liquidityUsd)}</span></div></div><div className="token-price"><b>{money(t.priceUsd)}</b><span className={Number(t.priceChange5m||0)>=0?'gain':'loss'}>{pct(Number(t.priceChange5m||0))}</span></div>{instantMode&&<button className="row-instant-buy" title={`Instant PAPER buy ${amountMode==='sol'?`${amount} SOL`:money(amount)}`} disabled={busy||!solUsd} onClick={e=>{e.stopPropagation();void instantBuy(t)}}><Zap size={12}/></button>}</div>)}</div><div className="rail-feed-status"><i/><span>{feedWarning?'RECONNECTING':feedSource||'market feed'}</span><small>{feedAsOf?new Date(feedAsOf).toLocaleTimeString():''}</small></div></aside>

    <button className="paper-panel-resizer token-resizer" aria-label="Resize token list" onPointerDown={e=>beginPanelResize('token',e)}/><section className="spot-market p23-market"><div className="token-head p23-token-head">{selected?<><div className="token-avatar large">{selected.image?<img src={selected.image} alt="" decoding="async"/>:selected.symbol.slice(0,2)}</div><div className="p23-token-identity"><div className="token-title">${selected.symbol}<span>{selected.name}</span></div><div className="token-link-row"><button className="mint-button" onClick={()=>void copyMint()}><Copy size={10}/>{copied?'Copied':short(selected.mint)}</button><span className="venue-pill">{selected.dexId||'Solana'}</span>{selected.website&&<a href={selected.website} target="_blank" rel="noreferrer"><Globe2 size={11}/> Web</a>}{selected.twitter&&<a href={selected.twitter} target="_blank" rel="noreferrer">X</a>}{selected.telegram&&<a href={selected.telegram} target="_blank" rel="noreferrer"><MessageCircle size={11}/> TG</a>}</div></div><div className="spacer"/><div className="headline-stat"><small>VIEWS</small><b className="view-stat"><Eye size={12}/>{viewCount.toLocaleString()}</b></div><div className="headline-stat"><small>PRICE</small><b>{money(selected.priceUsd)}</b></div><div className="headline-stat"><small>5M</small><b className={Number(selected.priceChange5m||0)>=0?'gain':'loss'}>{pct(Number(selected.priceChange5m||0))}</b></div><div className="headline-stat"><small>MC</small><b>{money(selected.marketCap)}</b></div><span className={`data-health ${dataStatus.toLowerCase()}`}>{dataStatus}</span></>:<span>Select a live memecoin</span>}</div>
      <CandleChart poolAddress={selected?.pairAddress} tokenId={selectedPosition?.token_id} currentPrice={selected?.priceUsd} currentMarketCap={selected?.marketCap} currentSolUsd={solUsd} averageEntryPrice={selectedPosition?Number(selectedPosition.average_entry_price_usd):undefined} averageEntryMarketCap={selectedPosition?Number(selectedPosition.average_entry_mc_usd||0):undefined} symbol={selected?.symbol} venue={selected?.dexId}/>
      <div className="metric-strip p23-metric-strip">{[['Market Cap',selected?money(selected.marketCap):'—'],['Liquidity',selected?money(selected.liquidityUsd):'—'],['Supply',selected&&selected.priceUsd>0?(selected.marketCap/selected.priceUsd).toLocaleString(undefined,{maximumFractionDigits:0}):'—'],['5m Volume',selected?money(Number(selected.volume5m||0)):'—'],['1h Volume',selected?money(Number(selected.volume1h||0)):'—'],['24h Volume',selected?money(Number(selected.volume24h||0)):'—'],['24h TXNS',selected?String(Number(selected.buys24h||0)+Number(selected.sells24h||0)):'—'],['Age',selected?age(selected.pairCreatedAt):'—']].map(([l,v])=><div className="metric" key={l}><small>{l}</small><b>{v}</b></div>)}</div>
      {selected&&<section className="token-intel-card"><div className="token-intel-head"><div><Info size={15}/><span><b>ABOUT ${selected.symbol}</b><small>Verified links + live market context</small></span></div>{(selected.buyUrl||selected.pairUrl)&&<a className="real-market-link" href={selected.buyUrl||selected.pairUrl} target="_blank" rel="noreferrer">OPEN REAL MARKET <ExternalLink size={12}/></a>}</div><p>{description}</p><div className="token-intel-grid"><span><small>CHAIN</small><b>Solana</b></span><span><small>VENUE</small><b>{selected.dexId||'—'}</b></span><span><small>PAIR AGE</small><b>{age(selected.pairCreatedAt)}</b></span><span><small>LIQ / MC</small><b>{selected.marketCap?`${liquidityRatio.toFixed(1)}%`:'—'}</b></span><span><small>1H VOL</small><b>{money(Number(selected.volume1h||0))}</b></span><span><small>24H VOL</small><b>{money(Number(selected.volume24h||0))}</b></span><span><small>24H TXNS</small><b>{Number(selected.buys24h||0)+Number(selected.sells24h||0)}</b></span><span><small>BOOSTS</small><b>{Number(selected.boostsActive||0)||'—'}</b></span></div><div className="token-intel-foot"><ShieldCheck size={13}/><span>No holder, tax, mint-authority, sniper, or bundle score is shown unless a verified data source supports it.</span><Link href={'/token/'+selected.mint+'/intelligence'}>HOLDER MAP + LIFECYCLE →</Link></div></section>}
      {selected&&<TokenRiskPanel mint={selected.mint}/>}
      <div className="detail-data-grid p23-detail-grid"><MarketTape poolAddress={selected?.pairAddress}/><div className="positions-panel"><div className="positions-title"><span>OPEN PAPER POSITIONS</span><span>{money(cash)} available</span></div><div className="pos-head"><span>Token</span><span>Cost</span><span>Entry MC</span><span>Current MC</span><span>PAPER ROI</span></div>{!positions.length?<div className="loading">No open PAPER positions yet.</div>:positions.map(p=>{const current=p.current?.priceUsd||Number(p.average_entry_price_usd),roi=(current/Number(p.average_entry_price_usd)-1)*100;return <button className="pos-row" key={p.id} onClick={()=>{const token=tokens.find(t=>t.mint===p.tokens?.mint_address);if(token)chooseToken(token)}}><b>${p.tokens?.ticker||'MEME'}</b><span>{money(Number(p.cost_basis_usd||0))}</span><span>{money(Number(p.average_entry_mc_usd||0))}</span><span>{money(p.current?.marketCap||0)}</span><span className={roi>=0?'gain':'loss'}>{pct(roi)}</span></button>})}</div></div>
    </section>

    <button className="paper-panel-resizer trade-resizer" aria-label="Resize trade panel" onPointerDown={e=>beginPanelResize('trade',e)}/><aside className="spot-trade-panel axiom-paper-trade p23-trade-panel"><div className="trade-window-tabs">{(['1m','5m','1h','6h','24h'] as StatsWindow[]).map(w=><button key={w} className={statsWindow===w?'active':''} onClick={()=>setStatsWindow(w)}>{w}</button>)}</div><div className="trade-stats-top"><span><small>{activeStats.label} Vol</small><b>{activeStats.ready?money(activeStats.volume):'warming'}</b></span><span><small>Buys</small><b className="gain">{activeStats.ready?activeStats.buys:'—'}</b></span><span><small>Sells</small><b className="loss">{activeStats.ready?activeStats.sells:'—'}</b></span><span><small>Change</small><b className={activeStats.change>=0?'gain':'loss'}>{activeStats.ready?pct(activeStats.change):'—'}</b></span></div><div className="panel-body"><div className="side-switch"><button className={side==='buy'?'buy':''} onClick={()=>setSide('buy')}>Buy</button><button className={side==='sell'?'sell':''} onClick={()=>setSide('sell')}>Sell</button></div><div className="trade-mode-row"><div className="market-mode"><Activity size={12}/><b>Market</b></div><button className={`instant-toggle ${instantMode?'on':''}`} onClick={toggleInstant}><Zap size={12}/> Instant {instantMode?'ON':'OFF'}</button><button className={`confirm-toggle ${confirmOrders?'on':''}`} onClick={toggleConfirm}>Confirm {confirmOrders?'ON':'OFF'}</button><span>{money(cash)} PAPER</span></div><AdvancedOrderPanel token={selected} side={side} amountSol={buySol} sellPct={sellPct} hasPosition={Boolean(selectedPosition)} onChanged={()=>window.dispatchEvent(new Event('paper:account-changed'))}/><div className="slippage-control"><label>MAX SLIPPAGE</label><div>{[1,5,15,30].map(v=><button key={v} className={maxSlippagePct===v?'active':''} onClick={()=>setMaxSlippagePct(v)}>{v}%</button>)}<input aria-label="Custom max slippage" type="number" min="0.1" max="50" step="0.1" value={maxSlippagePct} onChange={e=>setMaxSlippagePct(Math.max(.1,Math.min(50,Number(e.target.value)||15)))}/></div><small>Live requote + constant-product fill model can reject the PAPER order if this cap is exceeded.</small></div>
      {side==='buy'?<><div className="trade-label-row"><label>AMOUNT</label><span>{solUsd?`${money(buyUsd)} PAPER`:'SOL price loading…'}</span></div><div className="amount-with-symbol p23-amount"><input className="amount" type="number" min={amountMode==='sol'?'.001':'1'} step={amountMode==='sol'?'.001':'1'} value={amount} onChange={e=>setAmount(Math.max(amountMode==='sol'?.001:1,Number(e.target.value)||0))}/><div className="amount-mode"><button className={amountMode==='sol'?'active':''} onClick={()=>setAmountMode('sol')}>SOL</button><button className={amountMode==='usd'?'active':''} onClick={()=>setAmountMode('usd')}>$</button></div></div><div className="preset-grid">{presets.map(v=><button key={v} className={`preset ${amount===v?'selected':''}`} onClick={()=>setAmount(v)}>{amountMode==='usd'?`$${v}`:v}</button>)}</div><div className="trade-estimate-card"><div><span>PAPER buying power</span><b>{money(cash)}</b></div><div><span>Order notional</span><b>{money(buyUsd)}</b></div><div><span>Est. PAPER fee</span><b>{money(estimatedFee)}</b></div><div><span>Est. total debit</span><b>{money(totalDebit)}</b></div></div></>:<><div className="trade-label-row"><label>SELL POSITION</label><span>{selectedPosition?`${Number(selectedPosition.quantity_tokens).toLocaleString()} tokens`:'No position'}</span></div><div className="preset-grid sell-presets">{[25,50,75,100].map(v=><button key={v} className={`preset ${sellPct===v?'selected':''}`} onClick={()=>setSellPct(v)}>{v}%</button>)}</div>{selectedPosition&&<div className="trade-estimate-card"><div><span>Cost basis</span><b>{money(Number(selectedPosition.cost_basis_usd||0))}</b></div><div><span>Entry price</span><b>{money(Number(selectedPosition.average_entry_price_usd))}</b></div><div><span>Entry MC</span><b>{money(Number(selectedPosition.average_entry_mc_usd||0))}</b></div><div><span>Sell size</span><b>{sellPct}%</b></div></div>}</>}
      <button className={`paper-buy p23-primary-trade ${side==='sell'?'paper-sell':''}`} disabled={busy||!selected||(side==='buy'&&!canBuy)||(side==='sell'&&!selectedPosition)||dataStatus==='STALE'} onClick={()=>void executeTrade()}>{busy?'CHECKING LIVE MARKET…':`${instantMode?'INSTANT ':''}${side==='buy'?'BUY':'SELL'} ${selected?`$${selected.symbol}`:'TOKEN'} · PAPER`}</button><div className="trade-safety-line"><span className={`data-dot ${dataStatus.toLowerCase()}`}/><b>{dataStatus}</b><span>Simulated only · no blockchain transaction</span></div>{dataStatus==='STALE'&&<div className="trade-message loss">Live pricing is stale. New PAPER orders are paused until fresh data returns. <button onClick={()=>void loadFeed(true)}>Retry market data</button></div>}{message&&<div className={`trade-message ${/rejected|error|unavailable|not enough|no open/i.test(message)?'loss':''}`}>{message}</div>}
      {receipt&&<div className="fill-receipt p23-receipt"><div className="fill-receipt-head"><b>{receipt.replayed?'PAPER ORDER REPLAYED':`PAPER ${receipt.side.toUpperCase()} FILLED`}</b><span>{receipt.quality.toUpperCase()}</span></div><dl><div><dt>Notional</dt><dd>{money(receipt.amountUsd)}</dd></div><div><dt>Reference</dt><dd>{money(receipt.referencePrice)}</dd></div><div><dt>Simulated fill</dt><dd>{money(receipt.fillPrice)}</dd></div><div><dt>Impact</dt><dd>{receipt.impactPct.toFixed(3)}%</dd></div><div><dt>Total slippage</dt><dd>{Number(receipt.totalSlippagePct||0).toFixed(3)}%</dd></div><div><dt>Sim latency</dt><dd>{Math.round(Number(receipt.latencyMs||0))} ms</dd></div><div><dt>PAPER fee</dt><dd>{money(receipt.feeUsd)}</dd></div><div><dt>Data age</dt><dd>{(receipt.ageMs/1000).toFixed(2)}s</dd></div></dl>{receipt.orderId&&<div className="receipt-order">Order {short(receipt.orderId)}</div>}</div>}
      <div className="pressure-meter"><div className="pressure-label"><span>Buy pressure · {activeStats.label}</span><b>{activeStats.ready?`${buyPressure.toFixed(0)}%`:'warming'}</b></div><div className="pressure-track"><i style={{width:`${activeStats.ready?buyPressure:50}%`}}/></div></div><div className="trade-account-footer"><span><small>PAPER cash</small><b>{money(cash)}</b></span><span><small>SOL equivalent</small><b>{solUsd?`${nativeEquivalent.toFixed(3)} SOL`:'—'}</b></span><span><small>Open positions</small><b>{positions.length}</b></span></div>{(selected?.buyUrl||selected?.pairUrl)&&<a className="trade-real-link" href={selected.buyUrl||selected.pairUrl} target="_blank" rel="noreferrer">Open real market <ExternalLink size={11}/></a>}</div></aside>
  </main><BottomDock active="spot"/></div>
}
