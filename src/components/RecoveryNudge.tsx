'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function RecoveryNudge(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [show,setShow]=useState(false)
  useEffect(()=>{
    if(!supabase||localStorage.getItem('paper.recoveryNudgeDismissed')==='1')return
    let alive=true
    async function check(){
      const {data:{user}}=await supabase.auth.getUser()
      if(!alive||!user||user.email)return
      const {count}=await supabase.from('paper_trades').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('accounting_version','usd_v2')
      if(alive&&(count||0)>0)setShow(true)
    }
    void check()
    const handler=()=>void check();window.addEventListener('paper:account-changed',handler)
    return()=>{alive=false;window.removeEventListener('paper:account-changed',handler)}
  },[supabase])
  if(!show)return null
  return <aside className="recovery-nudge"><div><b>Protect your PAPER account</b><span>If you clear browser data before adding a recovery method, this anonymous account and its PAPER history cannot be restored.</span></div><span className="recovery-profile-hint">Open Profile in the header to add a recovery email.</span><button aria-label="Dismiss recovery reminder" onClick={()=>{localStorage.setItem('paper.recoveryNudgeDismissed','1');setShow(false)}}>×</button></aside>
}
