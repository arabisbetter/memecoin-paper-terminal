'use client'

import { useEffect } from 'react'

type Prefs={density?:'comfortable'|'compact';fontScale?:number}
function apply(){
  let p:Prefs={}
  try{p=JSON.parse(localStorage.getItem('paper.ui.preferences')||'{}')}catch{}
  document.body.classList.toggle('paper-density-compact',p.density==='compact')
  document.documentElement.style.setProperty('--paper-font-scale',String(Math.max(.9,Math.min(1.1,Number(p.fontScale||1)))))
}
export default function TerminalPreferences(){
  useEffect(()=>{apply();const on=()=>apply();window.addEventListener('paper:ui-preferences',on);window.addEventListener('storage',on);return()=>{window.removeEventListener('paper:ui-preferences',on);window.removeEventListener('storage',on)}},[])
  return null
}
