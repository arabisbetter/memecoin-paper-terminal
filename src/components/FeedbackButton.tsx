'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ensurePaperUser } from '@/lib/paper-session'

export default function FeedbackButton(){
  const supabase=useMemo(()=>{try{return createClient()}catch{return null}},[])
  const [open,setOpen]=useState(false),[message,setMessage]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false)
  async function submit(){
    const clean=message.trim()
    if(clean.length<3){setStatus('Tell us what went wrong or what you want changed.');return}
    if(!supabase){setStatus('Feedback service is unavailable.');return}
    setBusy(true);setStatus('')
    try{
      const user=await ensurePaperUser(supabase)
      const {error}=await (supabase as any).from('paper_feedback').insert({user_id:user.id,page:window.location.pathname,message:clean,user_agent:navigator.userAgent})
      if(error)throw error
      setMessage('');setStatus('Sent. Thank you.');setTimeout(()=>{setOpen(false);setStatus('')},900)
    }catch(error){console.error('paper_feedback_error',error);setStatus(error instanceof Error?error.message:'Could not send feedback.')}
    finally{setBusy(false)}
  }
  return <>{<button type="button" className="feedback-launcher" aria-label="Feedback" onClick={()=>setOpen(true)}>Feedback</button>}{open&&<div className="feedback-backdrop" role="dialog" aria-modal="true" aria-label="Send feedback"><div className="feedback-card"><div><b>Send feedback</b><p>Report a broken control, confusing flow, or visual issue.</p></div><textarea autoFocus maxLength={2000} placeholder="What happened?" value={message} onChange={e=>setMessage(e.target.value)}/>{status&&<div className="profile-message">{status}</div>}<div className="feedback-actions"><button type="button" onClick={()=>setOpen(false)}>Cancel</button><button type="button" disabled={busy} onClick={()=>void submit()}>{busy?'Sending…':'Send feedback'}</button></div></div></div>}</>
}
