'use client'

import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'

export default function NetworkStatus(){
  const [online,setOnline]=useState(true),[showBack,setShowBack]=useState(false)
  useEffect(()=>{
    const sync=()=>{const next=navigator.onLine;setOnline(next);if(next){setShowBack(true);window.setTimeout(()=>setShowBack(false),2200)}}
    setOnline(navigator.onLine)
    window.addEventListener('online',sync);window.addEventListener('offline',sync)
    return()=>{window.removeEventListener('online',sync);window.removeEventListener('offline',sync)}
  },[])
  if(online&&!showBack)return null
  return <div className={'paper-network-state '+(online?'online':'offline')}>{online?<Wifi size={13}/>:<WifiOff size={13}/>}<span>{online?'Connection restored · live feeds resuming':'Offline · PAPER will reconnect automatically'}</span></div>
}
