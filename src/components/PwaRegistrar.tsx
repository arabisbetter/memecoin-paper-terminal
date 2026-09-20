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
        let release=''
        let reloading=false
        const checkRelease=async()=>{
          try{
            const response=await fetch('/api/version',{cache:'no-store'})
            if(!response.ok)return
            const body=await response.json()
            const next=String(body?.commit||'')
            if(!next||next==='local')return
            if(!release){release=next;return}
            if(next!==release&&!reloading){reloading=true;location.reload()}
          }catch{}
        }
        void checkRelease()
        const versionTimer=window.setInterval(()=>void checkRelease(),45000)
        if(!active)window.clearInterval(versionTimer)
      }catch{}
    }
    void register()
    return()=>{active=false}
  },[])
  return null
}
