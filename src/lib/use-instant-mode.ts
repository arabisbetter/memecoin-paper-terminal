'use client'

import { useCallback, useEffect, useState } from 'react'

export function useInstantMode(){
  const [instantMode,setInstantState]=useState(false)
  useEffect(()=>{
    const start=window.setTimeout(()=>setInstantState(localStorage.getItem('paper.instantMode')==='1'),0)
    const onChange=(event:Event)=>{const detail=(event as CustomEvent<{enabled:boolean}>).detail;if(detail)setInstantState(Boolean(detail.enabled))}
    const onStorage=(event:StorageEvent)=>{if(event.key==='paper.instantMode')setInstantState(event.newValue==='1')}
    window.addEventListener('paper:instant-mode',onChange);window.addEventListener('storage',onStorage)
    return()=>{clearTimeout(start);window.removeEventListener('paper:instant-mode',onChange);window.removeEventListener('storage',onStorage)}
  },[])
  const setInstantMode=useCallback((enabled:boolean)=>{setInstantState(enabled);localStorage.setItem('paper.instantMode',enabled?'1':'0');window.dispatchEvent(new CustomEvent('paper:instant-mode',{detail:{enabled}}))},[])
  return [instantMode,setInstantMode] as const
}
