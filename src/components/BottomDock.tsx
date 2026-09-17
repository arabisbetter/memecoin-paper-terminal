'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { BarChart3, BriefcaseBusiness, CircleDollarSign, CircleUserRound, Gift, Gauge, Layers3, Radio, Settings2, SlidersHorizontal, Star, Trophy, WalletCards } from 'lucide-react'
import PaperAccountChip from '@/components/PaperAccountChip'

type Active='discover'|'spot'|'evaluation'|'pulse'|'portfolio'|'leaderboard'|'profile'|'coin'|'wallets'|'rewards'|'chains'|'watchlist'
const presetValues:[string,number][]=[['P1',0.1],['P2',0.5],['P3',1]]

export default function BottomDock({active}:{active:Active}){
  const pathname=usePathname()
  const currentActive:Active=pathname.startsWith('/discover')?'discover':pathname.startsWith('/spot')?'spot':pathname.startsWith('/evaluation')?'evaluation':pathname.startsWith('/pulse')?'pulse':pathname.startsWith('/portfolio')?'portfolio':pathname.startsWith('/leaderboards')?'leaderboard':pathname.startsWith('/profile')?'profile':pathname.startsWith('/coin')?'coin':pathname.startsWith('/wallets')?'wallets':pathname.startsWith('/rewards')?'rewards':pathname.startsWith('/chains')?'chains':pathname.startsWith('/watchlist')?'watchlist':active
  const [open,setOpen]=useState(false),[preset,setPreset]=useState('P1'),wrapRef=useRef<HTMLDivElement|null>(null)
  useEffect(()=>{const saved=localStorage.getItem('paper.quickBuyPreset');if(saved&&presetValues.some(([id])=>id===saved))setPreset(saved)},[])
  useEffect(()=>{if(!open)return;const onPointer=(event:PointerEvent)=>{if(wrapRef.current&&!wrapRef.current.contains(event.target as Node))setOpen(false)},onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};window.addEventListener('pointerdown',onPointer);window.addEventListener('keydown',onKey);return()=>{window.removeEventListener('pointerdown',onPointer);window.removeEventListener('keydown',onKey)}},[open])
  function choose(id:string,value:number){setPreset(id);setOpen(false);localStorage.setItem('paper.quickBuyPreset',id);localStorage.setItem('paper.quickBuySize',String(value));window.dispatchEvent(new CustomEvent('paper:preset',{detail:{id,value}}))}
  return <footer className="ax-bottom-dock final-dock">
    <div className="dock-preset-wrap" ref={wrapRef}><button className="dock-preset" aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(v=>!v)}><SlidersHorizontal size={14}/><b>{preset}</b></button>{open&&<div className="dock-preset-menu" role="menu">{presetValues.map(([id,value])=><button key={id} role="menuitem" className={preset===id?'active':''} onClick={()=>choose(id,value)}><span>{id}</span><b>{value} SOL</b></button>)}</div>}</div>
    <div className="dock-divider"/><Link className={currentActive==='discover'?'active':''} href="/discover"><Gauge size={14}/><span>Markets</span></Link><Link className={currentActive==='spot'?'active':''} href="/spot"><CircleDollarSign size={14}/><span>Trade</span></Link><Link className={currentActive==='evaluation'?'active':''} href="/evaluation"><Trophy size={14}/><span>Evaluation</span></Link><Link className={currentActive==='pulse'?'active':''} href="/pulse"><Radio size={14}/><span>Pulse</span></Link><Link className={currentActive==='chains'?'active':''} href="/chains"><Layers3 size={14}/><span>Chains</span></Link><Link className={currentActive==='portfolio'?'active':''} href="/portfolio"><BriefcaseBusiness size={14}/><span>Portfolio</span></Link><Link className={currentActive==='wallets'?'active':''} href="/wallets"><WalletCards size={14}/><span>Wallets</span></Link><Link className={currentActive==='watchlist'?'active':''} href="/watchlist"><Star size={14}/><span>Watchlist</span></Link><Link className={currentActive==='rewards'?'active':''} href="/rewards"><Gift size={14}/><span>Rewards</span></Link><Link className={currentActive==='leaderboard'?'active':''} href="/leaderboards"><BarChart3 size={14}/><span>Leaderboard</span></Link><Link className={currentActive==='coin'?'active':''} href="/coin"><CircleDollarSign size={14}/><span>Coin</span></Link><Link className={currentActive==='profile'?'active':''} href="/profile"><CircleUserRound size={14}/><span>Profile</span></Link><div className="dock-spacer"/><PaperAccountChip/><span className="dock-live"><i/> LIVE</span><Link href="/profile" title="Settings"><Settings2 size={14}/></Link>
  </footer>
}
