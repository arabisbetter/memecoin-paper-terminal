'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import { logClientError } from '@/lib/client-telemetry'

export type PaperPresetValues=[number,number,number,number]
export const DEFAULT_PAPER_PRESETS:PaperPresetValues=[0.1,0.5,1,5]

const clean=(values:unknown):PaperPresetValues=>{
  const raw=Array.isArray(values)?values:[]
  const next=DEFAULT_PAPER_PRESETS.map((fallback,index)=>{
    const n=Number(raw[index])
    return Number.isFinite(n)&&n>0&&n<=100?n:fallback
  })
  return next as PaperPresetValues
}

export function usePaperPresets(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [values,setValues]=useState<PaperPresetValues>(DEFAULT_PAPER_PRESETS)
  const [userId,setUserId]=useState('')
  const [ready,setReady]=useState(false)

  useEffect(()=>{
    const changed=(event:Event)=>{const detail=(event as CustomEvent<{values?:unknown}>).detail;if(detail?.values)setValues(clean(detail.values))}
    window.addEventListener('paper:presets-changed',changed)
    return()=>window.removeEventListener('paper:presets-changed',changed)
  },[])

  useEffect(()=>{
    let alive=true
    try{
      const local=JSON.parse(localStorage.getItem('paper.quickBuyPresets.v2')||'null')
      if(local&&alive)setValues(clean(local))
    }catch{}
    if(!supabase){setReady(true);return}
    void(async()=>{
      try{
        const user=await ensurePaperUser(supabase)
        if(!alive)return
        setUserId(user.id)
        const {data,error}=await (supabase as any).from('paper_trade_presets').select('p1,p2,p3,p4').eq('user_id',user.id).maybeSingle()
        if(error)throw error
        const next=data?clean([data.p1,data.p2,data.p3,data.p4]):DEFAULT_PAPER_PRESETS
        if(!data){
          const {error:insertError}=await (supabase as any).from('paper_trade_presets').insert({user_id:user.id,p1:next[0],p2:next[1],p3:next[2],p4:next[3]})
          if(insertError)throw insertError
        }
        if(alive){setValues(next);localStorage.setItem('paper.quickBuyPresets.v2',JSON.stringify(next))}
      }catch(error){
        void logClientError('presets',error,{stage:'load'})
      }finally{if(alive)setReady(true)}
    })()
    return()=>{alive=false}
  },[supabase])

  const save=useCallback(async(nextValues:PaperPresetValues)=>{
    const next=clean(nextValues)
    setValues(next)
    localStorage.setItem('paper.quickBuyPresets.v2',JSON.stringify(next))
    const selected=localStorage.getItem('paper.quickBuyPreset')
    const index=selected&&/^P[1-4]$/.test(selected)?Number(selected.slice(1))-1:0
    localStorage.setItem('paper.quickBuySize',String(next[index]||next[0]))
    window.dispatchEvent(new CustomEvent('paper:presets-changed',{detail:{values:next}}))
    if(!supabase||!userId)return next
    const {error}=await (supabase as any).from('paper_trade_presets').upsert({
      user_id:userId,p1:next[0],p2:next[1],p3:next[2],p4:next[3],updated_at:new Date().toISOString()
    },{onConflict:'user_id'})
    if(error){void logClientError('presets',error,{stage:'save'});throw error}
    return next
  },[supabase,userId])

  return{values,save,ready,userId}
}
