'use client'

import { useEffect } from 'react'

export default function PwaRegistrar(){
  useEffect(()=>{
    if(!('serviceWorker' in navigator)||location.protocol!=='https:')return
    let active=true
    const register=async()=>{
      try{
        const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'})
        if(!active)return
        registration.update().catch(()=>{})
      }catch{}
    }
    void register()
    return()=>{active=false}
  },[])
  return null
}
