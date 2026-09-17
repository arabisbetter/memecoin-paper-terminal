'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { BarChart3, BriefcaseBusiness, CircleUserRound, Gauge, Radio, Settings2, SlidersHorizontal } from 'lucide-react'

type Active='spot'|'pulse'|'portfolio'|'leaderboard'|'profile'
const presetValues:[string,number][]=[['P1',0.1],['P2',0.5],['P3',1]]

export default function BottomDock({active}:{active:Active}){
  const [open,setOpen]=useState(false)
  const [preset,setPreset]=useState('P1')
  const wrapRef=useRef<HTMLDivElement|null>(null)

  useEffect(()=>{const saved=window.localStorage.getItem('paper.quickBuyPreset');if(saved&&presetValues.some(([id])=>id===saved))setPreset(saved)},[])
  useEffect(()=>{
    if(!open)return
    const onPointer=(event:PointerEvent)=>{if(wrapRef.current&&!wrapRef.current.contains(event.target as Node))setOpen(false)}
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)}
    window.addEventListener('pointerdown',onPointer);window.addEventListener('keydown',onKey)
    return()=>{window.removeEventListener('pointerdown',onPointer);window.removeEventListener('keydown',onKey)}
  },[open])

  function choose(id:string,value:number){setPreset(id);setOpen(false);window.localStorage.setItem('paper.quickBuyPreset',id);window.localStorage.setItem('paper.quickBuySize',String(value));window.dispatchEvent(new CustomEvent('paper:preset',{detail:{id,value}}))}

  return <footer className="ax-bottom-dock">
    <div className="dock-preset-wrap" ref={wrapRef}><button className="dock-preset" aria-expanded={open} aria-haspopup="menu" onClick={()=>setOpen(v=>!v)}><SlidersHorizontal size={14}/><b>{preset}</b></button>{open&&<div className="dock-preset-menu" role="menu">{presetValues.map(([id,value])=><button key={id} role="menuitem" className={preset===id?'active':''} onClick={()=>choose(id,value)}><span>{id}</span><b>{value} PAPER SOL</b></button>)}</div>}</div>
    <div className="dock-divider"/>
    <Link className={active==='spot'?'active':''} href="/"><Gauge size={14}/><span>Markets</span></Link>
    <Link className={active==='pulse'?'active':''} href="/pulse"><Radio size={14}/><span>Pulse</span></Link>
    <Link className={active==='portfolio'?'active':''} href="/portfolio"><BriefcaseBusiness size={14}/><span>Portfolio</span></Link>
    <Link className={active==='leaderboard'?'active':''} href="/leaderboards"><BarChart3 size={14}/><span>Leaderboard</span></Link>
    <Link className={active==='profile'?'active':''} href="/profile"><CircleUserRound size={14}/><span>Profile</span></Link>
    <div className="dock-spacer"/>
    <span className="dock-live"><i/> LIVE SOLANA</span>
    <Link href="/profile" title="Settings"><Settings2 size={14}/></Link>
  </footer>
}
