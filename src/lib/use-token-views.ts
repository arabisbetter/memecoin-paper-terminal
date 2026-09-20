'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { logClientError } from '@/lib/client-telemetry'

export function useTokenViews(mints:string[],refreshMs=10000){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [views,setViews]=useState<Record<string,number>>({})
  const errorReported=useRef(false)
  const mintKey=[...new Set(mints.filter(Boolean))].sort().join('|')

  useEffect(()=>{
    const list=mintKey?mintKey.split('|'):[]
    if(!supabase||!list.length)return
    let alive=true,busy=false
    const refresh=async()=>{
      if(busy||document.hidden)return
      busy=true
      try{
        const {data,error}=await supabase.from('token_view_totals').select('mint_address,views').in('mint_address',list)
        if(error)throw error
        const next:Record<string,number>={}
        for(const mint of list)next[mint]=0
        for(const row of data||[])next[String(row.mint_address)]=Number(row.views||0)
        if(alive)setViews(next)
        errorReported.current=false
      }catch(error){
        if(!errorReported.current){errorReported.current=true;void logClientError('views',error,{mints:list.length})}
      }finally{busy=false}
    }
    void refresh()
    const id=window.setInterval(()=>void refresh(),Math.max(5000,refreshMs))
    const changed=()=>void refresh()
    const visible=()=>{if(!document.hidden)void refresh()}
    window.addEventListener('paper:token-view-changed',changed)
    document.addEventListener('visibilitychange',visible)
    return()=>{alive=false;clearInterval(id);window.removeEventListener('paper:token-view-changed',changed);document.removeEventListener('visibilitychange',visible)}
  },[supabase,mintKey,refreshMs])

  return views
}
