'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CircleDollarSign, Radio, UserRound } from 'lucide-react'
import PaperAccountChip from '@/components/PaperAccountChip'

const primary=[
  ['/spot','Spot',CircleDollarSign],
  ['/pulse','Pulse',Radio],
  ['/profile','Profile',UserRound],
] as const

export default function BottomDock(_props:{active:string}){
  const pathname=usePathname()
  const active=(href:string)=>pathname===href||pathname.startsWith(href+'/')
  return <footer className="ax-bottom-dock final-dock restored-feature-dock" aria-label="PAPER beta navigation">
    {primary.map(([href,label,Icon])=><Link key={href} aria-label={label} className={active(href)?'active':''} href={href}><Icon size={14}/><span>{label}</span></Link>)}
    <div className="dock-spacer"/>
    <PaperAccountChip/>
    <span className="dock-live"><i/> PAPER ONLY</span>
  </footer>
}
