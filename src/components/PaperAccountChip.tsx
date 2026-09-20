'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Account={cash_usd:number;starting_balance_usd:number}
export default function PaperAccountChip(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [account,setAccount]=useState<Account|null>(null),[solUsd,setSolUsd]=useState(0),[loading,setLoading]=useState(true)
  const loadSeq=useRef(0)
  const load=useCallback(async()=>{
    if(!supabase)return
    const seq=++loadSeq.current
    try{
      const {data:{user}}=await supabase.auth.getUser();if(!user)return
      const [{data:a},solRes]=await Promise.all([supabase.from('paper_accounts').select('cash_usd,starting_balance_usd').eq('user_id',user.id).maybeSingle(),fetch('/api/market/sol',{cache:'no-store'}).catch(()=>null)])
      if(seq!==loadSeq.current)return
      if(a)setAccount(a as Account)
      if(solRes?.ok){const j=await solRes.json().catch(()=>null);if(seq===loadSeq.current)setSolUsd(Number(j?.priceUsd||0))}
    }finally{if(seq===loadSeq.current)setLoading(false)}
  },[supabase])
  useEffect(()=>{void load();const id=setInterval(()=>{if(!document.hidden)void load()},10000),changed=()=>void load();window.addEventListener('paper:account-changed',changed);return()=>{clearInterval(id);window.removeEventListener('paper:account-changed',changed)}},[load])
  if(loading&&!account)return <span className="dock-paper-account">Starting PAPER…</span>
  if(!account)return null
  const cash=Number(account.cash_usd||0),solEq=solUsd>0?cash/solUsd:0
  return <span className="dock-paper-account" title="PAPER buying power · SOL is informational only"><b>${cash.toFixed(2)} PAPER</b>{solEq>0&&<small>≈ {solEq.toFixed(3)} SOL</small>}</span>
}
