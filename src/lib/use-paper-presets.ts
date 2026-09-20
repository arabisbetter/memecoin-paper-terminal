'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'
import { logClientError } from '@/lib/client-telemetry'

export type PaperPresetValues=[number,number,number,number]
export type PaperPresetId='P1'|'P2'|'P3'|'P4'
export const DEFAULT_PAPER_PRESETS:PaperPresetValues=[0.1,0.5,1,5]
const presetId=(value:string|null):PaperPresetId=>/^P[1-4]$/.test(value||'')?value as PaperPresetId:'P1'

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
  const [selectedId,setSelectedId]=useState<PaperPresetId>('P1')
  const [userId,setUserId]=useState('')
  const [ready,setReady]=useState(false)

  useEffect(()=>{
    const changed=(event:Event)=>{const detail=(event as CustomEvent<{values?:unknown}>).detail;if(detail?.values)setValues(clean(detail.values))}
    const selected=(event:Event)=>{const detail=(event as CustomEvent<{id?:string}>).detail;if(detail?.id&&/^P[1-4]$/.test(detail.id))setSelectedId(detail.id as PaperPresetId)}
    window.addEventListener('paper:presets-changed',changed)
    window.addEventListener('paper:preset',selected)
    return()=>{window.removeEventListener('paper:presets-changed',changed);window.removeEventListener('paper:preset',selected)}
  },[])

  useEffect(()=>{
    let alive=true
    const start=window.setTimeout(()=>{
      try{const local=JSON.parse(localStorage.getItem('paper.quickBuyPresets.v2')||'null');if(local&&alive)setValues(clean(local))}catch{}
      if(alive)setSelectedId(presetId(localStorage.getItem('paper.quickBuyPreset')))
      if(!supabase){if(alive)setReady(true);return}
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
        if(alive){
          const id=presetId(localStorage.getItem('paper.quickBuyPreset'))
          const index=Number(id.slice(1))-1
          setValues(next);setSelectedId(id)
          localStorage.setItem('paper.quickBuyPresets.v2',JSON.stringify(next))
          localStorage.setItem('paper.quickBuyPreset',id)
          localStorage.setItem('paper.quickBuySize',String(next[index]||next[0]))
        }
      }catch(error){
        void logClientError('presets',error,{stage:'load'})
      }finally{if(alive)setReady(true)}
      })()
    },0)
    return()=>{alive=false;clearTimeout(start)}
  },[supabase])

  const save=useCallback(async(nextValues:PaperPresetValues)=>{
    const next=clean(nextValues)
    setValues(next)
    localStorage.setItem('paper.quickBuyPresets.v2',JSON.stringify(next))
    const index=Number(selectedId.slice(1))-1
    const selectedValue=Number(next[index]||next[0])
    localStorage.setItem('paper.quickBuyPreset',selectedId)
    localStorage.setItem('paper.quickBuySize',String(selectedValue))
    window.dispatchEvent(new CustomEvent('paper:presets-changed',{detail:{values:next}}))
    window.dispatchEvent(new CustomEvent('paper:preset',{detail:{id:selectedId,value:selectedValue}}))
    if(!supabase||!userId)return next
    const {error}=await (supabase as any).from('paper_trade_presets').upsert({
      user_id:userId,p1:next[0],p2:next[1],p3:next[2],p4:next[3],updated_at:new Date().toISOString()
    },{onConflict:'user_id'})
    if(error){void logClientError('presets',error,{stage:'save'});throw error}
    return next
  },[supabase,userId,selectedId])

  const selectPreset=useCallback((input:PaperPresetId|number)=>{
    const index=typeof input==='number'?Math.max(0,Math.min(3,input)):Number(input.slice(1))-1
    const id=('P'+(index+1)) as PaperPresetId
    const value=Number(values[index]||0)
    if(!(value>0))return 0
    setSelectedId(id)
    localStorage.setItem('paper.quickBuyPreset',id)
    localStorage.setItem('paper.quickBuySize',String(value))
    window.dispatchEvent(new CustomEvent('paper:preset',{detail:{id,value}}))
    return value
  },[values])
  const selectedValue=Number(values[Number(selectedId.slice(1))-1]||values[0])

  return{values,save,ready,userId,selectedId,selectedValue,selectPreset}
}
