'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  BarChart3, BriefcaseBusiness, CircleDollarSign, Gift, Gauge, Layers3,
  Radio, ShieldCheck, SlidersHorizontal, Star, Trophy, WalletCards
} from 'lucide-react'
import PaperAccountChip from '@/components/PaperAccountChip'
import { usePaperPresets } from '@/lib/use-paper-presets'

const links=[
  ['/discover','Markets',Gauge],
  ['/spot','Trade',CircleDollarSign],
  ['/evaluation','Evaluation',Trophy],
  ['/funded','Funded',ShieldCheck],
  ['/pulse','Pulse',Radio],
  ['/chains','Chains',Layers3],
  ['/portfolio','Portfolio',BriefcaseBusiness],
  ['/wallets','Wallets',WalletCards],
  ['/watchlist','Watchlist',Star],
  ['/rewards','Rewards',Gift],
  ['/leaderboards','Leaderboard',BarChart3],
  ['/coin','Coin',CircleDollarSign],
] as const

export default function BottomDock(_props:{active:string}){
  const pathname=usePathname()
  const {values}=usePaperPresets()
  const [open,setOpen]=useState(false),[preset,setPreset]=useState('P1')
  const wrapRef=useRef<HTMLDivElement|null>(null)

  useEffect(()=>{
    const saved=localStorage.getItem('paper.quickBuyPreset')
    if(saved&&/^P[1-4]$/.test(saved))setPreset(saved)
  },[])

  useEffect(()=>{
    if(!open)return
    const onPointer=(event:PointerEvent)=>{
      if(wrapRef.current&&!wrapRef.current.contains(event.target as Node))setOpen(false)
    }
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)}
    window.addEventListener('pointerdown',onPointer)
    window.addEventListener('keydown',onKey)
    return()=>{window.removeEventListener('pointerdown',onPointer);window.removeEventListener('keydown',onKey)}
  },[open])

  function choose(index:number){
    const id=`P${index+1}`,value=Number(values[index]||0)
    if(!value)return
    setPreset(id);setOpen(false)
    localStorage.setItem('paper.quickBuyPreset',id)
    localStorage.setItem('paper.quickBuySize',String(value))
    window.dispatchEvent(new CustomEvent('paper:preset',{detail:{id,value}}))
  }

  const active=(href:string)=>pathname===href||pathname.startsWith(href+'/')

  return <footer className="ax-bottom-dock final-dock">
    <div className="dock-preset-wrap" ref={wrapRef}>
      <button className="dock-preset" aria-expanded={open} aria-haspopup="menu" title="Quick-buy presets" onClick={()=>setOpen(v=>!v)}>
        <SlidersHorizontal size={14}/><b>{preset}</b>
      </button>
      {open&&<div className="dock-preset-menu" role="menu">
        {values.map((value,index)=><button key={index} role="menuitem" className={preset===`P${index+1}`?'active':''} onClick={()=>choose(index)}>
          <span>{`P${index+1}`}</span><b>{value} SOL</b>
        </button>)}
      </div>}
    </div>
    <div className="dock-divider"/>
    {links.map(([href,label,Icon])=><Link key={href} className={active(href)?'active':''} href={href}><Icon size={14}/><span>{label}</span></Link>)}
    <div className="dock-spacer"/>
    <PaperAccountChip/>
    <span className="dock-live"><i/> LIVE</span>
  </footer>
}
