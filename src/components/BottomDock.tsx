'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity, Award, BarChart3, BookOpen, BriefcaseBusiness, CircleDollarSign, Gauge,
  Grid2X2, Layers3, MoreHorizontal, Radio, RotateCcw, ScanSearch,
  SlidersHorizontal, Star, Target, UserRound, WalletCards, Waves
} from 'lucide-react'
import PaperAccountChip from '@/components/PaperAccountChip'
import { usePaperPresets } from '@/lib/use-paper-presets'

const primary=[
  ['/discover','Markets',Gauge],
  ['/spot','Spot',CircleDollarSign],
  ['/pulse','Pulse',Radio],
  ['/chains','Chains',Layers3],
  ['/portfolio','Portfolio',BriefcaseBusiness],
  ['/watchlist','Watchlist',Star],
  ['/leaderboards','Leaderboard',BarChart3],
  ['/profile','Profile',UserRound],
] as const

const more=[
  ['/evaluation','Evaluation',Target],
  ['/rewards','Rewards',Award],
  ['/wallets','Wallet Tracker',WalletCards],
  ['/community','Community',Waves],
  ['/scanner','Scanner',ScanSearch],
  ['/smart-money','Smart Money',Activity],
  ['/heatmap','Heatmap',Grid2X2],
  ['/compare','Compare',Activity],
  ['/workspaces','Workspaces',Grid2X2],
  ['/journal','Journal',BookOpen],
  ['/replay','Replay',RotateCcw],
  ['/status','Status',Activity],
] as const

export default function BottomDock(_props:{active:string}){
  const pathname=usePathname()
  const {values,selectedId:preset,selectPreset}=usePaperPresets()
  const [presetOpen,setPresetOpen]=useState(false),[moreOpen,setMoreOpen]=useState(false)
  const presetRef=useRef<HTMLDivElement|null>(null),moreRef=useRef<HTMLDivElement|null>(null),moreMenuRef=useRef<HTMLDivElement|null>(null)

  useEffect(()=>{
    if(!presetOpen&&!moreOpen)return
    const onPointer=(event:PointerEvent)=>{
      const node=event.target as Node
      if(presetOpen&&presetRef.current&&!presetRef.current.contains(node))setPresetOpen(false)
      if(moreOpen&&moreRef.current&&!moreRef.current.contains(node)&&!moreMenuRef.current?.contains(node))setMoreOpen(false)
    }
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setPresetOpen(false);setMoreOpen(false)}}
    window.addEventListener('pointerdown',onPointer)
    window.addEventListener('keydown',onKey)
    return()=>{window.removeEventListener('pointerdown',onPointer);window.removeEventListener('keydown',onKey)}
  },[presetOpen,moreOpen])

  function choosePreset(index:number){
    const value=selectPreset(index)
    if(value>0)setPresetOpen(false)
  }
  const active=(href:string)=>pathname===href||pathname.startsWith(href+'/')

  return <><footer className="ax-bottom-dock final-dock restored-feature-dock" aria-label="PAPER navigation">
    <div className="dock-preset-wrap" ref={presetRef}>
      <button className="dock-preset" aria-expanded={presetOpen} aria-haspopup="menu" aria-label="Quick-buy presets" title="Quick-buy presets" onClick={()=>{setPresetOpen(v=>!v);setMoreOpen(false)}}><SlidersHorizontal size={14}/><b>{preset}</b></button>
      {presetOpen&&<div className="dock-preset-menu" role="menu" aria-label="Quick-buy preset values">{values.map((value,index)=><button key={index} role="menuitem" className={preset===`P${index+1}`?'active':''} onClick={()=>choosePreset(index)}><span>{`P${index+1}`}</span><b>{value} PAPER SOL</b></button>)}</div>}
    </div>
    <div className="dock-divider"/>
    {primary.map(([href,label,Icon])=><Link key={href} aria-label={label} className={active(href)?'active':''} href={href}><Icon size={14}/><span>{label}</span></Link>)}
    <div className="dock-more-wrap" ref={moreRef}>
      <button className={`dock-more ${more.some(([href])=>active(href))?'active':''}`} aria-label="More" aria-expanded={moreOpen} aria-haspopup="menu" onClick={()=>{setMoreOpen(v=>!v);setPresetOpen(false)}}><MoreHorizontal size={14}/><span>More</span></button>
    </div>
    <div className="dock-spacer"/>
    <PaperAccountChip/>
    <span className="dock-live"><i/> PAPER ONLY</span>
  </footer>{moreOpen&&typeof document!=='undefined'&&createPortal(<div className="dock-more-menu dock-more-menu-portal" ref={moreMenuRef} role="menu" aria-label="More PAPER tools">{more.map(([href,label,Icon])=><Link key={href} role="menuitem" className={active(href)?'active':''} href={href} onClick={()=>setMoreOpen(false)}><Icon size={14}/><span>{label}</span></Link>)}</div>,document.body)}</>
}
