'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  BarChart3, BookOpen, BriefcaseBusiness, CircleDollarSign, Gift, Gauge,
  Grid2X2, Layers3, MoreHorizontal, Radio, ScanSearch, ShieldCheck,
  SlidersHorizontal, Star, Trophy, WalletCards, Waves, Activity, RotateCcw
} from 'lucide-react'
import PaperAccountChip from '@/components/PaperAccountChip'
import { usePaperPresets } from '@/lib/use-paper-presets'

const primary=[
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

const more=[
  ['/community','Community',Waves],
  ['/scanner','Scanner',ScanSearch],
  ['/heatmap','Heatmap',Grid2X2],
  ['/compare','Compare',Activity],
  ['/journal','Journal',BookOpen],
  ['/replay','Replay',RotateCcw],
  ['/smart-money','Smart Money',Activity],
  ['/workspaces','Workspaces',Grid2X2],
  ['/status','Status',Activity],
] as const

export default function BottomDock(_props:{active:string}){
  const pathname=usePathname()
  const {values}=usePaperPresets()
  const [preset,setPreset]=useState('P1'),[presetOpen,setPresetOpen]=useState(false),[moreOpen,setMoreOpen]=useState(false)
  const presetRef=useRef<HTMLDivElement|null>(null),moreRef=useRef<HTMLDivElement|null>(null)

  useEffect(()=>{
    const saved=localStorage.getItem('paper.quickBuyPreset')
    if(saved&&/^P[1-4]$/.test(saved))setPreset(saved)
  },[])

  useEffect(()=>{
    if(!presetOpen&&!moreOpen)return
    const onPointer=(event:PointerEvent)=>{
      const node=event.target as Node
      if(presetOpen&&presetRef.current&&!presetRef.current.contains(node))setPresetOpen(false)
      if(moreOpen&&moreRef.current&&!moreRef.current.contains(node))setMoreOpen(false)
    }
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setPresetOpen(false);setMoreOpen(false)}}
    window.addEventListener('pointerdown',onPointer)
    window.addEventListener('keydown',onKey)
    return()=>{window.removeEventListener('pointerdown',onPointer);window.removeEventListener('keydown',onKey)}
  },[presetOpen,moreOpen])

  function choosePreset(index:number){
    const id='P'+(index+1),value=Number(values[index]||0)
    if(!value)return
    setPreset(id);setPresetOpen(false)
    localStorage.setItem('paper.quickBuyPreset',id)
    localStorage.setItem('paper.quickBuySize',String(value))
    window.dispatchEvent(new CustomEvent('paper:preset',{detail:{id,value}}))
  }
  const active=(href:string)=>href==='/'?pathname==='/' : pathname===href||pathname.startsWith(href+'/')

  return <footer className="ax-bottom-dock final-dock restored-feature-dock">
    <div className="dock-preset-wrap" ref={presetRef}>
      <button className="dock-preset" aria-expanded={presetOpen} aria-haspopup="menu" title="Quick-buy presets" onClick={()=>{setPresetOpen(v=>!v);setMoreOpen(false)}}><SlidersHorizontal size={14}/><b>{preset}</b></button>
      {presetOpen&&<div className="dock-preset-menu" role="menu">{values.map((value,index)=><button key={index} role="menuitem" className={preset===`P${index+1}`?'active':''} onClick={()=>choosePreset(index)}><span>{`P${index+1}`}</span><b>{value} SOL</b></button>)}</div>}
    </div>
    <div className="dock-divider"/>
    {primary.map(([href,label,Icon])=><Link key={href} className={active(href)?'active':''} href={href}><Icon size={14}/><span>{label}</span></Link>)}
    <div className="dock-more-wrap" ref={moreRef}>
      <button className={`dock-more ${more.some(([href])=>active(href))?'active':''}`} aria-expanded={moreOpen} aria-haspopup="menu" onClick={()=>{setMoreOpen(v=>!v);setPresetOpen(false)}}><MoreHorizontal size={14}/><span>More</span></button>
      {moreOpen&&<div className="dock-more-menu" role="menu">{more.map(([href,label,Icon])=><Link key={href} role="menuitem" className={active(href)?'active':''} href={href} onClick={()=>setMoreOpen(false)}><Icon size={14}/><span>{label}</span></Link>)}</div>}
    </div>
    <div className="dock-spacer"/>
    <PaperAccountChip/>
    <span className="dock-live"><i/> LIVE</span>
  </footer>
}
