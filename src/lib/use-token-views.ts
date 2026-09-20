'use client'

import { useEffect, useRef, useState } from 'react'
import { logClientError } from '@/lib/client-telemetry'

export type TokenViewerStats={
  byMint:Record<string,number>
  total:number
  windowMinutes:number
  ready:boolean
}

export function useTokenViewers(mints:string[]=[],refreshMs=7000):TokenViewerStats{
  const [stats,setStats]=useState<TokenViewerStats>({byMint:{},total:0,windowMinutes:15,ready:false})
  const errorReported=useRef(false)
  const mintKey=[...new Set(mints.filter(Boolean))].sort().slice(0,80).join('|')

  useEffect(()=>{
    let alive=true,busy=false
    const refresh=async()=>{
      if(busy||document.hidden)return
      busy=true
      try{
        const list=mintKey?mintKey.split('|'):[]
        const query=list.length?'?mints='+encodeURIComponent(list.join(',')):''
        const response=await fetch('/api/viewers'+query,{cache:'no-store'})
        const body=await response.json().catch(()=>null)
        if(!response.ok)throw new Error(body?.error||'viewer service unavailable')
        const byMint:Record<string,number>={}
        for(const mint of list)byMint[mint]=Number(body?.byMint?.[mint]||0)
        if(alive)setStats({byMint,total:Number(body?.viewerTotal||0),windowMinutes:Number(body?.windowMinutes||15),ready:true})
        errorReported.current=false
      }catch(error){
        if(alive)setStats(current=>({...current,ready:true}))
        if(!errorReported.current){errorReported.current=true;void logClientError('viewers',error,{mints:mintKey?mintKey.split('|').length:0})}
      }finally{busy=false}
    }
    void refresh()
    const id=window.setInterval(()=>void refresh(),Math.max(5000,refreshMs))
    const changed=()=>void refresh()
    const visible=()=>{if(!document.hidden)void refresh()}
    window.addEventListener('paper:token-view-changed',changed)
    document.addEventListener('visibilitychange',visible)
    return()=>{alive=false;clearInterval(id);window.removeEventListener('paper:token-view-changed',changed);document.removeEventListener('visibilitychange',visible)}
  },[mintKey,refreshMs])

  return stats
}

export function useTokenViews(mints:string[],refreshMs=7000){
  return useTokenViewers(mints,refreshMs).byMint
}
