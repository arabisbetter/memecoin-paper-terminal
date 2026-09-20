'use client'

import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'

export default function NetworkStatus(){
  const [online,setOnline]=useState(true),[showBack,setShowBack]=useState(false)
  useEffect(()=>{
    let hideTimer:number|undefined
    const sync=()=>{const next=navigator.onLine;setOnline(next);if(next){setShowBack(true);if(hideTimer)window.clearTimeout(hideTimer);hideTimer=window.setTimeout(()=>setShowBack(false),2200)}}
    const start=window.setTimeout(()=>setOnline(navigator.onLine),0)
    window.addEventListener('online',sync);window.addEventListener('offline',sync)
    return()=>{clearTimeout(start);if(hideTimer)window.clearTimeout(hideTimer);window.removeEventListener('online',sync);window.removeEventListener('offline',sync)}
  },[])
  if(online&&!showBack)return null
  return <div className={'paper-network-state '+(online?'online':'offline')}>{online?<Wifi size={13}/>:<WifiOff size={13}/>}<span>{online?'Connection restored · live feeds resuming':'Offline · PAPER will reconnect automatically'}</span></div>
}
