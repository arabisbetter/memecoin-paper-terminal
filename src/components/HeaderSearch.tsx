'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import type { MarketToken } from '@/lib/types'

type HistoryItem={mint:string;symbol:string;name:string;image?:string;marketCap:number;pairCreatedAt?:number;lastViewedAt:number}
const LOCAL_KEY='paper.searchHistory.v2'
const isMint=(s:string)=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim())
const money=(n:number)=>!Number.isFinite(n)?'—':n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(n>=1?2:6)
const age=(created?:number)=>{if(!created)return'—';const min=Math.max(0,Math.floor((Date.now()-created)/60000));if(min<1)return'<1m';if(min<60)return min+'m';const h=Math.floor(min/60);if(h<48)return h+'h';return Math.floor(h/24)+'d'}
function readLocal():HistoryItem[]{try{const rows=JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]');return Array.isArray(rows)?rows.slice(0,20):[]}catch{return[]}}
function writeLocal(rows:HistoryItem[]){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(rows.slice(0,20)))}catch{}}

export default function HeaderSearch(){
  const router=useRouter(),wrap=useRef<HTMLDivElement|null>(null),input=useRef<HTMLInputElement|null>(null)
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[tokens,setTokens]=useState<MarketToken[]>([]),[history,setHistory]=useState<HistoryItem[]>([]),[loading,setLoading]=useState(false)

  async function loadMarket(){if(tokens.length)return;setLoading(true);try{const r=await fetch('/api/market/latest',{cache:'no-store'}),j=await r.json();if(r.ok)setTokens((j.tokens||[]).slice(0,100))}catch(error){console.error('paper_search_market_error',error)}finally{setLoading(false)}}
  async function loadHistory(){
    const local=readLocal();setHistory(local)
    if(!supabase)return
    try{
      const user=await ensurePaperUser(supabase)
      const {data,error}=await (supabase as any).from('paper_search_history').select('token_address,token_symbol,token_name,token_image,market_cap_usd,pair_created_at,last_viewed_at').eq('user_id',user.id).order('last_viewed_at',{ascending:false}).limit(20)
      if(error)throw error
      const rows:HistoryItem[]=(data||[]).map((row:any)=>({mint:String(row.token_address),symbol:String(row.token_symbol||'TOKEN'),name:String(row.token_name||row.token_symbol||'Token'),image:row.token_image||undefined,marketCap:Number(row.market_cap_usd||0),pairCreatedAt:row.pair_created_at?Number(row.pair_created_at):undefined,lastViewedAt:Date.parse(String(row.last_viewed_at||''))||Date.now()}))
      setHistory(rows);writeLocal(rows)
    }catch(error){console.error('paper_search_history_load_error',error)}
  }
  async function remember(token:Pick<MarketToken,'mint'|'symbol'|'name'|'image'|'marketCap'|'pairCreatedAt'>){
    const item:HistoryItem={mint:token.mint,symbol:token.symbol,name:token.name,image:token.image,marketCap:Number(token.marketCap||0),pairCreatedAt:token.pairCreatedAt,lastViewedAt:Date.now()}
    const rows=[item,...readLocal().filter(x=>x.mint!==item.mint)].slice(0,20);writeLocal(rows);setHistory(rows)
    if(!supabase)return
    try{
      const user=await ensurePaperUser(supabase)
      const {error}=await (supabase as any).from('paper_search_history').upsert({user_id:user.id,token_address:item.mint,token_symbol:item.symbol,token_name:item.name,token_image:item.image||null,market_cap_usd:item.marketCap,pair_created_at:item.pairCreatedAt||null,last_viewed_at:new Date().toISOString()},{onConflict:'user_id,token_address'})
      if(error)throw error
      const {data:extra}=await (supabase as any).from('paper_search_history').select('id').eq('user_id',user.id).order('last_viewed_at',{ascending:false}).range(20,80)
      const ids=(extra||[]).map((x:any)=>x.id).filter(Boolean);if(ids.length)await (supabase as any).from('paper_search_history').delete().in('id',ids)
    }catch(error){console.error('paper_search_history_save_error',error)}
  }
  async function clearHistory(){writeLocal([]);setHistory([]);if(!supabase)return;try{const user=await ensurePaperUser(supabase);await (supabase as any).from('paper_search_history').delete().eq('user_id',user.id)}catch(error){console.error('paper_search_history_clear_error',error)}}
  function openToken(token:Pick<MarketToken,'mint'|'symbol'|'name'|'image'|'marketCap'|'pairCreatedAt'>){void remember(token);setOpen(false);setQuery('');router.push('/spot?mint='+encodeURIComponent(token.mint))}
  const q=query.trim().toLowerCase()
  const filtered=useMemo(()=>tokens.filter(t=>!q||t.symbol.toLowerCase().includes(q)||t.name.toLowerCase().includes(q)||t.mint.toLowerCase().includes(q)).slice(0,10),[tokens,q])
  const historyRows=useMemo(()=>history.map(h=>tokens.find(t=>t.mint===h.mint)||({mint:h.mint,symbol:h.symbol,name:h.name,image:h.image,marketCap:h.marketCap,pairCreatedAt:h.pairCreatedAt} as MarketToken)).slice(0,15),[history,tokens])
  const rows=q?filtered:historyRows
  async function onEnter(){const term=query.trim(),first=filtered[0];if(first){openToken(first);return}if(!isMint(term))return;setLoading(true);try{const r=await fetch('/api/market/token/'+encodeURIComponent(term),{cache:'no-store'}),j=await r.json();if(r.ok&&j.token)openToken(j.token)}catch(error){console.error('paper_search_ca_error',error)}finally{setLoading(false)}}
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setOpen(true);requestAnimationFrame(()=>input.current?.focus())}if(event.key==='Escape')setOpen(false)}
    const outside=(event:PointerEvent)=>{if(wrap.current&&!wrap.current.contains(event.target as Node))setOpen(false)}
    window.addEventListener('keydown',key);window.addEventListener('pointerdown',outside)
    return()=>{window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',outside)}
  },[])

  return <div className="header-token-search" ref={wrap}>
    <div className={'header-search-input '+(open?'open':'')}><Search size={15}/><input ref={input} aria-label="Search tokens" value={query} placeholder="Search token or CA" onFocus={()=>{setOpen(true);void loadMarket();void loadHistory()}} onChange={e=>{setQuery(e.target.value);if(!open)setOpen(true)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void onEnter()}}}/><kbd>⌘K</kbd></div>
    {open&&<div className="header-search-dropdown">
      <div className="header-search-section-title"><span>{q?'TOKENS':'RECENT'}</span>{!q&&history.length>0&&<button type="button" onClick={()=>void clearHistory()}>Clear history</button>}</div>
      {loading&&!rows.length&&<div className="header-search-empty">Loading live markets…</div>}
      {!loading&&!rows.length&&<div className="header-search-empty">{q&&isMint(query)?'Press Enter to open this contract address.':q?'No matching live token.':'No search history yet.'}</div>}
      <div className="header-search-results">{rows.map(item=><Link key={item.mint} href={'/spot?mint='+encodeURIComponent(item.mint)} onClick={e=>{e.preventDefault();openToken(item)}}><span className="search-token-image">{item.image?<img src={item.image} alt=""/>:<b>{item.symbol.slice(0,2)}</b>}</span><span className="search-token-copy"><b>{'$'+item.symbol}</b><small>{item.name}</small></span><span className="search-token-meta"><b>{money(Number(item.marketCap||0))}</b><small>{age(item.pairCreatedAt)}</small></span></Link>)}</div>
    </div>}
  </div>
}
