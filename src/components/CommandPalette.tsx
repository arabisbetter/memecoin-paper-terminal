'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, Command, Crosshair, History, Search, Star, WalletCards, Zap } from 'lucide-react'
import type { MarketToken } from '@/lib/types'

type Action={id:string;label:string;hint:string;href:string;icon:'trade'|'pulse'|'portfolio'|'wallets'|'watchlist'|'replay'}
const actions:Action[]=[
  {id:'trade',label:'Trade terminal',hint:'Open Spot',href:'/spot',icon:'trade'},
  {id:'pulse',label:'Pulse',hint:'New pairs · trending · migrated',href:'/pulse',icon:'pulse'},
  {id:'portfolio',label:'Portfolio analytics',hint:'P&L · equity · fills',href:'/portfolio',icon:'portfolio'},
  {id:'wallets',label:'Wallet intelligence',hint:'Track a Solana wallet',href:'/wallets',icon:'wallets'},
  {id:'watchlist',label:'Watchlists & alerts',hint:'Price alerts',href:'/watchlist',icon:'watchlist'},
  {id:'replay',label:'Trade replay',hint:'Practice historical launches',href:'/replay',icon:'replay'},
]
const icon=(kind:Action['icon'])=>kind==='pulse'?<Zap size={15}/>:kind==='portfolio'?<BarChart3 size={15}/>:kind==='wallets'?<WalletCards size={15}/>:kind==='watchlist'?<Star size={15}/>:kind==='replay'?<History size={15}/>:<Crosshair size={15}/>
const isMint=(s:string)=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim())

export default function CommandPalette(){
  const router=useRouter()
  const inputRef=useRef<HTMLInputElement|null>(null)
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[tokens,setTokens]=useState<MarketToken[]>([]),[active,setActive]=useState(0)

  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setOpen(v=>!v)}
      if(event.key==='Escape')setOpen(false)
    }
    window.addEventListener('keydown',key)
    return()=>window.removeEventListener('keydown',key)
  },[])
  useEffect(()=>{if(open){setActive(0);requestAnimationFrame(()=>inputRef.current?.focus());void fetch('/api/market/latest',{cache:'no-store'}).then(r=>r.json()).then(j=>setTokens((j.tokens||[]).slice(0,80))).catch(()=>{})}},[open])
  useEffect(()=>{if(!open){setQuery('');setActive(0)}},[open])

  const results=useMemo(()=>{
    const q=query.trim().toLowerCase()
    const nav=actions.filter(a=>!q||a.label.toLowerCase().includes(q)||a.hint.toLowerCase().includes(q))
    const market=tokens.filter(t=>!q||t.symbol.toLowerCase().includes(q)||t.name.toLowerCase().includes(q)||t.mint.toLowerCase().includes(q)).slice(0,8)
    const rows=[
      ...nav.map(a=>({id:'action:'+a.id,label:a.label,hint:a.hint,href:a.href,icon:icon(a.icon)})),
      ...market.map(t=>({id:'token:'+t.mint,label:'$'+t.symbol,hint:t.name+' · MC $'+Math.round(t.marketCap).toLocaleString(),href:'/spot?mint='+encodeURIComponent(t.mint),icon:<Search size={15}/>})),
    ]
    if(isMint(query)&&!market.some(t=>t.mint===query.trim()))rows.unshift({id:'ca:'+query.trim(),label:'Open contract address',hint:query.trim(),href:'/spot?mint='+encodeURIComponent(query.trim()),icon:<Search size={15}/>})
    return rows
  },[query,tokens])

  function go(href:string){setOpen(false);router.push(href)}
  function onKey(event:React.KeyboardEvent<HTMLInputElement>){
    if(event.key==='ArrowDown'){event.preventDefault();setActive(v=>Math.min(results.length-1,v+1))}
    if(event.key==='ArrowUp'){event.preventDefault();setActive(v=>Math.max(0,v-1))}
    if(event.key==='Enter'&&results[active]){event.preventDefault();go(results[active].href)}
  }

  return <>
    <button className="paper-command-trigger" onClick={()=>setOpen(true)} title="Command palette"><Command size={13}/><span>Search</span><kbd>⌘K</kbd></button>
    {open&&<div className="paper-command-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <div className="paper-command-palette">
        <div className="paper-command-input"><Search size={16}/><input ref={inputRef} value={query} onChange={e=>{setQuery(e.target.value);setActive(0)}} onKeyDown={onKey} placeholder="Search token, CA, wallet tools, replay…"/><kbd>ESC</kbd></div>
        <div className="paper-command-results">{results.length?results.map((row,index)=><button key={row.id} className={index===active?'active':''} onMouseEnter={()=>setActive(index)} onClick={()=>go(row.href)}><span>{row.icon}</span><div><b>{row.label}</b><small>{row.hint}</small></div><em>↵</em></button>):<div className="paper-command-empty">No match. Paste a Solana contract address to open it directly.</div>}</div>
        <div className="paper-command-foot"><span>↑↓ navigate</span><span>↵ open</span><span>⌘K toggle</span></div>
      </div>
    </div>}
  </>
}
